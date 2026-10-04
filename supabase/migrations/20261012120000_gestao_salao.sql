-- =============================================================================
-- Gestão do salão: acesso por papel, catálogo, agenda sem conflito, comissões
-- com fechamento assinado, comentários no Kanban e preferências de interface.
--
-- NÃO APLICADA. Só aplicar em produção com aprovação explícita (DEV-02).
--
-- Adaptações ao banco que já existe (nada é apagado):
--  - "Usuarios" = public.users (papel no enum user_role: admin = Administrador,
--    professional = Profissional parceiro). Senha e hash ficam no Supabase Auth
--    (AUT-01, AUT-02); CPF, CNPJ/MEI e contrato ficam em perfis_profissionais,
--    que só a administradora e o próprio profissional leem.
--  - "Agendamentos" = public.appointments (status em inglês já usados pelo app:
--    scheduled = Pendente, confirmed = Confirmado, completed = Concluído,
--    cancelled = Cancelado, no_show = Não compareceu).
--  - "Clientes" = public.clients; profissionais leem pela view clientes_visiveis,
--    com telefone e e-mail mascarados (risco de fuga de base).
--  - O antigo public.services (um registro por atendimento) continua para o
--    histórico; o catálogo novo é public.servicos.
-- =============================================================================

begin;

create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- 0. Funções de apoio
-- -----------------------------------------------------------------------------

-- Perfil (public.users.id) da sessão, só se estiver ativo.
create or replace function public.usuario_atual_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.users where auth_id = auth.uid() and active is true limit 1;
$$;

create or replace function public.somente_digitos(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '');
$$;

-- CPF com dígitos verificadores (sem sequência repetida).
create or replace function public.cpf_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  d text := public.somente_digitos(p);
  soma int;
  dv1 int;
  dv2 int;
begin
  if d is null or length(d) <> 11 or d ~ '^(\d)\1{10}$' then
    return false;
  end if;
  soma := 0;
  for i in 1..9 loop soma := soma + substr(d, i, 1)::int * (11 - i); end loop;
  dv1 := (soma * 10) % 11; if dv1 = 10 then dv1 := 0; end if;
  soma := 0;
  for i in 1..10 loop soma := soma + substr(d, i, 1)::int * (12 - i); end loop;
  dv2 := (soma * 10) % 11; if dv2 = 10 then dv2 := 0; end if;
  return dv1 = substr(d, 10, 1)::int and dv2 = substr(d, 11, 1)::int;
end;
$$;

-- CNPJ (inclusive de MEI) com dígitos verificadores.
create or replace function public.cnpj_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  d text := public.somente_digitos(p);
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  soma int;
  dv1 int;
  dv2 int;
begin
  if d is null or length(d) <> 14 or d ~ '^(\d)\1{13}$' then
    return false;
  end if;
  soma := 0;
  for i in 1..12 loop soma := soma + substr(d, i, 1)::int * pesos1[i]; end loop;
  dv1 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  soma := 0;
  for i in 1..13 loop soma := soma + substr(d, i, 1)::int * pesos2[i]; end loop;
  dv2 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  return dv1 = substr(d, 13, 1)::int and dv2 = substr(d, 14, 1)::int;
end;
$$;

