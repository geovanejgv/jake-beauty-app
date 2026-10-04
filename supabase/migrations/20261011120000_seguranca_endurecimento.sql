-- =============================================================================
-- Segurança: endurecimento do banco (docs/seguranca/requisitos.md)
--
-- APLICADA em produção em 2026-10-04 com aprovação explícita do usuário (DEV-02),
-- depois de o SQL completo ser mostrado na conversa. Conferências do fim do
-- arquivo: 0 tabelas sem RLS, 0 políticas abertas, 0 funções executáveis por anon.
--
-- O que muda:
--  1. Funções de contexto: usuario_ativo() e usuario_admin(). Perfil inativo
--     (users.active = false) ou conta sem perfil perde o acesso na hora (AUZ-01).
--  2. Políticas: "using (true)" sai de todas as tabelas (AUZ-04).
--     - tabelas do negócio e do Kanban: só usuário com perfil ativo;
--     - personal_finances (finanças pessoais): só administradora;
--     - users (equipe e papéis): todos os ativos leem; só administradora cria,
--       altera e exclui (AUZ-06, AUZ-08).
--  3. kanban_usuario_atual() não cria mais perfil sozinho para qualquer conta
--     que fizer login: sem perfil ativo = "Acesso ainda não liberado.".
--  4. Trilha de auditoria somente inserção (LOG-05, LOG-06): tabela access_logs,
--     gatilhos de exclusão/alteração/permissão e a função registrar_auditoria()
--     para login, login negado e logout. Ninguém altera nem apaga registro.
--  5. Funções fechadas para visitante sem sessão (anon) e para PUBLIC.
--
-- Nada é apagado: as políticas antigas são renomeadas e reescritas (alter
-- policy), sem drop. Usuário real conferido antes: 1 perfil admin ativo
-- vinculado à conta de login (não há risco de ficar sem acesso).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Funções de contexto da sessão (security definer + search_path fixo)
-- -----------------------------------------------------------------------------
create or replace function public.usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.users where auth_id = auth.uid() and active is true);
$$;

create or replace function public.usuario_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.users where auth_id = auth.uid() and active is true and role = 'admin');
$$;

-- -----------------------------------------------------------------------------
-- 2. Políticas (renomeadas e reescritas, sem drop)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  -- Política única FOR ALL com using + with check: vale para select, insert,
  -- update (com with check) e delete.
  foreach t in array array[
    'appointments', 'clients', 'commissions', 'expenses', 'manual_incomes',
    'products', 'service_products', 'services', 'transactions'
  ] loop
    execute format('alter policy %I on public.%I rename to %I', t || ': acesso de usuários logados', t, t || ': usuários ativos');
    execute format('alter policy %I on public.%I to authenticated using (public.usuario_ativo()) with check (public.usuario_ativo())', t || ': usuários ativos', t);
  end loop;

  -- Kanban: políticas por operação já existentes
  foreach t in array array['internal_tasks', 'tarefa_itens'] loop
    execute format('alter policy %I on public.%I using (public.usuario_ativo())', t || ': select', t);
    execute format('alter policy %I on public.%I with check (public.usuario_ativo())', t || ': insert', t);
    execute format('alter policy %I on public.%I using (public.usuario_ativo()) with check (public.usuario_ativo())', t || ': update', t);
    execute format('alter policy %I on public.%I using (public.usuario_ativo())', t || ': delete', t);
  end loop;
  foreach t in array array['kanban_quadros', 'kanban_colunas'] loop
    execute format('alter policy %I on public.%I using (public.usuario_ativo())', t || ': select', t);
  end loop;
end;
$$;

-- Finanças pessoais: só a administradora.
alter policy "personal_finances: acesso de usuários logados" on public.personal_finances
  rename to "personal_finances: administradora";
alter policy "personal_finances: administradora" on public.personal_finances
  to authenticated using (public.usuario_admin()) with check (public.usuario_admin());

-- Equipe e papéis: todos os ativos leem; só a administradora grava.
alter policy "users: acesso de usuários logados" on public.users
  rename to "users: administradora gerencia";
alter policy "users: administradora gerencia" on public.users
  to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "users: select" on public.users
  for select to authenticated using (public.usuario_ativo());

-- -----------------------------------------------------------------------------
-- 3. Kanban: sem criação automática de perfil
-- -----------------------------------------------------------------------------
create or replace function public.kanban_usuario_atual()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  select id into v_id from public.users where auth_id = auth.uid() and active is true;
  if v_id is null then
    raise exception 'Acesso ainda não liberado.';
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Trilha de auditoria somente inserção
-- -----------------------------------------------------------------------------
create table public.access_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  auth_id uuid,                       -- conta de login (auth.users), quando houver
  user_id uuid,                       -- perfil (public.users), sem FK: o registro sobrevive à exclusão do perfil
  acao text not null check (acao in (
    'login', 'login_negado', 'logout', 'usuario_criado', 'permissao_alterada', 'alterou', 'excluiu'
  )),
  entidade text not null check (char_length(entidade) between 1 and 60),
  entidade_id text check (char_length(entidade_id) <= 80),
  detalhes jsonb check (detalhes is null or octet_length(detalhes::text) <= 2000),
  ip text check (char_length(ip) <= 64),
  user_agent text check (char_length(user_agent) <= 300)
);
alter table public.access_logs enable row level security;

create index access_logs_created_at_idx on public.access_logs (created_at desc);

