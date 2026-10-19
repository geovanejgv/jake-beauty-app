-- =============================================================================
-- Permissões por profissional (fase 1) e histórico de ações da profissional.
--
-- A administradora define, para cada profissional e cada tela (exceto Configurações):
--  - nível: nenhum (sem acesso), ver ou editar;
--  - alcance: proprio (só os dados dela) ou todos (dados das demais profissionais);
--  - em Clientes, quais dados além do nome ela vê (telefone, e-mail, aniversário,
--    observações, consentimento LGPD).
-- Sem linha gravada vale o padrão: as telas que a profissional já usava (Agenda, Meu
-- Painel, Tarefas, Clientes, Relatório de comissões, Plano) com os dados dela e, em
-- Clientes, só o nome. As demais telas ficam sem acesso até a administradora liberar.
-- A fronteira é o banco (AUZ-07): Agenda, Clientes e Relatório de comissões passam a
-- consultar a permissão nas políticas e funções. As telas das próximas fases continuam
-- só da administradora até ganharem a checagem no banco.
-- Histórico: ações da profissional na agenda e em clientes, só para a administradora,
-- sem dado pessoal (só a tela, a ação, a data do atendimento e os campos alterados).
-- Sem DROP nem DELETE/UPDATE de dados: altera políticas (alter policy) e funções.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Cadastro das permissões
-- -----------------------------------------------------------------------------
create table public.permissoes_profissional (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  modulo text not null check (modulo in (
    'resumo', 'meu_painel', 'agenda', 'tarefas', 'clientes', 'leads', 'profissionais', 'servicos',
    'financas', 'pagamentos', 'pdv', 'pacotes', 'relatorio_comissoes', 'plano')),
  nivel text not null check (nivel in ('nenhum', 'ver', 'editar')),
  alcance text not null default 'proprio' check (alcance in ('proprio', 'todos')),
  campos text[] not null default '{}' check (campos <@ array['telefone', 'email', 'aniversario', 'observacoes', 'lgpd']::text[]),
  atualizado_por uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (user_id, modulo)
);

alter table public.permissoes_profissional enable row level security;
revoke all on public.permissoes_profissional from anon;

-- Uma política por operação (AUZ-04): a administradora gerencia; a profissional lê as dela.
create policy "permissoes_profissional: select" on public.permissoes_profissional
  for select to authenticated using (public.usuario_admin() or (public.usuario_ativo() and user_id = public.usuario_atual_id()));
create policy "permissoes_profissional: insert" on public.permissoes_profissional
  for insert to authenticated with check (public.usuario_admin());
create policy "permissoes_profissional: update" on public.permissoes_profissional
  for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "permissoes_profissional: delete" on public.permissoes_profissional
  for delete to authenticated using (public.usuario_admin());
create policy "permissoes_profissional: mesmo estabelecimento" on public.permissoes_profissional as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));

create trigger a0_estabelecimento_guarda before insert or update or delete on public.permissoes_profissional
  for each row execute function public.estabelecimento_guarda();

-- Só para profissional (a administradora tem tudo); grava quem alterou e quando.
create or replace function public.permissoes_profissional_regras()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.users where id = new.user_id and role = 'admin') then
    raise exception 'A administradora já tem acesso a todas as telas.';
  end if;
  if new.modulo <> 'clientes' then
    new.campos := '{}';
  end if;
  new.atualizado_por := public.usuario_atual_id();
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.permissoes_profissional_regras() from public, anon, authenticated;

create trigger a1_permissoes_profissional_regras before insert or update on public.permissoes_profissional
  for each row execute function public.permissoes_profissional_regras();

create trigger permissoes_profissional_auditoria_alteracao after insert or update on public.permissoes_profissional
  for each row execute function public.auditar_alteracao_generica();
create trigger permissoes_profissional_auditoria_exclusao after delete on public.permissoes_profissional
  for each row execute function public.auditar_alteracao_generica();

-- -----------------------------------------------------------------------------
-- 2. Consulta da permissão (usada nas políticas e funções)
-- -----------------------------------------------------------------------------

