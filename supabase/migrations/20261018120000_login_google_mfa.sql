-- =============================================================================
-- Login exclusivamente pelo Google e verificação em duas etapas (MFA) no banco.
--
-- NÃO APLICADA em produção: aguarda aprovação explícita (DEV-02). Aplicar logo DEPOIS
-- do merge da tela nova (docs/especificacoes/login-google-mfa.md, seção 4).
--
-- Base: docs/especificacoes/login-google-mfa.md (adaptação, para esta SPA, da
-- especificação "Login com conta Google e verificação em duas etapas").
--
-- O login pelo Google em si é configuração do Supabase Auth (provedor Google,
-- cadastro aberto desligado, provedor de e-mail e senha desligado): ver
-- docs/seguranca/pendencias-humanas.md. Aqui ficam as regras que a API REST do
-- Supabase não pode contornar (M-05 da especificação):
--  1. sessao_aal2(): a sessão concluiu o segundo fator (claim "aal" do token);
--  2. mfa_pendente(): a pessoa tem autenticador ativo e a sessão ainda é aal1.
--     Enquanto isso, as funções de sessão (usuario_ativo, usuario_admin,
--     usuario_atual_id, estabelecimento_atual) respondem "sem acesso": nenhum dado
--     do estabelecimento aparece antes do código (M-06);
--  3. mfa_recente(segundos): o código foi digitado há pouco (claim "amr" do token),
--     para ação crítica (M-04): excluir estabelecimento no painel global;
--  4. alteração de permissão na equipe (papel, status, vínculo de login, nova
--     administradora) exige aal2 (M-01); logs de acesso só com aal2;
--  5. auditoria aceita os eventos de MFA (A-01).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Nível da sessão
-- -----------------------------------------------------------------------------

create or replace function public.sessao_aal2()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- Tem autenticador confirmado e ainda não digitou o código nesta sessão.
create or replace function public.mfa_pendente()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not public.sessao_aal2()
     and exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;

-- O código do autenticador foi confirmado nos últimos p_segundos (claim "amr").
create or replace function public.mfa_recente(p_segundos integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.sessao_aal2() and coalesce((
    select bool_or((m ->> 'timestamp')::numeric >= extract(epoch from now()) - p_segundos)
      from jsonb_array_elements(
             case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) m
     where jsonb_typeof(m) = 'object' and m ->> 'method' = 'totp'
       and (m ->> 'timestamp') ~ '^[0-9]{1,12}(\.[0-9]+)?$'), false);
$$;

revoke all on function public.sessao_aal2() from public, anon;
grant execute on function public.sessao_aal2() to authenticated;
revoke all on function public.mfa_pendente() from public, anon;
grant execute on function public.mfa_pendente() to authenticated;
revoke all on function public.mfa_recente(integer) from public, anon;
grant execute on function public.mfa_recente(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Funções de sessão: com MFA pendente, nada do estabelecimento aparece (M-06)
-- -----------------------------------------------------------------------------

create or replace function public.estabelecimento_atual()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.estabelecimento_id
    from public.users u
    join public.estabelecimentos e on e.id = u.estabelecimento_id and e.status = 'ativo'
   where u.auth_id = auth.uid() and u.active is true and not public.mfa_pendente()
   limit 1;
$$;

create or replace function public.usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
      join public.estabelecimentos e on e.id = u.estabelecimento_id and e.status = 'ativo'
     where u.auth_id = auth.uid() and u.active is true)
     and not public.mfa_pendente();
$$;

create or replace function public.usuario_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
      join public.estabelecimentos e on e.id = u.estabelecimento_id and e.status = 'ativo'
     where u.auth_id = auth.uid() and u.active is true and u.role = 'admin')
     and not public.mfa_pendente();
$$;

create or replace function public.usuario_atual_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id from public.users u
    join public.estabelecimentos e on e.id = u.estabelecimento_id and e.status = 'ativo'
   where u.auth_id = auth.uid() and u.active is true and not public.mfa_pendente()
   limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 3. Ações administrativas exigem aal2 (M-01)
-- -----------------------------------------------------------------------------

-- Logs de acesso: só administradora com o segundo fator confirmado nesta sessão.
drop policy if exists "access_logs: select" on public.access_logs;
create policy "access_logs: select" on public.access_logs
  for select to authenticated using (public.usuario_admin() and public.sessao_aal2());

-- Permissões da equipe: papel, status, vínculo de login e nova administradora.
-- Sem sessão (Edge Function com a chave de serviço, que confere o aal2 antes) passa;
-- quem não é administradora segue para o RLS, que já recusa.
create or replace function public.users_exige_mfa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.sessao_aal2() or not public.usuario_admin() then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.role = 'admin' or new.auth_id is not null))
     or (tg_op = 'UPDATE' and (new.role is distinct from old.role
                               or new.active is distinct from old.active
                               or new.auth_id is distinct from old.auth_id)) then
    raise exception 'mfa_requerido' using errcode = '42501',
      hint = 'Confirme o código do autenticador em Configurações > Segurança.';
  end if;
  return new;
