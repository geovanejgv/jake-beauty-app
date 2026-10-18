-- Clientes: origem (de onde a cliente veio) e grupos de clientes.
--  - origens_cliente: opções de origem por estabelecimento (Guaianases e Lírios no
--    Studio Labeli); a administradora cria outras na tela de Clientes.
--  - clients.origem_id: origem da cliente (opcional).
--  - grupos_cliente / grupo_cliente_membros: grupos para agendar lembrete de uma vez
--    para todas as clientes do grupo (Agenda > Lembrete > Grupo).
-- Todas nascem com estabelecimento_id, política restritiva e gatilho de guarda (AUZ-04).
-- Grupos são da administradora: juntam contato de várias clientes (base de clientes).

-- -----------------------------------------------------------------------------
-- 1. Origens
-- -----------------------------------------------------------------------------
create table public.origens_cliente (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 1 and 60),
  created_at timestamptz not null default now(),
  constraint origens_cliente_estabelecimento_nome_key unique (estabelecimento_id, nome)
);
alter table public.origens_cliente enable row level security;
revoke all on public.origens_cliente from anon;

create policy "origens_cliente: select" on public.origens_cliente
  for select to authenticated using (public.usuario_ativo());
create policy "origens_cliente: insert" on public.origens_cliente
  for insert to authenticated with check (public.usuario_admin());
create policy "origens_cliente: update" on public.origens_cliente
  for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "origens_cliente: delete" on public.origens_cliente
  for delete to authenticated using (public.usuario_admin());
create policy "origens_cliente: mesmo estabelecimento" on public.origens_cliente
  as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));
create trigger a0_estabelecimento_guarda before insert or update or delete on public.origens_cliente
  for each row execute function public.estabelecimento_guarda();

insert into public.origens_cliente (estabelecimento_id, nome)
select '5a1ab0e1-0000-4000-8000-000000000001', o
  from unnest(array['Guaianases', 'Lírios']) o
 where exists (select 1 from public.estabelecimentos where id = '5a1ab0e1-0000-4000-8000-000000000001')
on conflict do nothing;

alter table public.clients
  add column origem_id uuid references public.origens_cliente(id) on delete set null;
create index clients_origem_idx on public.clients (origem_id);

-- A equipe vê a origem junto do nome (não é dado de contato).
create or replace view public.clientes_visiveis with (security_barrier = true) as
select
  c.id,
  c.name,
  case when public.usuario_admin() then c.phone::text else public.mascarar_telefone(c.phone::text) end as phone,
  case when public.usuario_admin() then c.email else public.mascarar_email(c.email) end as email,
  case when public.usuario_admin() then c.notes end as notes,
  case when public.usuario_admin() then c.birth_date end as birth_date,
  case when public.usuario_admin() then c.lgpd_consent end as lgpd_consent,
  public.usuario_admin() as contato_visivel,
  c.created_at,
  c.origem_id
from public.clients c
where public.usuario_ativo() and c.estabelecimento_id = (select public.estabelecimento_atual());

-- -----------------------------------------------------------------------------
-- 2. Grupos de clientes
-- -----------------------------------------------------------------------------
create table public.grupos_cliente (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  created_at timestamptz not null default now(),
  constraint grupos_cliente_estabelecimento_nome_key unique (estabelecimento_id, nome)
);
alter table public.grupos_cliente enable row level security;
revoke all on public.grupos_cliente from anon;

create table public.grupo_cliente_membros (
  grupo_id uuid not null references public.grupos_cliente(id) on delete cascade,
  cliente_id uuid not null references public.clients(id) on delete cascade,
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (grupo_id, cliente_id)
);
create index grupo_cliente_membros_cliente_idx on public.grupo_cliente_membros (cliente_id);
create index grupo_cliente_membros_estabelecimento_idx on public.grupo_cliente_membros (estabelecimento_id);
alter table public.grupo_cliente_membros enable row level security;
revoke all on public.grupo_cliente_membros from anon;

do $$
declare
  t text;
begin
  foreach t in array array['grupos_cliente', 'grupo_cliente_membros'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.usuario_admin())', t || ': select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.usuario_admin())', t || ': insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin())', t || ': update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.usuario_admin())', t || ': delete', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using (estabelecimento_id = (select public.estabelecimento_atual())) '
      'with check (estabelecimento_id = (select public.estabelecimento_atual()))',
      t || ': mesmo estabelecimento', t);
    execute format(
      'create trigger a0_estabelecimento_guarda before insert or update or delete on public.%I '
      'for each row execute function public.estabelecimento_guarda()', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Lembrete para o grupo inteiro (uma operação, um lembrete por cliente)
-- -----------------------------------------------------------------------------
-- Roda como quem chama (RLS vale): só a administradora lê os grupos.
-- p_meses = 1 (só a data) ou 24 (repete todo mês, como o lembrete recorrente da agenda).
create or replace function public.agendar_lembrete_grupo(
  p_grupo uuid,
  p_inicio timestamptz,
  p_profissional uuid default null,
  p_servico uuid default null,
  p_texto text default null,
  p_meses integer default 1
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_membro record;
  v_grupo_rec uuid;
  v_qtd integer := 0;
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  if not public.usuario_admin() then
    raise exception 'Só a administração agenda lembrete por grupo.' using errcode = '42501';
  end if;
  if p_inicio is null then
    raise exception 'Informe a data do lembrete.';
  end if;
  if p_meses not in (1, 24) then
    raise exception 'Repetição inválida.';
  end if;
  if char_length(coalesce(v_texto, '')) > 255 then
    raise exception 'Procedimento muito longo.';
  end if;
  if not exists (select 1 from public.grupos_cliente where id = p_grupo) then
    raise exception 'Grupo não encontrado.';
  end if;
  if v_texto is null and p_servico is not null then
    select nome into v_texto from public.servicos where id = p_servico;
  end if;
  for v_membro in select cliente_id from public.grupo_cliente_membros where grupo_id = p_grupo loop
    v_grupo_rec := case when p_meses > 1 then gen_random_uuid() end;
    insert into public.appointments (client_id, professional_id, servico_id, notes, start_time, end_time,
                                     status, is_block, is_manual_reminder, is_recurring, recurring_group_id)
    select v_membro.cliente_id, p_profissional, p_servico, v_texto,
           p_inicio + make_interval(months => i), p_inicio + make_interval(months => i) + interval '45 minutes',
           'scheduled', false, true, p_meses > 1, v_grupo_rec
      from generate_series(0, p_meses - 1) i;
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;
revoke all on function public.agendar_lembrete_grupo(uuid, timestamptz, uuid, uuid, text, integer) from public, anon;
grant execute on function public.agendar_lembrete_grupo(uuid, timestamptz, uuid, uuid, text, integer) to authenticated;