-- Padrão sem linha gravada: as telas que a profissional já usava, com os dados dela.
create or replace function public.permissao_padrao(p_modulo text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_modulo in ('agenda', 'tarefas', 'clientes') then 'editar'
    when p_modulo in ('meu_painel', 'relatorio_comissoes', 'plano') then 'ver'
    else 'nenhum'
  end;
$$;

-- Permissão efetiva do usuário logado: administradora tem tudo; inativo, nada.
create or replace function public.minha_permissao(p_modulo text)
returns table (nivel text, alcance text, campos text[])
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    case when public.usuario_admin() then 'editar'
         when not public.usuario_ativo() then 'nenhum'
         else coalesce(p.nivel, public.permissao_padrao(p_modulo)) end,
    case when public.usuario_admin() then 'todos' else coalesce(p.alcance, 'proprio') end,
    case when public.usuario_admin() then array['telefone', 'email', 'aniversario', 'observacoes', 'lgpd']::text[]
         else coalesce(p.campos, '{}'::text[]) end
  from (select 1) x
  left join public.permissoes_profissional p
    on p.user_id = public.usuario_atual_id() and p.modulo = p_modulo
   and p.estabelecimento_id = public.estabelecimento_atual();
$$;

create or replace function public.pode_ver(p_modulo text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select (select nivel from public.minha_permissao(p_modulo)) <> 'nenhum'; $$;

create or replace function public.pode_editar(p_modulo text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select (select nivel from public.minha_permissao(p_modulo)) = 'editar'; $$;

create or replace function public.ve_todos(p_modulo text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select nivel <> 'nenhum' and alcance = 'todos' from public.minha_permissao(p_modulo); $$;

create or replace function public.cliente_campo(p_campo text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select public.usuario_admin() or (nivel <> 'nenhum' and p_campo = any (campos)) from public.minha_permissao('clientes'); $$;

-- Todas as permissões do usuário logado (menu e telas).
create or replace function public.minhas_permissoes()
returns table (modulo text, nivel text, alcance text, campos text[])
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m, p.nivel, p.alcance, p.campos
    from unnest(array['resumo', 'meu_painel', 'agenda', 'tarefas', 'clientes', 'leads', 'profissionais', 'servicos',
                      'financas', 'pagamentos', 'pdv', 'pacotes', 'relatorio_comissoes', 'plano']) m
    cross join lateral public.minha_permissao(m) p;
$$;

revoke execute on function public.permissao_padrao(text), public.minha_permissao(text), public.pode_ver(text),
  public.pode_editar(text), public.ve_todos(text), public.cliente_campo(text), public.minhas_permissoes() from public, anon;
grant execute on function public.permissao_padrao(text), public.minha_permissao(text), public.pode_ver(text),
  public.pode_editar(text), public.ve_todos(text), public.cliente_campo(text), public.minhas_permissoes() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Agenda: atendimentos próprios ou de todas, ver ou editar
-- -----------------------------------------------------------------------------
-- Os próprios atendimentos sempre aparecem (Meu Painel e relatório usam). Os das
-- demais profissionais, com alcance "todos" na Agenda ou no Relatório de comissões.
-- Gravar exige "editar" na Agenda; nos das demais, também alcance "todos".
-- Valores, forma de pagamento e gorjeta seguem só da administradora (appointments_protecao).

alter policy "appointments: profissional select" on public.appointments
  to authenticated
  using (public.usuario_ativo() and (professional_id = public.usuario_atual_id()
         or public.ve_todos('agenda') or public.ve_todos('relatorio_comissoes')));
alter policy "appointments: profissional insert" on public.appointments
  to authenticated
  with check (public.pode_editar('agenda') and (professional_id = public.usuario_atual_id() or public.ve_todos('agenda')));
alter policy "appointments: profissional update" on public.appointments
  to authenticated
  using (public.pode_editar('agenda') and (professional_id = public.usuario_atual_id() or public.ve_todos('agenda')))
  with check (public.pode_editar('agenda') and (professional_id = public.usuario_atual_id() or public.ve_todos('agenda')));
alter policy "appointments: profissional delete" on public.appointments
  to authenticated
  using (public.pode_editar('agenda') and (professional_id = public.usuario_atual_id() or public.ve_todos('agenda')));

-- Agendar para as demais exige ver os serviços que cada uma oferece.
alter policy "usuario_servico: select" on public.usuario_servico
  to authenticated
  using (public.usuario_admin() or user_id = public.usuario_atual_id() or public.ve_todos('agenda'));

-- Relatório de comissões com alcance "todos": fechamentos e ajustes das demais.
alter policy "fechamentos: select" on public.fechamentos
  to authenticated
  using (public.usuario_admin() or profissional_id = public.usuario_atual_id() or public.ve_todos('relatorio_comissoes'));
alter policy "fechamento_itens: select" on public.fechamento_itens
  to authenticated
  using (exists (select 1 from public.fechamentos f where f.id = fechamento_itens.fechamento_id
                 and (public.usuario_admin() or f.profissional_id = public.usuario_atual_id() or public.ve_todos('relatorio_comissoes'))));
alter policy "lancamento_ajustes: select" on public.lancamento_ajustes
  to authenticated
  using (public.usuario_admin() or (public.usuario_ativo() and (profissional_id = public.usuario_atual_id() or public.ve_todos('relatorio_comissoes'))));

CREATE OR REPLACE FUNCTION public.agendar_atendimento(p_cliente uuid, p_profissional uuid, p_servico uuid, p_inicio timestamp with time zone, p_servico_avulso text DEFAULT NULL::text, p_valor numeric DEFAULT NULL::numeric, p_duracao_minutos integer DEFAULT NULL::integer, p_status text DEFAULT 'scheduled'::text, p_observacao text DEFAULT NULL::text, p_pacote_item uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_admin boolean := public.usuario_admin();
  v_eu uuid := public.usuario_atual_id();
  v_cond record;
  v_valor numeric;
  v_minutos integer;
  v_comissao numeric;
  v_legado uuid;
  v_conflito text;
  v_id uuid;
begin
  if v_eu is null then
    raise exception 'Acesso ainda não liberado.';
  end if;
  if p_profissional is null then
    raise exception 'Escolha o profissional.';
  end if;
  if not v_admin and not public.pode_editar('agenda') then
    raise exception 'Sem permissão para agendar.';
  end if;
  if not v_admin and p_profissional <> v_eu and not public.ve_todos('agenda') then
    raise exception 'Você só pode agendar na sua própria agenda.';
  end if;
  if not exists (select 1 from public.users where id = p_profissional and active is true) then
    raise exception 'Profissional inativo ou inexistente.';
  end if;
  if p_cliente is null or not exists (select 1 from public.clients where id = p_cliente) then
    raise exception 'Selecione a cliente.';
  end if;
  if p_inicio is null then
    raise exception 'Informe data e horário.';
  end if;
  if p_status not in ('scheduled', 'confirmed') then
    raise exception 'Status inicial inválido.';
  end if;
  if p_observacao is not null and char_length(p_observacao) > 1000 then
    raise exception 'Observação muito longa.';
  end if;
  if p_pacote_item is not null and p_servico is null then
    raise exception 'Escolha o serviço do pacote.';
  end if;
  if p_servico is not null then
    select * into v_cond from public.servico_condicoes(p_profissional, p_servico);
    if not found then
      raise exception 'Serviço não encontrado.';
    end if;
    if not v_cond.oferece then
      raise exception 'Este profissional não oferece este serviço. Habilite em Serviços > Profissionais.';
    end if;
    v_valor := case when v_admin and p_valor is not null then p_valor else v_cond.valor end;
    v_minutos := case when v_admin and p_duracao_minutos is not null then p_duracao_minutos else v_cond.minutos end;
    v_comissao := v_cond.comissao;
    if p_pacote_item is not null then
      select i.valor_sessao, i.comissao_percentual into v_valor, v_comissao
        from public.pacote_itens i where i.id = p_pacote_item and i.servico_id = p_servico;
      if not found then
        raise exception 'O serviço escolhido não é o do pacote.';
      end if;
    end if;
  else
    if char_length(btrim(coalesce(p_servico_avulso, ''))) not between 1 and 120 then
      raise exception 'Escolha um serviço do catálogo ou descreva o procedimento.';
    end if;
    v_valor := coalesce(p_valor, 0);
    v_minutos := coalesce(p_duracao_minutos, 45);
    select coalesce(comissao_padrao_percentual, 0) into v_comissao from public.perfis_profissionais where user_id = p_profissional;
    v_comissao := coalesce(v_comissao, 0);
    insert into public.services (name, price, commission_rate, duration_minutes)
    values (btrim(p_servico_avulso), v_valor, v_comissao, v_minutos)
    returning id into v_legado;
  end if;
  if v_valor < 0 or v_valor > 100000 then
    raise exception 'Valor inválido.';
  end if;
  if v_minutos not between 5 and 600 then
    raise exception 'Duração inválida.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agenda:' || p_profissional::text, 0));
  perform set_config('app.agenda_rpc', 'on', true);
  v_conflito := public.agenda_conflito(p_profissional, p_inicio, p_inicio + make_interval(mins => v_minutos), null);
  if v_conflito is not null then
    raise exception 'Conflito de horário. %', v_conflito;
  end if;
  insert into public.appointments (
    client_id, professional_id, servico_id, service_id, start_time, end_time, status,
    valor_cobrado, comissao_percentual, notes, is_block, is_manual_reminder, pacote_item_id
  ) values (
    p_cliente, p_profissional, p_servico, v_legado, p_inicio, p_inicio + make_interval(mins => v_minutos), p_status,
    v_valor, v_comissao, nullif(btrim(coalesce(p_observacao, '')), ''), false, false, p_pacote_item
  ) returning id into v_id;
  perform set_config('app.agenda_rpc', 'off', true);
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remarcar_atendimento(p_id uuid, p_inicio timestamp with time zone, p_profissional uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_admin boolean := public.usuario_admin();
  v_eu uuid := public.usuario_atual_id();
  v_apt public.appointments%rowtype;
  v_prof uuid;
  v_duracao interval;
  v_conflito text;
begin
  if v_eu is null then
    raise exception 'Acesso ainda não liberado.';
  end if;
  if not v_admin and not public.pode_editar('agenda') then
    raise exception 'Sem permissão para remarcar.';
  end if;
  select * into v_apt from public.appointments where id = p_id;
  if not found or (not v_admin and v_apt.professional_id is distinct from v_eu and not public.ve_todos('agenda')) then
    raise exception 'Atendimento não encontrado.';
  end if;
  v_prof := coalesce(p_profissional, v_apt.professional_id);
  if not v_admin and v_prof is distinct from v_eu and not public.ve_todos('agenda') then
    raise exception 'Sem permissão para transferir atendimento para outro profissional.';
  end if;
  v_duracao := v_apt.end_time - v_apt.start_time;
  if v_prof is not null then
    perform pg_advisory_xact_lock(hashtextextended('agenda:' || v_prof::text, 0));
    if coalesce(v_apt.is_manual_reminder, false) = false and v_apt.status in ('scheduled', 'confirmed', 'completed') then
      v_conflito := public.agenda_conflito(v_prof, p_inicio, p_inicio + v_duracao, p_id);
      if v_conflito is not null then
        raise exception 'Conflito de horário. %', v_conflito;
      end if;
    end if;
  end if;
  perform set_config('app.agenda_rpc', 'on', true);
  update public.appointments
     set start_time = p_inicio, end_time = p_inicio + v_duracao, professional_id = v_prof
   where id = p_id;
  perform set_config('app.agenda_rpc', 'off', true);
end;
$function$;

-- -----------------------------------------------------------------------------
-- 4. Clientes: nome para todas; demais dados conforme a permissão
-- -----------------------------------------------------------------------------
create or replace view public.clientes_visiveis
with (security_barrier = true)
as
 SELECT id,
    name,
        CASE
            WHEN cliente_campo('telefone') THEN phone::text
            ELSE mascarar_telefone(phone::text)
        END AS phone,
        CASE
            WHEN cliente_campo('email') THEN email
            ELSE mascarar_email(email)
        END AS email,
        CASE
            WHEN cliente_campo('observacoes') THEN notes
            ELSE NULL::text
        END AS notes,
        CASE
            WHEN cliente_campo('aniversario') THEN birth_date
            ELSE NULL::date
        END AS birth_date,
        CASE
            WHEN cliente_campo('lgpd') THEN lgpd_consent
            ELSE NULL::boolean
        END AS lgpd_consent,
    cliente_campo('telefone') AS contato_visivel,
    created_at,
    origem_id,
    cliente_campo('email') AS email_visivel,
        CASE
            WHEN cliente_campo('aniversario') THEN birthday
            ELSE NULL::date
        END AS birthday,
    cliente_campo('aniversario') AS aniversario_visivel,
    cliente_campo('observacoes') AS observacoes_visivel,
    cliente_campo('lgpd') AS lgpd_visivel
   FROM clients c
  WHERE usuario_ativo() AND estabelecimento_id = (( SELECT estabelecimento_atual() AS estabelecimento_atual));

-- Histórico técnico: ver com acesso a Clientes; registrar com "editar".
alter policy "cliente_historico: select" on public.cliente_historico
  to authenticated using (public.pode_ver('clientes'));
alter policy "cliente_historico: insert" on public.cliente_historico
  to authenticated with check (public.pode_editar('clientes'));

-- Cadastro rápido (agenda e clientes): exige "editar" em Clientes ou na Agenda.
CREATE OR REPLACE FUNCTION public.cadastrar_cliente_rapido(p_nome text, p_telefone text, p_aniversario date, p_origem uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_tel text := btrim(coalesce(p_telefone, ''));
begin
  if not public.usuario_ativo() then
    raise exception 'Acesso ainda não liberado.';
  end if;
  if not (public.pode_editar('clientes') or public.pode_editar('agenda')) then
    raise exception 'Sem permissão para cadastrar cliente.';
  end if;
  if char_length(v_nome) not between 2 and 255 then
    raise exception 'Informe o nome da cliente.';
  end if;
  if char_length(v_tel) > 20 then
    raise exception 'Telefone inválido.';
  end if;
  if p_aniversario is not null and (p_aniversario > current_date or p_aniversario < date '1900-01-01') then
    raise exception 'Data de aniversário inválida.';
  end if;
  if p_origem is not null and not exists (
    select 1 from public.origens_cliente where id = p_origem and estabelecimento_id = public.estabelecimento_atual()
  ) then
    raise exception 'Origem inválida.';
  end if;
  insert into public.clients (name, phone, birthday, origem_id)
  values (v_nome, v_tel, p_aniversario, p_origem)
  returning id into v_id;
  return v_id;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 5. Histórico de ações da profissional (só a administradora lê)
-- -----------------------------------------------------------------------------
create table public.historico_acoes (
  id bigint generated always as identity primary key,
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  acao text not null check (acao in ('criou', 'alterou', 'excluiu')),
  tela text not null check (tela in ('agenda', 'clientes')),
  -- Sem FK: o registro sobrevive à exclusão do item.
  entidade_id uuid,
  data_referencia timestamptz,
  campos text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index historico_acoes_user_idx on public.historico_acoes (estabelecimento_id, user_id, created_at desc);

alter table public.historico_acoes enable row level security;
revoke all on public.historico_acoes from anon;
revoke insert, update, delete, truncate on public.historico_acoes from authenticated;
create policy "historico_acoes: select" on public.historico_acoes
  for select to authenticated using (public.usuario_admin());
create policy "historico_acoes: mesmo estabelecimento" on public.historico_acoes as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));
create trigger a0_estabelecimento_guarda before insert or update or delete on public.historico_acoes
  for each row execute function public.estabelecimento_guarda();

-- Registra a ação de quem não é administradora (sem valores: só os nomes dos campos).
create or replace function public.registrar_acao_profissional()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eu uuid := public.usuario_atual_id();
  v_antes jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_linha jsonb := coalesce(v_depois, v_antes);
  v_campos text[] := '{}';
begin
  if auth.uid() is null or v_eu is null or public.usuario_admin() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into v_campos
      from jsonb_object_keys(v_depois) k
     where k not in ('updated_at', 'estabelecimento_id') and v_depois -> k is distinct from v_antes -> k;
    if cardinality(v_campos) = 0 then
      return null;
    end if;
  end if;
  insert into public.historico_acoes (estabelecimento_id, user_id, acao, tela, entidade_id, data_referencia, campos)
  values (
    (v_linha ->> 'estabelecimento_id')::uuid, v_eu,
    case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'excluiu' end,
    case when tg_table_name = 'appointments' then 'agenda' else 'clientes' end,
    (v_linha ->> 'id')::uuid,
    case when tg_table_name = 'appointments' then (v_linha ->> 'start_time')::timestamptz end,
    v_campos);
  return null;
end;
$$;
revoke execute on function public.registrar_acao_profissional() from public, anon, authenticated;

create trigger appointments_historico_acoes after insert or update or delete on public.appointments
  for each row execute function public.registrar_acao_profissional();
create trigger cliente_historico_historico_acoes after insert or update or delete on public.cliente_historico
  for each row execute function public.registrar_acao_profissional();
create trigger clients_historico_acoes after insert on public.clients
  for each row execute function public.registrar_acao_profissional();

commit;
