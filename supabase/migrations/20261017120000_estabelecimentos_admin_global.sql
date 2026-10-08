-- =============================================================================
-- Vários estabelecimentos (SaaS) e administração global.
--
-- APLICADA em produção em 2026-10-08 com autorização explícita do usuário (DEV-02),
-- em 13 partes (estabelecimentos_1 a estabelecimentos_7), com o mesmo SQL deste arquivo.
--
-- Base: docs/especificacoes/administracao-global.md (adaptação da especificação
-- "Administração Global de um SaaS com várias organizações"). Termos:
--   escritório -> estabelecimento (salão); perfil -> public.users;
--   advogados/estagiários/secretárias -> profissionais; processos -> clientes.
--
-- Por que existe: até aqui o banco era de um salão só. Para o painel global criar
-- outros salões sem que um veja os dados do outro, todo dado de negócio passa a
-- pertencer a um estabelecimento:
--  1. tabela estabelecimentos (plano, situação, limites) e o Studio Labeli como o
--     primeiro, premium e sem limites (nada muda para quem já usa);
--  2. coluna estabelecimento_id em todas as tabelas do app, com:
--     - política RLS RESTRITIVA (soma-se às políticas atuais com AND): só linhas do
--       estabelecimento da sessão;
--     - gatilho de guarda: grava só no próprio estabelecimento e só referência a
--       registro do mesmo estabelecimento, inclusive dentro de funções security
--       definer (que ignoram o RLS);
--  3. funções de sessão (usuario_ativo, usuario_admin, usuario_atual_id) só
--     respondem para estabelecimento ATIVO: desativado ou excluído não enxerga nada;
--  4. funções que leem dados por conta própria (security definer) filtram pelo
--     estabelecimento da sessão;
--  5. limites do plano por gatilho (valem até para a service role);
--  6. administradores globais numa tabela sem nenhuma política; o painel só vê
--     cadastro e contagens e exige MFA concluído (aal2) no token;
--  7. demonstração vencida bloqueia gravação nos módulos pagos, no banco.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Estabelecimentos
-- -----------------------------------------------------------------------------

create table public.estabelecimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 200),
  plano text not null default 'demonstracao' check (plano in ('demonstracao', 'basico', 'premium')),
  status text not null default 'ativo' check (status in ('ativo', 'desativado', 'excluido')),
  demo_expira_em timestamptz,
  max_profissionais integer default 2 check (max_profissionais is null or max_profissionais between 0 and 10000),
  max_clientes integer check (max_clientes is null or max_clientes between 0 and 1000000),
  desativado_em timestamptz,
  excluido_em timestamptz,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estabelecimentos_demo_check check (plano <> 'demonstracao' or demo_expira_em is not null)
);

alter table public.estabelecimentos enable row level security;
revoke all on public.estabelecimentos from anon;
-- Só leitura do próprio (política abaixo); mudanças só pelas funções do painel global.
revoke insert, update, delete, truncate on public.estabelecimentos from authenticated;

-- O salão que já usa o sistema: premium, sem demonstração e sem limites.
insert into public.estabelecimentos (id, nome, plano, max_profissionais, max_clientes)
values ('5a1ab0e1-0000-4000-8000-000000000001', 'Studio Labeli', 'premium', null, null);

-- -----------------------------------------------------------------------------
-- 2. Dono de cada registro: estabelecimento_id em todas as tabelas do app
-- -----------------------------------------------------------------------------
-- O valor padrão constante preenche as linhas existentes sem UPDATE (nenhum
-- gatilho dispara); logo depois o padrão passa a ser o estabelecimento da sessão.

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'clients', 'appointments', 'cliente_historico', 'commissions', 'transactions',
    'services', 'products', 'service_products', 'expenses', 'manual_incomes', 'personal_finances',
    'categorias_servico', 'servicos', 'usuario_servico', 'perfis_profissionais',
    'taxas_pagamento', 'configuracoes_comissao', 'fechamentos', 'fechamento_itens',
    'pacotes', 'pacote_itens', 'pacote_pagamentos', 'pacote_movimentos',
    'kanban_quadros', 'kanban_colunas', 'kanban_compartilhamentos', 'kanban_grupos', 'kanban_quadro_grupo',
    'internal_tasks', 'tarefa_itens', 'tarefa_comentarios'
  ] loop
    execute format(
      'alter table public.%I add column estabelecimento_id uuid not null default %L references public.estabelecimentos(id) on delete restrict',
      t, '5a1ab0e1-0000-4000-8000-000000000001');
    execute format('create index %I on public.%I (estabelecimento_id)', t || '_estabelecimento_idx', t);
  end loop;
end;
$$;

-- Trilha de auditoria: de qual estabelecimento é o evento (nulo em eventos sem sessão).
alter table public.access_logs
  add column estabelecimento_id uuid default '5a1ab0e1-0000-4000-8000-000000000001'
  references public.estabelecimentos(id) on delete restrict;
create index access_logs_estabelecimento_idx on public.access_logs (estabelecimento_id);
alter table public.access_logs drop constraint if exists access_logs_acao_check;
alter table public.access_logs add constraint access_logs_acao_check check (acao in (
  'login', 'login_negado', 'logout', 'usuario_criado', 'permissao_alterada', 'alterou', 'excluiu',
  'fechamento_gerado', 'fechamento_assinado', 'fechamento_contestado', 'fechamento_cancelado',
  'pacote_vendido', 'pacote_renovado', 'pacote_anulado', 'estabelecimento_criado'
));

-- Estabelecimento ATIVO da sessão (perfil ativo de estabelecimento ativo). Nulo = sem acesso.
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
   where u.auth_id = auth.uid() and u.active is true
   limit 1;