-- Máscaras para quem não é administradora (risco de fuga de base de clientes).
create or replace function public.mascarar_telefone(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when public.somente_digitos(p) is null then null
              else '(**) *****-**' || right(public.somente_digitos(p), 2) end;
$$;

create or replace function public.mascarar_email(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p is null or p = '' then null else left(p, 1) || '***@***' end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Usuários, perfil profissional e preferências de interface
-- -----------------------------------------------------------------------------
alter table public.users
  add column if not exists preferencias_ui jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();
alter table public.users
  add constraint users_preferencias_ui_check
  check (jsonb_typeof(preferencias_ui) = 'object' and octet_length(preferencias_ui::text) <= 4000);

-- Dados sensíveis do profissional: só a administradora e o próprio profissional leem.
create table public.perfis_profissionais (
  user_id uuid primary key references public.users(id) on delete cascade,
  email text check (email is null or (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  telefone text check (telefone is null or char_length(telefone) <= 20),
  cpf text unique check (cpf is null or public.cpf_valido(cpf)),
  cnpj text check (cnpj is null or public.cnpj_valido(cnpj)),
  modelo_contrato text not null default 'salao_parceiro'
    check (modelo_contrato in ('salao_parceiro', 'clt', 'autonomo', 'socio')),
  comissao_padrao_percentual numeric(5,2) check (comissao_padrao_percentual between 0 and 100),
  chave_pix text check (chave_pix is null or char_length(chave_pix) <= 140),
  inicio_contrato date,
  observacoes text check (observacoes is null or char_length(observacoes) <= 2000),
  updated_at timestamptz not null default now()
);
alter table public.perfis_profissionais enable row level security;
revoke all on public.perfis_profissionais from anon;

-- CPF e CNPJ guardados só com dígitos (UNIQUE do CPF evita cadastro duplicado).
create or replace function public.perfis_profissionais_normalizar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.cpf := public.somente_digitos(new.cpf);
  new.cnpj := public.somente_digitos(new.cnpj);
  new.telefone := nullif(btrim(new.telefone), '');
  new.email := nullif(lower(btrim(new.email)), '');
  new.updated_at := now();
  return new;
end;
$$;
create trigger perfis_profissionais_a_normalizar
  before insert or update on public.perfis_profissionais
  for each row execute function public.perfis_profissionais_normalizar();

create policy "perfis_profissionais: select" on public.perfis_profissionais
  for select to authenticated using (public.usuario_admin() or user_id = public.usuario_atual_id());
create policy "perfis_profissionais: insert" on public.perfis_profissionais
  for insert to authenticated with check (public.usuario_admin());
create policy "perfis_profissionais: update" on public.perfis_profissionais
  for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "perfis_profissionais: delete" on public.perfis_profissionais
  for delete to authenticated using (public.usuario_admin());

-- Sempre sobra ao menos uma administradora ativa (evita trancar o sistema).
create or replace function public.users_protege_ultima_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' and old.active is true
       and not exists (select 1 from public.users where id <> old.id and role = 'admin' and active is true) then
      raise exception 'É preciso manter ao menos uma administradora ativa.';
    end if;
    return old;
  end if;
  if old.role = 'admin' and old.active is true and (new.role <> 'admin' or new.active is not true)
     and not exists (select 1 from public.users where id <> old.id and role = 'admin' and active is true) then
    raise exception 'É preciso manter ao menos uma administradora ativa.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger users_a_protege_ultima_admin
  before update or delete on public.users
  for each row execute function public.users_protege_ultima_admin();

-- Preferências de interface do próprio usuário (ocultar módulos do menu).
create or replace function public.salvar_preferencias_ui(p_preferencias jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := public.usuario_atual_id();
begin
  if v_id is null then
    raise exception 'Acesso ainda não liberado.';
  end if;
  if p_preferencias is null or jsonb_typeof(p_preferencias) <> 'object' or octet_length(p_preferencias::text) > 4000 then
    raise exception 'Preferências inválidas.';
  end if;
  update public.users set preferencias_ui = p_preferencias where id = v_id;
  return p_preferencias;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Clientes: dados completos só para a administradora
-- -----------------------------------------------------------------------------
alter policy "clients: usuários ativos" on public.clients
  rename to "clients: administradora";
alter policy "clients: administradora" on public.clients
  to authenticated using (public.usuario_admin()) with check (public.usuario_admin());

-- Visão usada pela agenda e pela lista de clientes. Profissionais veem nome e
-- histórico técnico; telefone e e-mail chegam mascarados; observações e
-- aniversário não aparecem. A view roda como dona (ignora o RLS de clients),
-- por isso o filtro de acesso está aqui dentro.
create view public.clientes_visiveis with (security_barrier = true) as
select
  c.id,
  c.name,
  case when public.usuario_admin() then c.phone else public.mascarar_telefone(c.phone) end as phone,
  case when public.usuario_admin() then c.email else public.mascarar_email(c.email) end as email,
  case when public.usuario_admin() then c.notes end as notes,
  case when public.usuario_admin() then c.birth_date end as birth_date,
  case when public.usuario_admin() then c.lgpd_consent end as lgpd_consent,
  public.usuario_admin() as contato_visivel,
  c.created_at
from public.clients c
where public.usuario_ativo();

revoke all on public.clientes_visiveis from anon, public;
grant select on public.clientes_visiveis to authenticated;

-- Profissional também cadastra cliente novo na hora do agendamento, sem ler a base.
create or replace function public.cadastrar_cliente_rapido(p_nome text, p_telefone text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_tel text := btrim(coalesce(p_telefone, ''));
begin
  if not public.usuario_ativo() then
    raise exception 'Acesso ainda não liberado.';
  end if;
  if char_length(v_nome) not between 2 and 255 then
    raise exception 'Informe o nome da cliente.';
  end if;
  if char_length(v_tel) > 20 then
    raise exception 'Telefone inválido.';
  end if;
  insert into public.clients (name, phone) values (v_nome, v_tel) returning id into v_id;
  return v_id;
end;
$$;

-- Histórico técnico (fórmula de coloração, alergias, preferências), visível à equipe.
create table public.cliente_historico (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clients(id) on delete cascade,
  autor_id uuid references public.users(id) on delete set null,
  agendamento_id uuid references public.appointments(id) on delete set null,
  tipo text not null default 'tecnico' check (tipo in ('tecnico', 'alergia', 'preferencia', 'observacao')),
  texto text not null check (char_length(btrim(texto)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index cliente_historico_cliente_idx on public.cliente_historico (cliente_id, created_at desc);
alter table public.cliente_historico enable row level security;
revoke all on public.cliente_historico from anon;

create or replace function public.cliente_historico_autor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.autor_id := public.usuario_atual_id();
    new.created_at := now();
  else
    new.autor_id := old.autor_id;
    new.cliente_id := old.cliente_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
create trigger cliente_historico_a_autor
  before insert or update on public.cliente_historico
  for each row execute function public.cliente_historico_autor();

create policy "cliente_historico: select" on public.cliente_historico
  for select to authenticated using (public.usuario_ativo());
create policy "cliente_historico: insert" on public.cliente_historico
  for insert to authenticated with check (public.usuario_ativo());
create policy "cliente_historico: update" on public.cliente_historico
  for update to authenticated
  using (public.usuario_admin() or autor_id = public.usuario_atual_id())
  with check (public.usuario_admin() or autor_id = public.usuario_atual_id());
create policy "cliente_historico: delete" on public.cliente_historico
  for delete to authenticated using (public.usuario_admin());

-- -----------------------------------------------------------------------------
-- 3. Catálogo de serviços e vínculo por profissional
-- -----------------------------------------------------------------------------
create table public.categorias_servico (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (char_length(btrim(nome)) between 1 and 60),
  cor text not null default '#e11d48' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias_servico(id) on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  descricao text check (descricao is null or char_length(descricao) <= 1000),
  preco_base numeric(10,2) not null default 0 check (preco_base >= 0),
  duracao_base_minutos integer not null default 60 check (duracao_base_minutos between 5 and 600),
  comissao_base_percentual numeric(5,2) check (comissao_base_percentual between 0 and 100),
  custo_material numeric(10,2) not null default 0 check (custo_material >= 0),
  retorno_dias integer check (retorno_dias is null or retorno_dias between 1 and 365),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (categoria_id, nome)
);
create index servicos_categoria_idx on public.servicos (categoria_id, nome);

-- Cada profissional pode ter preço, tempo e comissão próprios para o mesmo serviço.
create table public.usuario_servico (
  user_id uuid not null references public.users(id) on delete cascade,
  servico_id uuid not null references public.servicos(id) on delete cascade,
  valor_personalizado numeric(10,2) check (valor_personalizado is null or valor_personalizado >= 0),
  tempo_execucao_minutos integer check (tempo_execucao_minutos is null or tempo_execucao_minutos between 5 and 600),
  comissao_percentual numeric(5,2) check (comissao_percentual is null or comissao_percentual between 0 and 100),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, servico_id)
);
create index usuario_servico_servico_idx on public.usuario_servico (servico_id);

alter table public.categorias_servico enable row level security;
alter table public.servicos enable row level security;
alter table public.usuario_servico enable row level security;
revoke all on public.categorias_servico, public.servicos, public.usuario_servico from anon;

create policy "categorias_servico: select" on public.categorias_servico
  for select to authenticated using (public.usuario_ativo());
create policy "categorias_servico: insert" on public.categorias_servico
  for insert to authenticated with check (public.usuario_admin());
create policy "categorias_servico: update" on public.categorias_servico
  for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "categorias_servico: delete" on public.categorias_servico
  for delete to authenticated using (public.usuario_admin());

create policy "servicos: select" on public.servicos
  for select to authenticated using (public.usuario_ativo());
create policy "servicos: insert" on public.servicos
  for insert to authenticated with check (public.usuario_admin());
create policy "servicos: update" on public.servicos
  for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "servicos: delete" on public.servicos
  for delete to authenticated using (public.usuario_admin());

create policy "usuario_servico: select" on public.usuario_servico
  for select to authenticated using (public.usuario_admin() or user_id = public.usuario_atual_id());
create policy "usuario_servico: insert" on public.usuario_servico
  for insert to authenticated with check (public.usuario_admin());
create policy "usuario_servico: update" on public.usuario_servico
  for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "usuario_servico: delete" on public.usuario_servico
  for delete to authenticated using (public.usuario_admin());

insert into public.categorias_servico (nome, cor, ordem) values
  ('Cabelo', '#e11d48', 1),
  ('Manicure e Pedicure', '#db2777', 2),
  ('Sobrancelhas e Cílios', '#9333ea', 3),
  ('Estética Facial', '#0d9488', 4),
  ('Estética Corporal', '#0284c7', 5),
  ('Depilação', '#ea580c', 6),
  ('Maquiagem', '#ca8a04', 7)
on conflict (nome) do nothing;

-- Habilita ou desabilita vários serviços de uma vez para um profissional
-- (ex.: "ticar" a categoria inteira). Mantém preço/tempo/comissão já ajustados.
create or replace function public.habilitar_servicos(p_user uuid, p_servicos uuid[], p_ativo boolean)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_qtd integer;
begin
  if not public.usuario_admin() then
    raise exception 'Somente a administradora altera os serviços da equipe.';
  end if;
  if p_servicos is null or cardinality(p_servicos) = 0 then
    return 0;
  end if;
  if cardinality(p_servicos) > 500 then
    raise exception 'Selecione no máximo 500 serviços por vez.';
  end if;
  insert into public.usuario_servico (user_id, servico_id, ativo)
  select p_user, s.id, coalesce(p_ativo, true) from public.servicos s where s.id = any (p_servicos)
  on conflict (user_id, servico_id) do update set ativo = excluded.ativo;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- Condições efetivas: valor, tempo e comissão do profissional para o serviço.
-- Comissão: a do vínculo; senão a taxa fixa do perfil; senão a base do serviço; senão 0.
create or replace function public.servico_condicoes(p_profissional uuid, p_servico uuid)
returns table (oferece boolean, valor numeric, minutos integer, comissao numeric, custo_material numeric, nome text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(us.ativo, false) and s.ativo,
    coalesce(us.valor_personalizado, s.preco_base),
    coalesce(us.tempo_execucao_minutos, s.duracao_base_minutos),
    coalesce(us.comissao_percentual, pp.comissao_padrao_percentual, s.comissao_base_percentual, 0),
    s.custo_material,
    s.nome
  from public.servicos s
  left join public.usuario_servico us on us.servico_id = s.id and us.user_id = p_profissional
  left join public.perfis_profissionais pp on pp.user_id = p_profissional
  where s.id = p_servico
    and public.usuario_ativo()
    and (public.usuario_admin() or p_profissional = public.usuario_atual_id());
$$;

-- -----------------------------------------------------------------------------
-- 4. Agendamentos: profissional, catálogo, valores e trava contra conflito
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column if not exists servico_id uuid references public.servicos(id) on delete set null,
  add column if not exists valor_cobrado numeric(10,2) check (valor_cobrado is null or valor_cobrado >= 0),
  add column if not exists comissao_percentual numeric(5,2) check (comissao_percentual is null or comissao_percentual between 0 and 100),
  add column if not exists gorjeta numeric(10,2) not null default 0 check (gorjeta >= 0),
  add column if not exists created_by uuid references public.users(id) on delete set null;

alter table public.appointments
  add constraint appointments_status_check
  check (status in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'));
alter table public.appointments
  add constraint appointments_horario_check check (end_time > start_time);
alter table public.appointments
  add constraint appointments_payment_method_check
  check (payment_method is null or payment_method in ('pix', 'dinheiro', 'debito', 'credito', 'cartao', 'outro'));

create index if not exists appointments_profissional_inicio_idx on public.appointments (professional_id, start_time);
create index if not exists appointments_inicio_idx on public.appointments (start_time);

-- Valor dos atendimentos antigos (vinha do registro avulso em services).
update public.appointments a
   set valor_cobrado = s.price
  from public.services s
 where a.service_id = s.id and a.valor_cobrado is null;

-- Trava no banco: o mesmo profissional não fica com dois horários sobrepostos
-- (atendimentos ativos e bloqueios). Lembretes não ocupam agenda.
alter table public.appointments
  add constraint appointments_sem_conflito
  exclude using gist (
    professional_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  ) where (
    professional_id is not null
    and coalesce(is_manual_reminder, false) = false
    and status in ('scheduled', 'confirmed', 'completed')
  );

-- Profissional não muda valor, comissão nem o dono do atendimento; atendimento
-- já incluído em fechamento não muda valor, profissional, horário nem status.
create or replace function public.appointments_protecao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rpc boolean := coalesce(current_setting('app.agenda_rpc', true), '') = 'on';
  v_restrito boolean := auth.uid() is not null and not public.usuario_admin() and not v_rpc;
begin
  -- Atendimento já incluído em fechamento ativo fica congelado no que afeta o pagamento.
  if tg_op in ('UPDATE', 'DELETE') and exists (
       select 1 from public.fechamento_itens i join public.fechamentos f on f.id = i.fechamento_id
        where i.agendamento_id = old.id and f.status <> 'cancelado') then
    if tg_op = 'DELETE'
       or new.valor_cobrado is distinct from old.valor_cobrado
       or new.comissao_percentual is distinct from old.comissao_percentual
       or new.professional_id is distinct from old.professional_id
       or new.start_time is distinct from old.start_time
       or new.status is distinct from old.status
       or new.gorjeta is distinct from old.gorjeta
       or new.payment_method is distinct from old.payment_method then
      raise exception 'Atendimento já incluído em fechamento de comissão. Cancele o fechamento antes de alterar.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Profissional não define nem altera valores, forma de pagamento, gorjeta ou dono
  -- do atendimento: isso é feito pela administradora (checkout) ou pelas funções
  -- agendar/remarcar, que calculam os valores no banco (VAL-07).
  if v_restrito and tg_op = 'INSERT'
     and (new.valor_cobrado is not null or new.comissao_percentual is not null
          or coalesce(new.gorjeta, 0) <> 0 or new.payment_method is not null) then
    raise exception 'Use o agendamento da agenda para criar atendimento com valor.';
  end if;
  if v_restrito and tg_op = 'UPDATE'
     and (new.valor_cobrado is distinct from old.valor_cobrado
          or new.comissao_percentual is distinct from old.comissao_percentual
          or new.professional_id is distinct from old.professional_id
          or new.created_by is distinct from old.created_by
          or new.gorjeta is distinct from old.gorjeta
          or new.payment_method is distinct from old.payment_method) then
    raise exception 'Somente a administradora altera valor, pagamento, gorjeta ou profissional do atendimento.';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.usuario_atual_id(), new.created_by);
  else
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

alter policy "appointments: usuários ativos" on public.appointments
  rename to "appointments: administradora";
alter policy "appointments: administradora" on public.appointments
  to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "appointments: profissional select" on public.appointments
  for select to authenticated using (professional_id = public.usuario_atual_id());
create policy "appointments: profissional insert" on public.appointments
  for insert to authenticated with check (professional_id = public.usuario_atual_id());
create policy "appointments: profissional update" on public.appointments
  for update to authenticated
  using (professional_id = public.usuario_atual_id())
  with check (professional_id = public.usuario_atual_id());
create policy "appointments: profissional delete" on public.appointments
  for delete to authenticated using (professional_id = public.usuario_atual_id());

-- Agenda com trava pessimista por profissional: duas pessoas agendando o mesmo
-- profissional ao mesmo tempo esperam uma pela outra, e a segunda recebe o aviso
-- de conflito. A restrição appointments_sem_conflito é a garantia final.
create or replace function public.agenda_conflito(p_profissional uuid, p_inicio timestamptz, p_fim timestamptz, p_ignorar uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when a.is_block then 'Horário bloqueado: ' || coalesce(a.block_reason, 'bloqueio')
              else 'Já existe atendimento das '
                   || to_char(a.start_time at time zone 'America/Sao_Paulo', 'HH24:MI')
                   || ' às ' || to_char(a.end_time at time zone 'America/Sao_Paulo', 'HH24:MI') end
    from public.appointments a
   where a.professional_id = p_profissional
     and (p_ignorar is null or a.id <> p_ignorar)
     and coalesce(a.is_manual_reminder, false) = false
     and a.status in ('scheduled', 'confirmed', 'completed')
     and tstzrange(a.start_time, a.end_time, '[)') && tstzrange(p_inicio, p_fim, '[)')
   order by a.start_time
   limit 1;
$$;

create or replace function public.agendar_atendimento(
  p_cliente uuid,
  p_profissional uuid,
  p_servico uuid,
  p_inicio timestamptz,
  p_servico_avulso text default null,
  p_valor numeric default null,
  p_duracao_minutos integer default null,
  p_status text default 'scheduled',
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  if not v_admin and p_profissional <> v_eu then
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

  -- Trava pessimista: um agendamento por vez na agenda deste profissional.
  perform pg_advisory_xact_lock(hashtextextended('agenda:' || p_profissional::text, 0));
  perform set_config('app.agenda_rpc', 'on', true);

  v_conflito := public.agenda_conflito(p_profissional, p_inicio, p_inicio + make_interval(mins => v_minutos), null);
  if v_conflito is not null then
    raise exception 'Conflito de horário. %', v_conflito;
  end if;

  insert into public.appointments (
    client_id, professional_id, servico_id, service_id, start_time, end_time, status,
    valor_cobrado, comissao_percentual, notes, is_block, is_manual_reminder
  ) values (
    p_cliente, p_profissional, p_servico, v_legado, p_inicio, p_inicio + make_interval(mins => v_minutos), p_status,
    v_valor, v_comissao, nullif(btrim(coalesce(p_observacao, '')), ''), false, false
  ) returning id into v_id;
  perform set_config('app.agenda_rpc', 'off', true);
  return v_id;
end;
$$;

-- Remarca (horário e, para a administradora, profissional) com a mesma trava.
create or replace function public.remarcar_atendimento(p_id uuid, p_inicio timestamptz, p_profissional uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  select * into v_apt from public.appointments where id = p_id;
  if not found or (not v_admin and v_apt.professional_id is distinct from v_eu) then
    raise exception 'Atendimento não encontrado.';
  end if;
  v_prof := coalesce(p_profissional, v_apt.professional_id);
  if not v_admin and v_prof is distinct from v_eu then
    raise exception 'Somente a administradora transfere atendimento para outro profissional.';
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
$$;

create trigger appointments_a_protecao
  before insert or update or delete on public.appointments
  for each row execute function public.appointments_protecao();

-- Tabelas antigas sem uso pelo app (transações/comissões avulsas, produtos):
-- só a administradora. O registro avulso de serviço (services) é lido pela equipe.
alter policy "transactions: usuários ativos" on public.transactions
  rename to "transactions: administradora";
alter policy "transactions: administradora" on public.transactions
  to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
alter policy "commissions: usuários ativos" on public.commissions
  rename to "commissions: administradora";
alter policy "commissions: administradora" on public.commissions
  to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
alter policy "expenses: usuários ativos" on public.expenses
  rename to "expenses: administradora";
alter policy "expenses: administradora" on public.expenses
  to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
alter policy "manual_incomes: usuários ativos" on public.manual_incomes
  rename to "manual_incomes: administradora";
alter policy "manual_incomes: administradora" on public.manual_incomes
  to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
alter policy "services: usuários ativos" on public.services
  rename to "services: administradora";
alter policy "services: administradora" on public.services
  to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "services: select" on public.services
  for select to authenticated using (public.usuario_ativo());
alter policy "products: usuários ativos" on public.products
  rename to "products: administradora";
alter policy "products: administradora" on public.products
  to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "products: select" on public.products
  for select to authenticated using (public.usuario_ativo());
alter policy "service_products: usuários ativos" on public.service_products
  rename to "service_products: administradora";
alter policy "service_products: administradora" on public.service_products
  to authenticated using (public.usuario_admin()) with check (public.usuario_admin());

-- -----------------------------------------------------------------------------
-- 5. Comissões: configuração, fechamento e assinatura digital
-- -----------------------------------------------------------------------------
create table public.taxas_pagamento (
  forma text primary key check (forma in ('pix', 'dinheiro', 'debito', 'credito', 'cartao', 'outro')),
  percentual numeric(5,2) not null default 0 check (percentual between 0 and 30),
  updated_at timestamptz not null default now()
);
insert into public.taxas_pagamento (forma, percentual) values
  ('pix', 0), ('dinheiro', 0), ('debito', 1.99), ('credito', 3.49), ('cartao', 3.49), ('outro', 0)
on conflict (forma) do nothing;

create table public.configuracoes_comissao (
  id boolean primary key default true check (id),
  descontar_taxa_pagamento boolean not null default true,
  descontar_custo_material boolean not null default false,
  dia_fechamento integer check (dia_fechamento is null or dia_fechamento between 1 and 28),
  updated_at timestamptz not null default now()
);
insert into public.configuracoes_comissao (id) values (true) on conflict (id) do nothing;

alter table public.taxas_pagamento enable row level security;
alter table public.configuracoes_comissao enable row level security;
revoke all on public.taxas_pagamento, public.configuracoes_comissao from anon;
create policy "taxas_pagamento: select" on public.taxas_pagamento
  for select to authenticated using (public.usuario_ativo());
create policy "taxas_pagamento: update" on public.taxas_pagamento
  for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "configuracoes_comissao: select" on public.configuracoes_comissao
  for select to authenticated using (public.usuario_ativo());
create policy "configuracoes_comissao: update" on public.configuracoes_comissao
  for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());

create table public.fechamentos (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.users(id),
  periodo_inicio date not null,
  periodo_fim date not null check (periodo_fim >= periodo_inicio),
  status text not null default 'aguardando_conferencia'
    check (status in ('aguardando_conferencia', 'contestado', 'assinado_pago', 'cancelado')),
  qtd_atendimentos integer not null check (qtd_atendimentos > 0),
  total_bruto numeric(12,2) not null,
  total_taxas numeric(12,2) not null,
  total_materiais numeric(12,2) not null,
  total_comissao numeric(12,2) not null,
  total_gorjetas numeric(12,2) not null,
  total_a_pagar numeric(12,2) not null,
  descontou_taxa boolean not null,
  descontou_material boolean not null,
  observacao text check (observacao is null or char_length(observacao) <= 1000),
  criado_por uuid references public.users(id),
  created_at timestamptz not null default now(),
  contestacao text check (contestacao is null or char_length(contestacao) <= 1000),
  contestado_em timestamptz,
  cancelado_em timestamptz,
  cancelamento_motivo text check (cancelamento_motivo is null or char_length(cancelamento_motivo) <= 1000),
  assinado_em timestamptz,
  assinado_por_auth uuid,
  assinado_ip text,
  assinado_user_agent text,
  assinatura_conteudo text,
  assinatura_hash text check (assinatura_hash is null or assinatura_hash ~ '^[0-9a-f]{64}$')
);
create index fechamentos_profissional_idx on public.fechamentos (profissional_id, periodo_inicio desc);

create table public.fechamento_itens (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos(id) on delete restrict,
  agendamento_id uuid not null references public.appointments(id) on delete restrict,
  data_atendimento timestamptz not null,
  cliente_nome text not null,
  servico_nome text not null,
  forma_pagamento text,
  valor_bruto numeric(10,2) not null,
  taxa_percentual numeric(5,2) not null,
  valor_taxa numeric(10,2) not null,
  custo_material numeric(10,2) not null,
  base_calculo numeric(10,2) not null,
  comissao_percentual numeric(5,2) not null,
  valor_comissao numeric(10,2) not null,
  gorjeta numeric(10,2) not null,
  valor_liquido numeric(10,2) not null,
  unique (fechamento_id, agendamento_id)
);
create index fechamento_itens_agendamento_idx on public.fechamento_itens (agendamento_id);

alter table public.fechamentos enable row level security;
alter table public.fechamento_itens enable row level security;
revoke all on public.fechamentos, public.fechamento_itens from anon;
-- Só leitura direta: gerar, contestar, cancelar e assinar passam pelas funções abaixo.
revoke insert, update, delete, truncate on public.fechamentos, public.fechamento_itens from authenticated;
create policy "fechamentos: select" on public.fechamentos
  for select to authenticated using (public.usuario_admin() or profissional_id = public.usuario_atual_id());
create policy "fechamento_itens: select" on public.fechamento_itens
  for select to authenticated using (
    exists (select 1 from public.fechamentos f where f.id = fechamento_id
             and (public.usuario_admin() or f.profissional_id = public.usuario_atual_id())));

-- Atendimentos concluídos do período ainda não incluídos em fechamento ativo,
-- já com taxa e material conforme a configuração vigente.
create or replace function public.fechamento_candidatos(p_profissional uuid, p_inicio date, p_fim date)
returns table (
  agendamento_id uuid, data_atendimento timestamptz, cliente_nome text, servico_nome text,
  forma_pagamento text, valor_bruto numeric, taxa_percentual numeric, custo_material numeric,
  comissao_percentual numeric, gorjeta numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    a.id,
    a.start_time,
    coalesce(c.name, 'Cliente')::text,
    coalesce(sv.nome, ls.name, 'Atendimento')::text,
    a.payment_method,
    coalesce(a.valor_cobrado, 0),
    case when cfg.descontar_taxa_pagamento then coalesce(tp.percentual, 0) else 0 end,
    case when cfg.descontar_custo_material then coalesce(sv.custo_material, 0) else 0 end,
    coalesce(a.comissao_percentual, 0),
    coalesce(a.gorjeta, 0)
  from public.appointments a
  cross join public.configuracoes_comissao cfg
  left join public.clients c on c.id = a.client_id
  left join public.servicos sv on sv.id = a.servico_id
  left join public.services ls on ls.id = a.service_id
  left join public.taxas_pagamento tp on tp.forma = a.payment_method
  where public.usuario_admin()
    and a.professional_id = p_profissional
    and a.status = 'completed'
    and coalesce(a.is_block, false) = false
    and coalesce(a.is_manual_reminder, false) = false
    and (a.start_time at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    and not exists (
      select 1 from public.fechamento_itens i join public.fechamentos f on f.id = i.fechamento_id
       where i.agendamento_id = a.id and f.status <> 'cancelado');
$$;

-- Gera o fechamento do período: agrupa os atendimentos concluídos ainda não
-- fechados, calcula taxa, material, comissão e gorjeta e grava como
-- "Aguardando conferência". Valores calculados no banco (VAL-07).
create or replace function public.gerar_fechamento(p_profissional uuid, p_inicio date, p_fim date, p_observacao text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg public.configuracoes_comissao%rowtype;
  v_id uuid;
  v_qtd integer;
begin
  if not public.usuario_admin() then
    raise exception 'Somente a administradora gera fechamentos.';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 92 then
    raise exception 'Período inválido (máximo de 3 meses).';
  end if;
  if not exists (select 1 from public.users where id = p_profissional) then
    raise exception 'Profissional não encontrado.';
  end if;
  if p_observacao is not null and char_length(p_observacao) > 1000 then
    raise exception 'Observação muito longa.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fechamento:' || p_profissional::text, 0));
  select * into v_cfg from public.configuracoes_comissao where id;
  if not found then
    raise exception 'Configuração de comissão ausente.';
  end if;

  select count(*) into v_qtd from public.fechamento_candidatos(p_profissional, p_inicio, p_fim);
  if v_qtd = 0 then
    raise exception 'Nenhum atendimento concluído e ainda não fechado neste período.';
  end if;

  insert into public.fechamentos (
    profissional_id, periodo_inicio, periodo_fim, qtd_atendimentos,
    total_bruto, total_taxas, total_materiais, total_comissao, total_gorjetas, total_a_pagar,
    descontou_taxa, descontou_material, observacao, criado_por
  ) values (
    p_profissional, p_inicio, p_fim, v_qtd, 0, 0, 0, 0, 0, 0,
    v_cfg.descontar_taxa_pagamento, v_cfg.descontar_custo_material,
    nullif(btrim(coalesce(p_observacao, '')), ''), public.usuario_atual_id()
  ) returning id into v_id;

  insert into public.fechamento_itens (
    fechamento_id, agendamento_id, data_atendimento, cliente_nome, servico_nome, forma_pagamento,
    valor_bruto, taxa_percentual, valor_taxa, custo_material, base_calculo,
    comissao_percentual, valor_comissao, gorjeta, valor_liquido
  )
  select v_id, x.agendamento_id, x.data_atendimento, x.cliente_nome, x.servico_nome, x.forma_pagamento,
         x.valor_bruto, x.taxa_percentual, x.valor_taxa, x.custo_material, x.base,
         x.comissao_percentual, x.valor_comissao, x.gorjeta, x.valor_comissao + x.gorjeta
    from (
      select i.*,
             round(i.valor_bruto * i.taxa_percentual / 100, 2) as valor_taxa,
             greatest(i.valor_bruto - round(i.valor_bruto * i.taxa_percentual / 100, 2) - i.custo_material, 0) as base,
             round(greatest(i.valor_bruto - round(i.valor_bruto * i.taxa_percentual / 100, 2) - i.custo_material, 0)
                   * i.comissao_percentual / 100, 2) as valor_comissao
        from public.fechamento_candidatos(p_profissional, p_inicio, p_fim) i
    ) x;

  -- Totais gravados uma única vez, a partir dos itens (o gatilho de
  -- imutabilidade só aceita essa gravação enquanto os totais estão zerados).
  update public.fechamentos f set
    total_bruto = t.bruto, total_taxas = t.taxas, total_materiais = t.materiais,
    total_comissao = t.comissao, total_gorjetas = t.gorjetas, total_a_pagar = t.liquido
  from (
    select sum(valor_bruto) bruto, sum(valor_taxa) taxas, sum(custo_material) materiais,
           sum(valor_comissao) comissao, sum(gorjeta) gorjetas, sum(valor_liquido) liquido
      from public.fechamento_itens where fechamento_id = v_id
  ) t
  where f.id = v_id;

  return v_id;
end;
$$;

-- Itens são imutáveis; fechamento assinado ou cancelado não muda mais. Os totais
-- só podem ser gravados uma vez (no nascimento, quando ainda estão zerados).
create or replace function public.fechamentos_imutavel()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'fechamento_itens' then
    raise exception 'Itens de fechamento não podem ser alterados.';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Fechamento não pode ser excluído; cancele com motivo.';
  end if;
  if old.status in ('assinado_pago', 'cancelado') then
    raise exception 'Fechamento já encerrado não pode ser alterado.';
  end if;
  if new.profissional_id <> old.profissional_id
     or new.periodo_inicio <> old.periodo_inicio or new.periodo_fim <> old.periodo_fim
     or (old.total_a_pagar <> 0 and new.total_a_pagar <> old.total_a_pagar)
     or (old.total_bruto <> 0 and new.total_bruto <> old.total_bruto) then
    raise exception 'Valores do fechamento não podem ser alterados.';
  end if;
  return new;
end;
$$;
create trigger fechamentos_a_imutavel
  before update or delete on public.fechamentos
  for each row execute function public.fechamentos_imutavel();
create trigger fechamento_itens_a_imutavel
  before update or delete on public.fechamento_itens
  for each row execute function public.fechamentos_imutavel();

-- Conteúdo assinado: identifica o fechamento, quem assinou, quando, de onde, o
-- total e um resumo (hash) de todos os itens. Guardado por extenso para
-- conferência; o hash SHA-256 prova que nada mudou depois.
create or replace function public.fechamento_resumo_itens(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select encode(digest(coalesce(string_agg(
           concat_ws(';', agendamento_id, to_char(data_atendimento at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                     valor_bruto, valor_taxa, custo_material, comissao_percentual, valor_comissao, gorjeta, valor_liquido),
           '|' order by agendamento_id), ''), 'sha256'), 'hex')
    from public.fechamento_itens where fechamento_id = p_id;
$$;

create or replace function public.assinar_fechamento(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_f public.fechamentos%rowtype;
  v_cab jsonb;
  v_ip text;
  v_ua text;
  v_momento timestamptz := clock_timestamp();
  v_conteudo text;
  v_hash text;
begin
  select * into v_f from public.fechamentos where id = p_id for update;
  if not found or v_f.profissional_id is distinct from public.usuario_atual_id() then
    raise exception 'Fechamento não encontrado.';
  end if;
  if v_f.status <> 'aguardando_conferencia' then
    raise exception 'Este fechamento não está aguardando conferência.';
  end if;

  begin
    v_cab := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_cab := null;
  end;
  v_ip := left(coalesce(v_cab ->> 'cf-connecting-ip', btrim(split_part(v_cab ->> 'x-forwarded-for', ',', 1)), v_cab ->> 'x-real-ip', 'desconhecido'), 64);
  v_ua := left(v_cab ->> 'user-agent', 300);

  v_conteudo := concat_ws('|',
    'fechamento=' || v_f.id,
    'profissional=' || v_f.profissional_id,
    'conta=' || auth.uid(),
    'periodo=' || v_f.periodo_inicio || '..' || v_f.periodo_fim,
    'total=' || to_char(v_f.total_a_pagar, 'FM9999999990.00'),
    'itens=' || public.fechamento_resumo_itens(v_f.id),
    'momento=' || to_char(v_momento at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'ip=' || v_ip);
  v_hash := encode(digest(v_conteudo, 'sha256'), 'hex');

  update public.fechamentos set
    status = 'assinado_pago',
    assinado_em = v_momento,
    assinado_por_auth = auth.uid(),
    assinado_ip = v_ip,
    assinado_user_agent = v_ua,
    assinatura_conteudo = v_conteudo,
    assinatura_hash = v_hash
  where id = p_id;
  return v_hash;
end;
$$;

-- Confere se o fechamento assinado continua íntegro (itens e conteúdo batem com o hash).
create or replace function public.verificar_fechamento(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_f public.fechamentos%rowtype;
begin
  select * into v_f from public.fechamentos where id = p_id
     and (public.usuario_admin() or profissional_id = public.usuario_atual_id());
  if not found or v_f.assinatura_hash is null then
    return false;
  end if;
  return encode(digest(v_f.assinatura_conteudo, 'sha256'), 'hex') = v_f.assinatura_hash
     and position('itens=' || public.fechamento_resumo_itens(v_f.id) in v_f.assinatura_conteudo) > 0
     and position('total=' || to_char(v_f.total_a_pagar, 'FM9999999990.00') in v_f.assinatura_conteudo) > 0;
end;
$$;

create or replace function public.contestar_fechamento(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if char_length(btrim(coalesce(p_motivo, ''))) not between 5 and 1000 then
    raise exception 'Explique o motivo da contestação (5 a 1000 caracteres).';
  end if;
  update public.fechamentos set status = 'contestado', contestacao = btrim(p_motivo), contestado_em = now()
   where id = p_id and profissional_id = public.usuario_atual_id() and status = 'aguardando_conferencia';
  if not found then
    raise exception 'Este fechamento não está aguardando conferência.';
  end if;
end;
$$;

create or replace function public.cancelar_fechamento(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.usuario_admin() then
    raise exception 'Somente a administradora cancela fechamentos.';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 5 and 1000 then
    raise exception 'Informe o motivo do cancelamento (5 a 1000 caracteres).';
  end if;
  update public.fechamentos set status = 'cancelado', cancelamento_motivo = btrim(p_motivo), cancelado_em = now()
   where id = p_id and status in ('aguardando_conferencia', 'contestado');
  if not found then
    raise exception 'Só é possível cancelar fechamento aguardando conferência ou contestado.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Kanban: tarefas visíveis ao responsável e envolvidos; comentários (threads)
-- -----------------------------------------------------------------------------
create or replace function public.tarefa_visivel(p_responsavel uuid, p_envolvidos uuid[], p_criador uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.usuario_admin()
      or (public.usuario_atual_id() is not null and (
           p_responsavel = public.usuario_atual_id()
           or p_criador = public.usuario_atual_id()
           or public.usuario_atual_id() = any (coalesce(p_envolvidos, '{}'))));
$$;

alter policy "internal_tasks: select" on public.internal_tasks
  using (public.tarefa_visivel(responsible_id, envolvidos, created_by));
alter policy "internal_tasks: update" on public.internal_tasks
  using (public.tarefa_visivel(responsible_id, envolvidos, created_by))
  with check (public.usuario_ativo());
alter policy "internal_tasks: delete" on public.internal_tasks
  using (public.usuario_admin() or created_by = public.usuario_atual_id());
alter policy "tarefa_itens: select" on public.tarefa_itens
  using (exists (select 1 from public.internal_tasks t where t.id = task_id));
alter policy "tarefa_itens: insert" on public.tarefa_itens
  with check (exists (select 1 from public.internal_tasks t where t.id = task_id));
alter policy "tarefa_itens: update" on public.tarefa_itens
  using (exists (select 1 from public.internal_tasks t where t.id = task_id))
  with check (exists (select 1 from public.internal_tasks t where t.id = task_id));
alter policy "tarefa_itens: delete" on public.tarefa_itens
  using (exists (select 1 from public.internal_tasks t where t.id = task_id));

create table public.tarefa_comentarios (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.internal_tasks(id) on delete cascade,
  autor_id uuid references public.users(id) on delete set null,
  texto text not null check (char_length(btrim(texto)) between 1 and 2000),
  created_at timestamptz not null default now(),
  editado_em timestamptz
);
create index tarefa_comentarios_task_idx on public.tarefa_comentarios (task_id, created_at);
alter table public.tarefa_comentarios enable row level security;
revoke all on public.tarefa_comentarios from anon;

create or replace function public.tarefa_comentarios_autor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.autor_id := public.usuario_atual_id();
    new.created_at := now();
    new.editado_em := null;
  else
    new.autor_id := old.autor_id;
    new.task_id := old.task_id;
    new.created_at := old.created_at;
    new.editado_em := now();
  end if;
  return new;
end;
$$;
create trigger tarefa_comentarios_a_autor
  before insert or update on public.tarefa_comentarios
  for each row execute function public.tarefa_comentarios_autor();

create policy "tarefa_comentarios: select" on public.tarefa_comentarios
  for select to authenticated using (exists (select 1 from public.internal_tasks t where t.id = task_id));
create policy "tarefa_comentarios: insert" on public.tarefa_comentarios
  for insert to authenticated with check (
    public.usuario_ativo() and exists (select 1 from public.internal_tasks t where t.id = task_id));
create policy "tarefa_comentarios: update" on public.tarefa_comentarios
  for update to authenticated
  using (autor_id = public.usuario_atual_id())
  with check (autor_id = public.usuario_atual_id());
create policy "tarefa_comentarios: delete" on public.tarefa_comentarios
  for delete to authenticated using (public.usuario_admin() or autor_id = public.usuario_atual_id());

-- -----------------------------------------------------------------------------
-- 7. Auditoria dos módulos novos (LOG-05)
-- -----------------------------------------------------------------------------
alter table public.access_logs drop constraint if exists access_logs_acao_check;
alter table public.access_logs add constraint access_logs_acao_check check (acao in (
  'login', 'login_negado', 'logout', 'usuario_criado', 'permissao_alterada', 'alterou', 'excluiu',
  'fechamento_gerado', 'fechamento_assinado', 'fechamento_contestado', 'fechamento_cancelado'
));

create or replace function public.auditar_fechamento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.auditoria_gravar('fechamento_gerado', 'fechamentos', new.id::text,
      jsonb_build_object('profissional', new.profissional_id, 'inicio', new.periodo_inicio, 'fim', new.periodo_fim));
  elsif new.status is distinct from old.status then
    perform public.auditoria_gravar(
      case new.status when 'assinado_pago' then 'fechamento_assinado'
                      when 'contestado' then 'fechamento_contestado'
                      when 'cancelado' then 'fechamento_cancelado' else 'alterou' end,
      'fechamentos', new.id::text,
      jsonb_build_object('total', new.total_a_pagar, 'hash', new.assinatura_hash));
  end if;
  return null;
end;
$$;
create trigger fechamentos_auditoria
  after insert or update on public.fechamentos
  for each row execute function public.auditar_fechamento();

-- Auditoria para tabelas sem coluna "id" simples (chave composta ou natural).
create or replace function public.auditar_alteracao_generica()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_linha jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_id text;
begin
  v_id := coalesce(
    v_linha ->> 'id',
    nullif(concat_ws(':', v_linha ->> 'user_id', v_linha ->> 'servico_id'), ''),
    v_linha ->> 'forma');
  perform public.auditoria_gravar(case when tg_op = 'DELETE' then 'excluiu' else 'alterou' end, tg_table_name, v_id, null);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  -- Alterações de dados sensíveis do profissional e da divisão de lucros.
  foreach t in array array['perfis_profissionais', 'usuario_servico', 'servicos', 'taxas_pagamento', 'configuracoes_comissao'] loop
    execute format(
      'create trigger %I after update on public.%I for each row execute function public.auditar_alteracao_generica()',
      t || '_auditoria_alteracao', t);
  end loop;
  foreach t in array array['perfis_profissionais', 'usuario_servico', 'servicos', 'categorias_servico', 'cliente_historico', 'tarefa_comentarios'] loop
    execute format(
      'create trigger %I after delete on public.%I for each row execute function public.auditar_alteracao_generica()',
      t || '_auditoria_exclusao', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Tempo real (painel do profissional e lista de fechamentos)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['appointments', 'fechamentos'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Permissões das funções: nada para visitante; funções internas e de
--    gatilho nem para o usuário logado.
-- -----------------------------------------------------------------------------
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

revoke execute on function
  public.perfis_profissionais_normalizar(),
  public.users_protege_ultima_admin(),
  public.cliente_historico_autor(),
  public.appointments_protecao(),
  public.agenda_conflito(uuid, timestamptz, timestamptz, uuid),
  public.fechamento_candidatos(uuid, date, date),
  public.fechamentos_imutavel(),
  public.fechamento_resumo_itens(uuid),
  public.tarefa_comentarios_autor(),
  public.auditar_fechamento(),
  public.auditar_alteracao_generica()
from authenticated;

grant execute on function
  public.usuario_atual_id(),
  public.somente_digitos(text),
  public.cpf_valido(text),
  public.cnpj_valido(text),
  public.mascarar_telefone(text),
  public.mascarar_email(text),
  public.salvar_preferencias_ui(jsonb),
  public.cadastrar_cliente_rapido(text, text),
  public.habilitar_servicos(uuid, uuid[], boolean),
  public.servico_condicoes(uuid, uuid),
  public.agendar_atendimento(uuid, uuid, uuid, timestamptz, text, numeric, integer, text, text),
  public.remarcar_atendimento(uuid, timestamptz, uuid),
  public.gerar_fechamento(uuid, date, date, text),
  public.assinar_fechamento(uuid),
  public.verificar_fechamento(uuid),
  public.contestar_fechamento(uuid, text),
  public.cancelar_fechamento(uuid, text),
  public.tarefa_visivel(uuid, uuid[], uuid)
to authenticated;

commit;

-- Conferência depois de aplicar (todas devem voltar 0 linhas):
--   select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
--   select tablename, policyname from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true');
--   select a.id from appointments a join appointments b on a.id < b.id and a.professional_id = b.professional_id
--    and tstzrange(a.start_time, a.end_time) && tstzrange(b.start_time, b.end_time)
--    and a.status in ('scheduled','confirmed','completed') and b.status in ('scheduled','confirmed','completed')
--    and not coalesce(a.is_manual_reminder, false) and not coalesce(b.is_manual_reminder, false);