end;
$$;

revoke all on function public.users_exige_mfa() from public, anon, authenticated;

drop trigger if exists users_b_exige_mfa on public.users;
create trigger users_b_exige_mfa
  before insert or update on public.users
  for each row execute function public.users_exige_mfa();

-- -----------------------------------------------------------------------------
-- 4. Excluir estabelecimento pede o código na hora (M-04): até 5 minutos
-- -----------------------------------------------------------------------------

create or replace function public.admin_global_atualizar_estabelecimento(
  p_id uuid, p_nome text, p_plano text, p_status text, p_demo_expira_em timestamptz,
  p_max_profissionais integer, p_max_clientes integer
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.eh_admin_global() then
    raise exception 'so_admin_global' using errcode = '42501';
  end if;
  if p_status <> 'ativo' and exists (select 1 from public.users where estabelecimento_id = p_id and auth_id = auth.uid()) then
    raise exception 'nao_desativa_o_proprio' using errcode = 'P0001';
  end if;
  if p_status = 'excluido'
     and exists (select 1 from public.estabelecimentos where id = p_id and status <> 'excluido')
     and not public.mfa_recente(300) then
    raise exception 'mfa_codigo_requerido' using errcode = '42501';
  end if;
  update public.estabelecimentos set
    nome = btrim(p_nome),
    plano = p_plano,
    status = p_status,
    demo_expira_em = case when p_plano = 'demonstracao' then p_demo_expira_em end,
    max_profissionais = p_max_profissionais,
    max_clientes = p_max_clientes,
    desativado_em = case when p_status = 'desativado' then coalesce(desativado_em, now()) when p_status = 'ativo' then null else desativado_em end,
    excluido_em = case when p_status = 'excluido' then coalesce(excluido_em, now()) when p_status = 'ativo' then null else excluido_em end,
    updated_at = now()
  where id = p_id;
  if not found then
    raise exception 'estabelecimento_nao_encontrado' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.admin_global_atualizar_estabelecimento(uuid, text, text, text, timestamptz, integer, integer) from public, anon;
grant execute on function public.admin_global_atualizar_estabelecimento(uuid, text, text, text, timestamptz, integer, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Auditoria dos eventos de login e MFA (A-01)
-- -----------------------------------------------------------------------------

alter table public.access_logs drop constraint if exists access_logs_acao_check;
alter table public.access_logs add constraint access_logs_acao_check check (acao in (
  'login', 'login_negado', 'logout', 'usuario_criado', 'permissao_alterada', 'alterou', 'excluiu',
  'fechamento_gerado', 'fechamento_assinado', 'fechamento_contestado', 'fechamento_cancelado',
  'pacote_vendido', 'pacote_renovado', 'pacote_anulado', 'estabelecimento_criado',
  'mfa_ativado', 'mfa_verificado', 'mfa_falhou', 'mfa_removido'
));

-- Mesmo com o MFA pendente (código errado na tela de verificação), o evento fica no
-- estabelecimento da pessoa, para a administradora ver na trilha.
create or replace function public.auditoria_gravar(p_acao text, p_entidade text, p_entidade_id text, p_detalhes jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cab jsonb;
  v_ip text;
begin
  begin
    v_cab := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_cab := null;
  end;
  v_ip := coalesce(
    v_cab ->> 'cf-connecting-ip',
    btrim(split_part(v_cab ->> 'x-forwarded-for', ',', 1)),
    v_cab ->> 'x-real-ip'
  );
  insert into public.access_logs (auth_id, user_id, acao, entidade, entidade_id, detalhes, ip, user_agent, estabelecimento_id)
  values (
    auth.uid(),
    (select id from public.users where auth_id = auth.uid() limit 1),
    p_acao,
    p_entidade,
    left(p_entidade_id, 80),
    p_detalhes,
    left(nullif(v_ip, ''), 64),
    left(v_cab ->> 'user-agent', 300),
    coalesce(public.estabelecimento_atual(),
             (select estabelecimento_id from public.users where auth_id = auth.uid() limit 1))
  );
end;
$$;

-- A tela informa só o evento; quem, quando e de onde vêm da sessão e da requisição.
create or replace function public.registrar_auditoria(p_acao text, p_detalhes jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if p_acao is null or p_acao not in ('login', 'login_negado', 'logout', 'mfa_ativado', 'mfa_verificado', 'mfa_falhou', 'mfa_removido') then
    raise exception 'Evento de auditoria inválido.';
  end if;
  if p_detalhes is not null and (jsonb_typeof(p_detalhes) <> 'object' or octet_length(p_detalhes::text) > 500) then
    raise exception 'Evento de auditoria inválido.';
  end if;
  perform public.auditoria_gravar(p_acao, 'sessao', null, p_detalhes);
end;
$$;

revoke all on function public.registrar_auditoria(text, jsonb) from public, anon;
grant execute on function public.registrar_auditoria(text, jsonb) to authenticated;

commit;