-- Leitura só pela administradora. Não há política de insert/update/delete:
-- a gravação é feita só pelas funções abaixo (dono da tabela).
create policy "access_logs: select" on public.access_logs
  for select to authenticated using (public.usuario_admin());

revoke all on public.access_logs from anon, authenticated, service_role;
grant select on public.access_logs to authenticated;
grant select, insert on public.access_logs to service_role;

create or replace function public.bloquear_alteracao_auditoria()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'access_logs é somente inserção (LOG-06)';
end;
$$;

create trigger access_logs_somente_insercao
  before update or delete on public.access_logs
  for each row execute function public.bloquear_alteracao_auditoria();
create trigger access_logs_sem_truncate
  before truncate on public.access_logs
  for each statement execute function public.bloquear_alteracao_auditoria();

-- Grava um evento com quem (sessão), quando e de onde (cabeçalhos da requisição).
-- Interna: chamada só pelos gatilhos e por registrar_auditoria().
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
  insert into public.access_logs (auth_id, user_id, acao, entidade, entidade_id, detalhes, ip, user_agent)
  values (
    auth.uid(),
    (select id from public.users where auth_id = auth.uid() limit 1),
    p_acao,
    p_entidade,
    left(p_entidade_id, 80),
    p_detalhes,
    left(nullif(v_ip, ''), 64),
    left(v_cab ->> 'user-agent', 300)
  );
end;
$$;

-- Chamada pela tela no login, login sem acesso liberado e logout.
-- Só aceita esses três eventos; os demais são gravados pelos gatilhos.
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
  if p_acao is null or p_acao not in ('login', 'login_negado', 'logout') then
    raise exception 'Evento de auditoria inválido.';
  end if;
  if p_detalhes is not null and (jsonb_typeof(p_detalhes) <> 'object' or octet_length(p_detalhes::text) > 500) then
    raise exception 'Evento de auditoria inválido.';
  end if;
  perform public.auditoria_gravar(p_acao, 'sessao', null, p_detalhes);
end;
$$;

-- Gatilho: exclusões em todas as tabelas com dado do negócio, alterações de
-- clientes e finanças e mudança de papel/status na equipe. Sem dado pessoal
-- em "detalhes" (LOG-04): só o id do registro.
create or replace function public.auditar_alteracao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_acao text;
  v_id text;
  v_detalhes jsonb;
begin
  if tg_op = 'DELETE' then
    v_acao := 'excluiu';
    v_id := old.id::text;
  elsif tg_table_name = 'users' and tg_op = 'INSERT' then
    v_acao := 'usuario_criado';
    v_id := new.id::text;
    v_detalhes := jsonb_build_object('papel', new.role, 'ativo', new.active, 'login_vinculado', new.auth_id is not null);
  elsif tg_table_name = 'users' then
    if new.role is not distinct from old.role and new.active is not distinct from old.active
       and new.auth_id is not distinct from old.auth_id then
      return null; -- só troca de nome: não é mudança de permissão
    end if;
    v_acao := 'permissao_alterada';
    v_id := new.id::text;
    v_detalhes := jsonb_build_object(
      'papel_antes', old.role, 'papel_depois', new.role,
      'ativo_antes', old.active, 'ativo_depois', new.active,
      'login_vinculado', new.auth_id is not null
    );
  else
    v_acao := 'alterou';
    v_id := new.id::text;
  end if;
  perform public.auditoria_gravar(v_acao, tg_table_name, v_id, v_detalhes);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'appointments', 'clients', 'commissions', 'expenses', 'manual_incomes', 'personal_finances',
    'products', 'services', 'transactions', 'internal_tasks', 'kanban_quadros', 'users'
  ] loop
    execute format(
      'create trigger %I after delete on public.%I for each row execute function public.auditar_alteracao()',
      t || '_auditoria_exclusao', t
    );
  end loop;
  foreach t in array array['clients', 'personal_finances', 'transactions'] loop
    execute format(
      'create trigger %I after update on public.%I for each row execute function public.auditar_alteracao()',
      t || '_auditoria_alteracao', t
    );
  end loop;
end;
$$;

create trigger users_auditoria_permissao
  after insert or update on public.users
  for each row execute function public.auditar_alteracao();

-- -----------------------------------------------------------------------------
-- 5. Funções: visitante sem sessão (anon) e PUBLIC não executam nada
-- -----------------------------------------------------------------------------
-- Funções de extensão ficam de fora (em produção elas moram no schema "extensions",
-- mas se alguma estiver em public, revogar quebraria defaults como uuid_generate_v4()).
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from anon, public', f);
  end loop;
end;
$$;
alter default privileges in schema public revoke execute on functions from anon, public;

-- Funções internas: nem o usuário logado chama direto.
revoke execute on function public.auditoria_gravar(text, text, text, jsonb) from authenticated;
revoke execute on function public.auditar_alteracao() from authenticated;
revoke execute on function public.bloquear_alteracao_auditoria() from authenticated;

grant execute on function public.usuario_ativo() to authenticated;
grant execute on function public.usuario_admin() to authenticated;
grant execute on function public.registrar_auditoria(text, jsonb) to authenticated;
grant execute on function public.kanban_usuario_atual() to authenticated;

commit;

-- Conferência depois de aplicar (todas devem voltar 0 linhas):
--   select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
--   select tablename, policyname from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true');
--   select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')
--      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