$$;
revoke all on function public.estabelecimento_atual() from public, anon;
-- Usada pelas políticas e pelos valores padrão (rodam como a pessoa logada).
grant execute on function public.estabelecimento_atual() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'clients', 'appointments', 'cliente_historico', 'commissions', 'transactions',
    'services', 'products', 'service_products', 'expenses', 'manual_incomes', 'personal_finances',
    'categorias_servico', 'servicos', 'usuario_servico', 'perfis_profissionais',
    'taxas_pagamento', 'configuracoes_comissao', 'fechamentos', 'fechamento_itens',
    'pacotes', 'pacote_itens', 'pacote_pagamentos', 'pacote_movimentos',
    'kanban_quadros', 'kanban_colunas', 'kanban_compartilhamentos', 'kanban_grupos', 'kanban_quadro_grupo',
    'internal_tasks', 'tarefa_itens', 'tarefa_comentarios', 'access_logs'
  ] loop
    execute format('alter table public.%I alter column estabelecimento_id set default public.estabelecimento_atual()', t);
    -- Restritiva: vale junto (AND) com as políticas de cada operação que a tabela já tem.
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using (estabelecimento_id = (select public.estabelecimento_atual())) '
      'with check (estabelecimento_id = (select public.estabelecimento_atual()))',
      t || ': mesmo estabelecimento', t);
  end loop;
end;
$$;

-- Configuração e taxas passam a ser uma por estabelecimento; nomes únicos por estabelecimento.
alter table public.taxas_pagamento drop constraint taxas_pagamento_pkey;
alter table public.taxas_pagamento add constraint taxas_pagamento_pkey primary key (estabelecimento_id, forma);
alter table public.configuracoes_comissao drop constraint configuracoes_comissao_pkey;
alter table public.configuracoes_comissao add constraint configuracoes_comissao_pkey primary key (estabelecimento_id);
alter table public.categorias_servico drop constraint categorias_servico_nome_key;
alter table public.categorias_servico add constraint categorias_servico_estabelecimento_nome_key unique (estabelecimento_id, nome);
alter table public.perfis_profissionais drop constraint perfis_profissionais_cpf_key;
alter table public.perfis_profissionais add constraint perfis_profissionais_estabelecimento_cpf_key unique (estabelecimento_id, cpf);

-- O próprio estabelecimento (nome, plano, situação) é lido por quem é dele.
create policy "estabelecimentos: select" on public.estabelecimentos
  for select to authenticated using (id = (select public.estabelecimento_atual()));

-- -----------------------------------------------------------------------------
-- 3. Guarda: gravação só no próprio estabelecimento, com referências do mesmo
-- -----------------------------------------------------------------------------
-- Vale também dentro de funções security definer (o RLS não vale para elas).
-- Sem sessão (service role, rotinas do servidor) só confere a coerência das referências.
create or replace function public.estabelecimento_guarda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atual uuid;
  v_fk record;
  v_valor text;
  v_antes text;
  v_pai uuid;
begin
  -- Sessão sem estabelecimento ativo não chega a gravar: o RLS barra a API, as funções
  -- conferem usuario_ativo() e a coluna obrigatória recusa o padrão nulo.
  v_atual := case when auth.uid() is not null then public.estabelecimento_atual() end;
  if v_atual is not null then
    if tg_op in ('UPDATE', 'DELETE') and old.estabelecimento_id is distinct from v_atual then
      raise exception 'outro_estabelecimento' using errcode = '42501';
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.estabelecimento_id is distinct from v_atual then
      raise exception 'outro_estabelecimento' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.estabelecimento_id is distinct from old.estabelecimento_id then
    raise exception 'estabelecimento_imutavel' using errcode = '42501';
  end if;
  -- Toda chave estrangeira simples para outra tabela do app aponta para o mesmo estabelecimento.
  for v_fk in
    select a.attname as coluna, c.confrelid::regclass::text as pai, af.attname as coluna_pai,
           format_type(af.atttypid, af.atttypmod) as tipo
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
     where c.conrelid = tg_relid and c.contype = 'f' and cardinality(c.conkey) = 1
       and a.attname <> 'estabelecimento_id'
       and exists (select 1 from pg_attribute x
                    where x.attrelid = c.confrelid and x.attname = 'estabelecimento_id' and not x.attisdropped)
  loop
    execute format('select ($1).%I::text', v_fk.coluna) into v_valor using new;
    continue when v_valor is null;
    if tg_op = 'UPDATE' then
      execute format('select ($1).%I::text', v_fk.coluna) into v_antes using old;
      continue when v_antes is not distinct from v_valor;
    end if;
    execute format('select estabelecimento_id from %s where %I = ($1)::%s', v_fk.pai, v_fk.coluna_pai, v_fk.tipo)
      into v_pai using v_valor;
    if v_pai is distinct from new.estabelecimento_id then
      raise exception 'referencia_de_outro_estabelecimento' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function public.estabelecimento_guarda() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'clients', 'appointments', 'cliente_historico', 'commissions', 'transactions',
    'services', 'products', 'service_products', 'expenses', 'manual_incomes', 'personal_finances',
    'categorias_servico', 'servicos', 'usuario_servico', 'perfis_profissionais',
    'taxas_pagamento', 'configuracoes_comissao', 'fechamentos', 'fechamento_itens',
    'pacotes', 'pacote_itens', 'pacote_pagamentos', 'pacote_movimentos',
    'kanban_quadros', 'kanban_colunas', 'kanban_compartilhamentos', 'kanban_grupos', 'kanban_quadro_grupo',
    'internal_tasks', 'tarefa_itens', 'tarefa_comentarios'
  ] loop
    -- "a0_" para rodar antes dos demais gatilhos "before" da tabela.
    execute format(
      'create trigger a0_estabelecimento_guarda before insert or update or delete on public.%I '
      'for each row execute function public.estabelecimento_guarda()', t);
  end loop;
end;
$$;

-- Situação do estabelecimento de quem está logado: com ele inativo, o RLS não deixa
-- ler nem o próprio perfil, e a tela precisa dizer o motivo.
create or replace function public.minha_situacao_estabelecimento()
returns table (status text, plano text, demo_expira_em timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.status, e.plano, e.demo_expira_em
    from public.users u join public.estabelecimentos e on e.id = u.estabelecimento_id
   where u.auth_id = auth.uid() and u.active is true
   limit 1;
$$;
revoke all on function public.minha_situacao_estabelecimento() from public, anon;
grant execute on function public.minha_situacao_estabelecimento() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Sessão só vale em estabelecimento ativo; funções que leem por conta própria
--    filtram pelo estabelecimento da sessão
-- -----------------------------------------------------------------------------

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
     where u.auth_id = auth.uid() and u.active is true);
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
     where u.auth_id = auth.uid() and u.active is true and u.role = 'admin');
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
   where u.auth_id = auth.uid() and u.active is true
   limit 1;
$$;

CREATE OR REPLACE FUNCTION public.kanban_usuario_atual()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  v_id := public.usuario_atual_id();
  if v_id is null then
    raise exception 'Acesso ainda não liberado.';
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.users_protege_ultima_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' and old.active is true
       and not exists (select 1 from public.users where id <> old.id and role = 'admin' and active is true
                         and estabelecimento_id = old.estabelecimento_id) then
      raise exception 'É preciso manter ao menos uma administradora ativa.';
    end if;
    return old;
  end if;
  if old.role = 'admin' and old.active is true and (new.role <> 'admin' or new.active is not true)
     and not exists (select 1 from public.users where id <> old.id and role = 'admin' and active is true
                         and estabelecimento_id = old.estabelecimento_id) then
    raise exception 'É preciso manter ao menos uma administradora ativa.';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.kanban_permissao(p_quadro uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_eu uuid := public.usuario_atual_id();
  v_escopo text;
  v_dono uuid;
  v_pessoa text;
  v_negocio text;
begin
  if v_eu is null then
    return null;
  end if;
  select escopo, dono_id into v_escopo, v_dono from public.kanban_quadros
   where id = p_quadro and estabelecimento_id = public.estabelecimento_atual();
  if not found then
    return null;
  end if;
  if v_dono = v_eu then
    return 'editar';
  end if;
  select permissao into v_pessoa from public.kanban_compartilhamentos
   where quadro_id = p_quadro and destino = 'pessoa' and user_id = v_eu;
  if v_escopo = 'negocio' then
    if public.usuario_admin() then
      return 'editar';
    end if;
    return coalesce(v_pessoa, 'editar');
  end if;
  select permissao into v_negocio from public.kanban_compartilhamentos
   where quadro_id = p_quadro and destino = 'negocio';
  if v_pessoa = 'editar' or v_negocio = 'editar' then
    return 'editar';
  end if;
  return coalesce(v_pessoa, v_negocio);
end;
$function$;

CREATE OR REPLACE FUNCTION public.kanban_gerencia(p_quadro uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((
    select q.dono_id = public.usuario_atual_id()
           or (q.escopo = 'negocio' and public.usuario_admin())
      from public.kanban_quadros q
     where q.id = p_quadro and q.estabelecimento_id = public.estabelecimento_atual()), false);
$function$;

CREATE OR REPLACE FUNCTION public.kanban_quadros_protege_unico()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.escopo = 'negocio' and (select count(*) from public.kanban_quadros where escopo = 'negocio' and estabelecimento_id = old.estabelecimento_id) <= 1 then
    raise exception 'Este é o único quadro do negócio. Crie outro antes de excluí-lo.';
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.kanban_garantir_padrao()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.kanban_usuario_atual();
  perform pg_advisory_xact_lock(hashtext('kanban_garantir_padrao' || coalesce(public.estabelecimento_atual()::text, '')));
  if not exists (select 1 from public.kanban_quadros where escopo = 'negocio' and estabelecimento_id = public.estabelecimento_atual()) then
    perform public.kanban_criar_quadro(
      'Kanban Padrão',
      '[{"nome":"A Fazer"},{"nome":"Fazendo"},{"nome":"Concluído"}]'::jsonb,
      'negocio'
    );
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.kanban_definir_visao(p_quadro uuid, p_visao text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_eu uuid := public.kanban_usuario_atual();
  v_escopo text;
  v_dono uuid;
  v_novo_escopo text;
  v_novo_dono uuid;
  v_est uuid := public.estabelecimento_atual();
begin
  select escopo, dono_id into v_escopo, v_dono from public.kanban_quadros where id = p_quadro for update;
  if not found or not public.kanban_gerencia(p_quadro) then
    raise exception 'Só quem é dono do quadro pode mudar onde ele aparece.';
  end if;
  if p_visao is null or p_visao not in ('negocio', 'pessoal', 'ambos') then
    raise exception 'Visualização inválida.';
  end if;
  if p_visao = 'negocio' and not public.usuario_admin() then
    raise exception 'Só a administradora pode deixar um quadro apenas no negócio.';
  end if;

  v_novo_escopo := case when p_visao = 'pessoal' then 'pessoal' else 'negocio' end;
  v_novo_dono := case when p_visao = 'negocio' then null else coalesce(v_dono, v_eu) end;

  if v_escopo = 'negocio' and v_novo_escopo = 'pessoal'
     and (select count(*) from public.kanban_quadros where escopo = 'negocio' and estabelecimento_id = v_est) <= 1 then
    raise exception 'Este é o único quadro do negócio. Crie outro antes de tirá-lo do negócio.';
  end if;
  if v_novo_escopo = 'negocio'
     and exists (select 1 from public.kanban_compartilhamentos where quadro_id = p_quadro and destino = 'negocio') then
    raise exception 'Remova o compartilhamento com o negócio antes de mudar a visualização.';
  end if;

  update public.kanban_quadros set escopo = v_novo_escopo, dono_id = v_novo_dono where id = p_quadro;
end;
$function$;

CREATE OR REPLACE FUNCTION public.kanban_compartilhar(p_quadro uuid, p_destino text, p_user uuid, p_permissao text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_eu uuid := public.kanban_usuario_atual();
  v_escopo text;
  v_dono uuid;
  v_id uuid;
begin
  select escopo, dono_id into v_escopo, v_dono from public.kanban_quadros where id = p_quadro for update;
  if not found or not public.kanban_gerencia(p_quadro) then
    raise exception 'Só quem é dono do quadro pode compartilhá-lo.';
  end if;
  if p_permissao is null or p_permissao not in ('ver', 'editar') then
    raise exception 'Permissão inválida.';
  end if;
  if p_destino = 'negocio' then
    if v_escopo = 'negocio' then
      raise exception 'Este quadro já é do negócio.';
    end if;
    update public.kanban_compartilhamentos set permissao = p_permissao
     where quadro_id = p_quadro and destino = 'negocio' returning id into v_id;
    if v_id is null then
      insert into public.kanban_compartilhamentos (quadro_id, destino, permissao, criado_por)
      values (p_quadro, 'negocio', p_permissao, v_eu) returning id into v_id;
    end if;
  elsif p_destino = 'pessoa' then
    if p_user is null or not exists (select 1 from public.users where id = p_user and active is true
                                          and estabelecimento_id = public.estabelecimento_atual()) then
      raise exception 'Escolha uma pessoa ativa da equipe.';
    end if;
    if v_escopo = 'pessoal' and p_user = v_dono then
      raise exception 'O quadro já é dessa pessoa.';
    end if;
    update public.kanban_compartilhamentos set permissao = p_permissao
     where quadro_id = p_quadro and destino = 'pessoa' and user_id = p_user returning id into v_id;
    if v_id is null then
      insert into public.kanban_compartilhamentos (quadro_id, destino, user_id, permissao, criado_por)
      values (p_quadro, 'pessoa', p_user, p_permissao, v_eu) returning id into v_id;
    end if;
  else
    raise exception 'Destino inválido.';
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pacote_saldos(p_cliente uuid DEFAULT NULL::uuid, p_incluir_encerrados boolean DEFAULT false)
 RETURNS TABLE(pacote_id uuid, cliente_id uuid, pacote_nome text, status text, validade date, vencido boolean, vendido_em timestamp with time zone, item_id uuid, servico_id uuid, servico_nome text, sessoes integer, usadas integer, faltas integer, reservadas integer, disponiveis integer, valor_sessao numeric, valor_restante numeric, comissao_percentual numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with base as (
    select p.id as pid, p.cliente_id as cid, p.nome as pnome, p.status as pstatus, p.validade as pval,
           p.validade < public.hoje_local() as venc, p.vendido_em as vend,
           i.id as iid, i.servico_id as sid, s.nome as snome, i.sessoes as qtd, i.valor_item, i.valor_sessao as vs, i.comissao_percentual as com,
           (select count(*) from public.pacote_movimentos m where m.item_id = i.id and m.tipo = 'uso')::integer as usos,
           (select count(*) from public.pacote_movimentos m where m.item_id = i.id and m.tipo = 'falta')::integer as fal,
           (select count(*) from public.appointments a
             where a.pacote_item_id = i.id and a.status in ('scheduled', 'confirmed')
               and coalesce(a.is_manual_reminder, false) = false)::integer as res,
           (select coalesce(sum(m.valor), 0) from public.pacote_movimentos m
             where m.item_id = i.id and m.tipo in ('uso', 'falta')) as consumido
      from public.pacotes p
      join public.pacote_itens i on i.pacote_id = p.id
      join public.servicos s on s.id = i.servico_id
     where public.usuario_ativo()
       and p.estabelecimento_id = public.estabelecimento_atual()
       and (p_cliente is not null or public.usuario_admin())
       and (p_cliente is null or p.cliente_id = p_cliente)
       and (p_incluir_encerrados or (p.status = 'ativo' and p.validade >= public.hoje_local()))
  )
  select pid, cid, pnome, pstatus, pval, venc, vend, iid, sid, snome, qtd, usos, fal, res,
         case when pstatus = 'ativo' and not venc then greatest(qtd - usos - fal - res, 0) else 0 end,
         case when public.usuario_admin() then vs end,
         case when public.usuario_admin() then valor_item - consumido end,
         case when public.usuario_admin() then com end
    from base
   order by pval, pnome, snome;
$function$;

CREATE OR REPLACE FUNCTION public.servico_condicoes(p_profissional uuid, p_servico uuid)
 RETURNS TABLE(oferece boolean, valor numeric, minutos integer, comissao numeric, custo_material numeric, nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    and s.estabelecimento_id = public.estabelecimento_atual()
    and public.usuario_ativo()
    and (public.usuario_admin() or p_profissional = public.usuario_atual_id());
$function$;

CREATE OR REPLACE FUNCTION public.verificar_fechamento(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_f public.fechamentos%rowtype;
begin
  select * into v_f from public.fechamentos where id = p_id and estabelecimento_id = public.estabelecimento_atual()
     and (public.usuario_admin() or profissional_id = public.usuario_atual_id());
  if not found or v_f.assinatura_hash is null then
    return false;
  end if;
  return encode(digest(v_f.assinatura_conteudo, 'sha256'), 'hex') = v_f.assinatura_hash
     and position('itens=' || public.fechamento_resumo_itens(v_f.id) in v_f.assinatura_conteudo) > 0
     and position('total=' || to_char(v_f.total_a_pagar, 'FM9999999990.00') in v_f.assinatura_conteudo) > 0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fechamento_candidatos(p_profissional uuid, p_inicio date, p_fim date)
 RETURNS TABLE(agendamento_id uuid, data_atendimento timestamp with time zone, cliente_nome text, servico_nome text, forma_pagamento text, valor_bruto numeric, taxa_percentual numeric, custo_material numeric, comissao_percentual numeric, gorjeta numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    a.id,
    a.start_time,
    coalesce(c.name, 'Cliente')::text,
    coalesce(sv.nome, ls.name, 'Atendimento')::text,
    a.payment_method,
    coalesce(a.valor_cobrado, 0),
    case when cfg.descontar_taxa_pagamento then coalesce(a.taxa_percentual, tp.percentual, 0) else 0 end,
    case when cfg.descontar_custo_material then coalesce(sv.custo_material, 0) else 0 end,
    coalesce(a.comissao_percentual, 0),
    coalesce(a.gorjeta, 0)
  from public.appointments a
  join public.configuracoes_comissao cfg on cfg.estabelecimento_id = a.estabelecimento_id
  left join public.clients c on c.id = a.client_id
  left join public.servicos sv on sv.id = a.servico_id
  left join public.services ls on ls.id = a.service_id
  left join public.taxas_pagamento tp on tp.forma = a.payment_method and tp.estabelecimento_id = a.estabelecimento_id
  where public.usuario_admin()
    and a.estabelecimento_id = public.estabelecimento_atual()
    and a.professional_id = p_profissional
    and a.status = 'completed'
    and coalesce(a.is_block, false) = false
    and coalesce(a.is_manual_reminder, false) = false
    and (a.start_time at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    and not exists (
      select 1 from public.fechamento_itens i join public.fechamentos f on f.id = i.fechamento_id
       where i.agendamento_id = a.id and f.status <> 'cancelado');
$function$;

CREATE OR REPLACE FUNCTION public.gerar_fechamento(p_profissional uuid, p_inicio date, p_fim date, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if not exists (select 1 from public.users where id = p_profissional and estabelecimento_id = public.estabelecimento_atual()) then
    raise exception 'Profissional não encontrado.';
  end if;
  if p_observacao is not null and char_length(p_observacao) > 1000 then
    raise exception 'Observação muito longa.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fechamento:' || p_profissional::text, 0));
  select * into v_cfg from public.configuracoes_comissao where id and estabelecimento_id = public.estabelecimento_atual();
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
$function$;

CREATE OR REPLACE FUNCTION public.vender_pacote(p_cliente uuid, p_nome text, p_validade date, p_valor_total numeric, p_itens jsonb, p_pagamentos jsonb, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_total numeric(10,2) := round(coalesce(p_valor_total, -1), 2);
  v_soma_pag numeric := 0;
  v_taxa numeric := 0;
  v_peso_total numeric := 0;
  v_rateado numeric := 0;
  v_n integer;
  v_i integer := 0;
  v_item record;
  v_valor_item numeric(10,2);
  v_pag record;
  v_por_sessoes boolean;
begin
  if not public.usuario_admin() then
    raise exception 'Somente a administradora vende pacotes.';
  end if;
  if p_cliente is null or not exists (select 1 from public.clients where id = p_cliente and estabelecimento_id = public.estabelecimento_atual()) then
    raise exception 'Selecione a cliente.';
  end if;
  if char_length(btrim(coalesce(p_nome, ''))) not between 1 and 120 then
    raise exception 'Informe o nome do pacote.';
  end if;
  if p_validade is null or p_validade <= public.hoje_local() or p_validade > public.hoje_local() + interval '36 months' then
    raise exception 'Validade inválida (de amanhã até 36 meses).';
  end if;
  if v_total < 0 or v_total > 1000000 then
    raise exception 'Valor total inválido.';
  end if;
  if p_observacao is not null and char_length(p_observacao) > 1000 then
    raise exception 'Observação muito longa.';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) not between 1 and 20 then
    raise exception 'Inclua de 1 a 20 serviços no pacote.';
  end if;
  if jsonb_typeof(coalesce(p_pagamentos, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_pagamentos, '[]'::jsonb)) > 10 then
    raise exception 'Formas de pagamento inválidas.';
  end if;

  -- Itens lidos direto do JSON (sem tabela temporária).
  if exists (select 1 from jsonb_array_elements(p_itens) e
              where (e ->> 'servico_id') is null or (e ->> 'sessoes') is null or (e ->> 'comissao_percentual') is null
                 or (e ->> 'sessoes')::integer not between 1 and 100
                 or (e ->> 'comissao_percentual')::numeric not between 0 and 100) then
    raise exception 'Cada serviço precisa de 1 a 100 sessões e comissão entre 0 e 100%%.';
  end if;
  if (select count(*) <> count(distinct e ->> 'servico_id') from jsonb_array_elements(p_itens) e) then
    raise exception 'O mesmo serviço aparece duas vezes no pacote.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) e
              where not exists (select 1 from public.servicos s where s.id = (e ->> 'servico_id')::uuid and s.ativo)) then
    raise exception 'Serviço inexistente ou inativo no pacote.';
  end if;
  select coalesce(sum(s.preco_base * (e ->> 'sessoes')::integer), 0), count(*) into v_peso_total, v_n
    from jsonb_array_elements(p_itens) e join public.servicos s on s.id = (e ->> 'servico_id')::uuid;
  v_por_sessoes := v_peso_total = 0;
  if v_por_sessoes then
    select sum((e ->> 'sessoes')::integer) into v_peso_total from jsonb_array_elements(p_itens) e;
  end if;

  -- Pagamentos: soma igual ao total; taxa de cada forma congelada.
  for v_pag in
    select x.e ->> 'forma' as forma,
           coalesce((x.e ->> 'parcelas')::integer, 1) as parcelas,
           round((x.e ->> 'valor')::numeric, 2) as valor
      from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) as x(e)
  loop
    if v_pag.forma not in ('pix', 'dinheiro', 'debito', 'credito', 'outro') or v_pag.valor is null or v_pag.valor <= 0
       or v_pag.parcelas not between 1 and 24 or (v_pag.forma <> 'credito' and v_pag.parcelas <> 1) then
      raise exception 'Forma de pagamento inválida.';
    end if;
    v_soma_pag := v_soma_pag + v_pag.valor;
    v_taxa := v_taxa + v_pag.valor * coalesce((select percentual from public.taxas_pagamento
      where forma = v_pag.forma and estabelecimento_id = public.estabelecimento_atual()), 0);
  end loop;
  if v_soma_pag <> v_total then
    raise exception 'A soma dos pagamentos (%) precisa ser igual ao valor do pacote (%).',
      to_char(v_soma_pag, 'FM9999990.00'), to_char(v_total, 'FM9999990.00');
  end if;

  insert into public.pacotes (cliente_id, nome, valor_total, taxa_percentual, validade, vendido_por, observacao)
  values (p_cliente, btrim(p_nome), v_total, case when v_total > 0 then round(v_taxa / v_total, 2) else 0 end,
          p_validade, public.usuario_atual_id(), nullif(btrim(coalesce(p_observacao, '')), ''))
  returning id into v_id;

  for v_item in
    select x.ordem, (x.e ->> 'servico_id')::uuid as servico_id, (x.e ->> 'sessoes')::integer as sessoes,
           round((x.e ->> 'comissao_percentual')::numeric, 2) as comissao,
           case when v_por_sessoes then (x.e ->> 'sessoes')::numeric else s.preco_base * (x.e ->> 'sessoes')::integer end as peso
      from jsonb_array_elements(p_itens) with ordinality as x(e, ordem)
      join public.servicos s on s.id = (x.e ->> 'servico_id')::uuid
     order by x.ordem
  loop
    v_i := v_i + 1;
    v_valor_item := case when v_i = v_n then v_total - v_rateado
                         else round(v_total * v_item.peso / v_peso_total, 2) end;
    v_rateado := v_rateado + v_valor_item;
    insert into public.pacote_itens (pacote_id, servico_id, sessoes, valor_item, valor_sessao, comissao_percentual)
    values (v_id, v_item.servico_id, v_item.sessoes, v_valor_item, trunc(v_valor_item / v_item.sessoes, 2), v_item.comissao);
  end loop;

  insert into public.pacote_pagamentos (pacote_id, forma, parcelas, valor, taxa_percentual)
  select v_id, x.e ->> 'forma', coalesce((x.e ->> 'parcelas')::integer, 1), round((x.e ->> 'valor')::numeric, 2),
         coalesce((select percentual from public.taxas_pagamento
          where forma = x.e ->> 'forma' and estabelecimento_id = public.estabelecimento_atual()), 0)
    from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) as x(e);

  perform public.auditoria_gravar('pacote_vendido', 'pacotes', v_id::text,
    jsonb_build_object('cliente', p_cliente, 'valor', v_total, 'validade', p_validade, 'itens', v_n));
  return v_id;
end;
$function$;

-- Clientes visíveis: só do estabelecimento da sessão (a view roda como dona e ignora o RLS).
create or replace view public.clientes_visiveis with (security_barrier = true) as
SELECT id,
    name,
        CASE
            WHEN usuario_admin() THEN phone::text
            ELSE mascarar_telefone(phone::text)
        END AS phone,
        CASE
            WHEN usuario_admin() THEN email
            ELSE mascarar_email(email)
        END AS email,
        CASE
            WHEN usuario_admin() THEN notes
            ELSE NULL::text
        END AS notes,
        CASE
            WHEN usuario_admin() THEN birth_date
            ELSE NULL::date
        END AS birth_date,
        CASE
            WHEN usuario_admin() THEN lgpd_consent
            ELSE NULL::boolean
        END AS lgpd_consent,
    usuario_admin() AS contato_visivel,
    created_at
   FROM clients c
  WHERE usuario_ativo() AND c.estabelecimento_id = (SELECT estabelecimento_atual() AS estabelecimento_atual);


-- -----------------------------------------------------------------------------
-- 5. Limites do plano, por gatilho (valem até para a service role)
-- -----------------------------------------------------------------------------
-- null = ilimitado; premium não tem limite.
create or replace function public.limite_do_estabelecimento(p_estabelecimento uuid, p_recurso text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when e.plano = 'premium' then null
           when p_recurso = 'profissional' then e.max_profissionais
           when p_recurso = 'cliente' then e.max_clientes
         end
    from public.estabelecimentos e where e.id = p_estabelecimento;
$$;

create or replace function public.plano_do_estabelecimento(p_estabelecimento uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select plano from public.estabelecimentos where id = p_estabelecimento;
$$;

-- Profissionais ativos (a administradora não conta).
create or replace function public.users_limite_plano()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limite integer;
  v_qtd integer;
begin
  if new.active is not true or new.role <> 'professional' then
    return new;
  end if;
  -- Quem já contava não é barrado ao editar outros campos.
  if tg_op = 'UPDATE' and old.active is true and old.role = new.role then
    return new;
  end if;
  v_limite := public.limite_do_estabelecimento(new.estabelecimento_id, 'profissional');
  if v_limite is null then
    return new;
  end if;
  select count(*) into v_qtd from public.users
   where estabelecimento_id = new.estabelecimento_id and role = 'professional' and active is true and id <> new.id;
  if v_qtd >= v_limite then
    raise exception 'limite_plano_profissional' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger a2_limite_plano
  before insert or update of role, active on public.users
  for each row execute function public.users_limite_plano();

create or replace function public.clients_limite_plano()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limite integer;
  v_qtd integer;
begin
  v_limite := public.limite_do_estabelecimento(new.estabelecimento_id, 'cliente');
  if v_limite is null then
    return new;
  end if;
  select count(*) into v_qtd from public.clients where estabelecimento_id = new.estabelecimento_id;
  if v_qtd >= v_limite then
    raise exception 'limite_plano_cliente' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger a2_limite_plano
  before insert on public.clients
  for each row execute function public.clients_limite_plano();

-- Plano Básico: Kanban sem compartilhar quadro (o equivalente a "sem delegar").
-- Rotinas do servidor (sem sessão) passam.
create or replace function public.kanban_compartilhamentos_plano()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and public.plano_do_estabelecimento(new.estabelecimento_id) = 'basico' then
    raise exception 'plano_sem_compartilhamento' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger a2_plano_basico
  before insert on public.kanban_compartilhamentos
  for each row execute function public.kanban_compartilhamentos_plano();

revoke execute on function
  public.limite_do_estabelecimento(uuid, text),
  public.plano_do_estabelecimento(uuid),
  public.users_limite_plano(),
  public.clients_limite_plano(),
  public.kanban_compartilhamentos_plano()
from public, anon, authenticated;

-- Plano, prazo e uso x limite do próprio estabelecimento (página "Plano").
create or replace function public.meu_plano()
returns table (
  nome text, plano text, status text, demo_expira_em timestamptz,
  max_profissionais integer, max_clientes integer,
  profissionais bigint, administradoras bigint, clientes bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.nome, e.plano, e.status, e.demo_expira_em,
         case when e.plano = 'premium' then null else e.max_profissionais end,
         case when e.plano = 'premium' then null else e.max_clientes end,
         (select count(*) from public.users u where u.estabelecimento_id = e.id and u.active and u.role = 'professional'),
         (select count(*) from public.users u where u.estabelecimento_id = e.id and u.active and u.role = 'admin'),
         (select count(*) from public.clients c where c.estabelecimento_id = e.id)
    from public.estabelecimentos e
   where e.id = public.estabelecimento_atual();
$$;
revoke all on function public.meu_plano() from public, anon;
grant execute on function public.meu_plano() to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Administração global
-- -----------------------------------------------------------------------------
-- Quem é administrador global: tabela SEM nenhuma política (ninguém lê nem grava
-- pela API); só as funções abaixo e a service role. O cadastro é feito por SQL,
-- por quem tem acesso ao banco (fora do repositório: é dado pessoal).
create table public.administradores_globais (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.administradores_globais enable row level security;
revoke all on public.administradores_globais from anon, authenticated;

-- Só "está na lista": decide entre mostrar o menu e pedir o MFA. Nunca usar para dados.
create or replace function public.eh_admin_global_cadastrado()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.administradores_globais where user_id = auth.uid());
$$;

-- Na lista E a sessão concluiu o segundo fator (claim "aal" do token). É esta que
-- toda função do painel confere, então a API REST não serve de atalho sem MFA.
create or replace function public.eh_admin_global()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.administradores_globais where user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

revoke all on function public.eh_admin_global_cadastrado() from public, anon;
grant execute on function public.eh_admin_global_cadastrado() to authenticated;
revoke all on function public.eh_admin_global() from public, anon;
grant execute on function public.eh_admin_global() to authenticated;

-- Painel: só cadastro e contagens (nenhum dado de negócio).
create or replace function public.admin_global_estabelecimentos()
returns table (
  id uuid, nome text, plano text, status text, demo_expira_em timestamptz, created_at timestamptz,
  desativado_em timestamptz, excluido_em timestamptz,
  max_profissionais integer, max_clientes integer,
  profissionais bigint, administradoras bigint, clientes bigint, proprio boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.eh_admin_global() then
    raise exception 'so_admin_global' using errcode = '42501';
  end if;
  return query
  select e.id, e.nome, e.plano, e.status, e.demo_expira_em, e.created_at, e.desativado_em, e.excluido_em,
         e.max_profissionais, e.max_clientes,
         (select count(*) from public.users u where u.estabelecimento_id = e.id and u.active and u.role = 'professional'),
         (select count(*) from public.users u where u.estabelecimento_id = e.id and u.active and u.role = 'admin'),
         (select count(*) from public.clients c where c.estabelecimento_id = e.id),
         exists (select 1 from public.users u where u.estabelecimento_id = e.id and u.auth_id = auth.uid())
    from public.estabelecimentos e
   order by e.created_at;
end;
$$;

-- Edição: nome, plano, situação, fim da demonstração e limites. Nunca dado de negócio.
-- O administrador global não desativa nem exclui o próprio estabelecimento.
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

revoke all on function public.admin_global_estabelecimentos() from public, anon;
grant execute on function public.admin_global_estabelecimentos() to authenticated;
revoke all on function public.admin_global_atualizar_estabelecimento(uuid, text, text, text, timestamptz, integer, integer) from public, anon;
grant execute on function public.admin_global_atualizar_estabelecimento(uuid, text, text, text, timestamptz, integer, integer) to authenticated;

-- Criação: chamada só pela Edge Function admin-usuarios com a service role, DEPOIS
-- de ela conferir eh_admin_global() com o token de quem pediu e de criar a conta de
-- login do primeiro administrador (convite, sem senha definida pelo painel).
-- Cria o estabelecimento, a configuração padrão e o perfil da administradora.
create or replace function public.estabelecimento_criar(
  p_nome text, p_plano text, p_max_profissionais integer, p_max_clientes integer,
  p_admin_nome text, p_admin_auth uuid, p_criado_por uuid
) returns table (estabelecimento_id uuid, administradora_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_est uuid;
  v_adm uuid;
begin
  if auth.uid() is not null then
    raise exception 'so_servidor' using errcode = '42501';
  end if;
  if p_criado_por is null or not exists (select 1 from public.administradores_globais where user_id = p_criado_por) then
    raise exception 'so_admin_global' using errcode = '42501';
  end if;
  if p_admin_auth is null or exists (select 1 from public.users where auth_id = p_admin_auth) then
    raise exception 'conta_ja_vinculada' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_admin_nome, ''))) not between 2 and 200 then
    raise exception 'nome_administradora_invalido' using errcode = 'P0001';
  end if;

  insert into public.estabelecimentos (nome, plano, demo_expira_em, max_profissionais, max_clientes, criado_por)
  values (btrim(p_nome), p_plano, case when p_plano = 'demonstracao' then now() + interval '30 days' end,
          p_max_profissionais, p_max_clientes, p_criado_por)
  returning id into v_est;

  insert into public.taxas_pagamento (estabelecimento_id, forma, percentual) values
    (v_est, 'pix', 0), (v_est, 'dinheiro', 0), (v_est, 'debito', 1.99),
    (v_est, 'credito', 3.49), (v_est, 'cartao', 3.49), (v_est, 'outro', 0);
  insert into public.configuracoes_comissao (estabelecimento_id) values (v_est);
  insert into public.categorias_servico (estabelecimento_id, nome, cor, ordem) values
    (v_est, 'Cabelo', '#e11d48', 1),
    (v_est, 'Manicure e Pedicure', '#db2777', 2),
    (v_est, 'Sobrancelhas e Cílios', '#9333ea', 3),
    (v_est, 'Estética Facial', '#0d9488', 4),
    (v_est, 'Estética Corporal', '#0284c7', 5),
    (v_est, 'Depilação', '#ea580c', 6),
    (v_est, 'Maquiagem', '#ca8a04', 7);
  insert into public.users (estabelecimento_id, auth_id, name, role, active)
  values (v_est, p_admin_auth, btrim(p_admin_nome), 'admin', true)
  returning id into v_adm;

  return query select v_est, v_adm;
end;
$$;
revoke all on function public.estabelecimento_criar(text, text, integer, integer, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.estabelecimento_criar(text, text, integer, integer, text, uuid, uuid) to service_role;

-- Trilha: toda inclusão e alteração de estabelecimento, com quem fez e os campos mudados.
create or replace function public.auditar_estabelecimento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campos jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.auditoria_gravar('estabelecimento_criado', 'estabelecimentos', new.id::text,
      jsonb_build_object('plano', new.plano, 'status', new.status));
    return null;
  end if;
  select coalesce(jsonb_agg(n.key order by n.key), '[]'::jsonb) into v_campos
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
   where n.value is distinct from o.value and n.key <> 'updated_at';
  perform public.auditoria_gravar(
    case when new.status = 'excluido' and old.status <> 'excluido' then 'excluiu' else 'alterou' end,
    'estabelecimentos', new.id::text,
    jsonb_build_object('campos', v_campos, 'plano', new.plano, 'status', new.status));
  return null;
end;
$$;
create trigger estabelecimentos_auditoria
  after insert or update on public.estabelecimentos
  for each row execute function public.auditar_estabelecimento();
revoke execute on function public.auditar_estabelecimento() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Demonstração vencida: módulos pagos só leem (trava de gravação no banco)
-- -----------------------------------------------------------------------------
-- Gatilho (não política) para pegar também as funções security definer. Bloqueia
-- gravação, não leitura (o dado continua do estabelecimento). Sem sessão passa.
-- Ficam de fora as tabelas que as telas liberadas gravam: agenda (appointments,
-- e por gatilho commissions/transactions/pacote_movimentos), clientes e histórico,
-- equipe, catálogo e configurações (comissão e taxas).
create or replace function public.plano_liberado()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select not (e.plano = 'demonstracao' and e.demo_expira_em is not null and e.demo_expira_em <= now())
      from public.users u join public.estabelecimentos e on e.id = u.estabelecimento_id
     where u.auth_id = auth.uid() and u.active is true
     limit 1), true);
$$;

create or replace function public.plano_trava_demonstracao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.plano_liberado() then
    raise exception 'plano_demonstracao_encerrada' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.plano_liberado() from public, anon, authenticated;
revoke execute on function public.plano_trava_demonstracao() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'kanban_quadros', 'kanban_colunas', 'kanban_compartilhamentos', 'kanban_grupos', 'kanban_quadro_grupo',
    'internal_tasks', 'tarefa_itens', 'tarefa_comentarios',                              -- tarefas
    'expenses', 'manual_incomes', 'personal_finances',                                   -- finanças
    'fechamentos', 'fechamento_itens',                                                   -- pagamento de profissionais
    'pacotes', 'pacote_itens', 'pacote_pagamentos',                                      -- pacotes
    'products', 'service_products'                                                       -- estoque
  ] loop
    execute format(
      'create trigger a1_plano_trava_demonstracao before insert or update or delete on public.%I '
      'for each row execute function public.plano_trava_demonstracao()', t);
  end loop;
end;
$$;

commit;
