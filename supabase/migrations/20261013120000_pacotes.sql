-- =============================================================================
-- Pacotes de sessões (fase 1). Especificação: docs/especificacoes/pacotes-de-sessoes.md
--
-- APLICADA em produção em 2026-10-08 com aprovação explícita do usuário (DEV-02), em 7 partes
-- (pacotes_1_tabelas, 2a_saldos, 2b_venda, 2c_renovar_anular, 3a_gatilhos, 3b_agendar,
-- 3c_fechamento_protecao), porque o conector do Supabase não concluía a chamada única.
-- Dois ajustes equivalentes feitos na aplicação e refletidos aqui: vender_pacote lê os itens
-- direto do JSON (sem tabela temporária) e a versão anterior de agendar_atendimento é
-- renomeada para agendar_atendimento_v1, sem execução, em vez de removida.
--
-- Decisões da administradora (2026-10-08):
--  - validade padrão de 12 meses, renovável no sistema;
--  - sem regra de antecedência e sem taxa ao profissional na falta;
--  - comissão: percentual definido na venda e pago a quem executa, sessão a sessão;
--  - sem reembolso (a "anulação" só corrige venda lançada por engano, sem uso);
--  - nota fiscal na venda (o faturamento do pacote entra na data da venda).
--
-- Regras centrais (no banco, a tela só chama):
--  - venda: valor total rateado entre os serviços pelo preço de tabela e congelado
--    por sessão; taxa da maquininha média das formas de pagamento, rateada;
--  - agendar com pacote reserva uma sessão; concluir abate (movimento "uso") e
--    grava valor da sessão, comissão da venda e taxa do pacote no atendimento, que
--    entra no fechamento de quem executou; falta (no_show) consome a sessão sem
--    comissão; voltar o status desfaz o movimento;
--  - pacote vencido não agenda nem abate; saldo e vencimento são calculados na
--    leitura (sem rotina agendada).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tabelas
-- -----------------------------------------------------------------------------

create table public.pacotes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clients(id) on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  valor_total numeric(10,2) not null check (valor_total between 0 and 1000000),
  -- Média das taxas das formas de pagamento da venda, ponderada pelo valor.
  taxa_percentual numeric(5,2) not null default 0 check (taxa_percentual between 0 and 30),
  validade date not null,
  status text not null default 'ativo' check (status in ('ativo', 'anulado')),
  vendido_em timestamptz not null default now(),
  vendido_por uuid references public.users(id) on delete set null,
  observacao text check (observacao is null or char_length(observacao) <= 1000),
  anulado_em timestamptz,
  anulacao_motivo text check (anulacao_motivo is null or char_length(anulacao_motivo) <= 1000)
);
create index pacotes_cliente_idx on public.pacotes (cliente_id, validade);
create index pacotes_vendido_em_idx on public.pacotes (vendido_em);

create table public.pacote_itens (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid not null references public.pacotes(id) on delete restrict,
  servico_id uuid not null references public.servicos(id) on delete restrict,
  sessoes integer not null check (sessoes between 1 and 100),
  valor_item numeric(10,2) not null check (valor_item >= 0),
  -- Valor de cada sessão (truncado); a última recebe o resíduo para fechar o centavo.
  valor_sessao numeric(10,2) not null check (valor_sessao >= 0),
  comissao_percentual numeric(5,2) not null check (comissao_percentual between 0 and 100),
  unique (pacote_id, servico_id)
);

create table public.pacote_pagamentos (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid not null references public.pacotes(id) on delete restrict,
  forma text not null check (forma in ('pix', 'dinheiro', 'debito', 'credito', 'outro')),
  parcelas integer not null default 1 check (parcelas between 1 and 24),
  valor numeric(10,2) not null check (valor > 0),
  taxa_percentual numeric(5,2) not null check (taxa_percentual between 0 and 30),
  created_at timestamptz not null default now()
);
create index pacote_pagamentos_pacote_idx on public.pacote_pagamentos (pacote_id);

alter table public.appointments
  add column if not exists pacote_item_id uuid references public.pacote_itens(id) on delete restrict,
  -- Taxa congelada do pacote; só é preenchida em sessão de pacote concluída.
  add column if not exists taxa_percentual numeric(5,2) check (taxa_percentual is null or taxa_percentual between 0 and 30);
create index if not exists appointments_pacote_item_idx on public.appointments (pacote_item_id) where pacote_item_id is not null;

alter table public.appointments drop constraint if exists appointments_payment_method_check;
alter table public.appointments
  add constraint appointments_payment_method_check
  check (payment_method is null or payment_method in ('pix', 'dinheiro', 'debito', 'credito', 'cartao', 'outro', 'pacote'));

-- Extrato do pacote. Só funções do banco escrevem.
create table public.pacote_movimentos (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid not null references public.pacotes(id) on delete restrict,
  item_id uuid references public.pacote_itens(id) on delete restrict,
  agendamento_id uuid references public.appointments(id) on delete restrict,
  tipo text not null check (tipo in ('uso', 'falta', 'renovacao')),
  quantidade integer not null check (quantidade in (0, 1)),
  valor numeric(10,2) not null default 0 check (valor >= 0),
  detalhe text check (detalhe is null or char_length(detalhe) <= 500),
  autor_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (tipo in ('uso', 'falta') and item_id is not null and agendamento_id is not null and quantidade = 1)
    or (tipo = 'renovacao' and agendamento_id is null and quantidade = 0)
  )
);
-- Idempotência: um atendimento abate no máximo uma sessão.
create unique index pacote_movimentos_agendamento_uk on public.pacote_movimentos (agendamento_id) where agendamento_id is not null;
create index pacote_movimentos_item_idx on public.pacote_movimentos (item_id);
create index pacote_movimentos_pacote_idx on public.pacote_movimentos (pacote_id, created_at);

-- -----------------------------------------------------------------------------
-- 2. RLS: só a administradora lê as tabelas; escrita só pelas funções
-- -----------------------------------------------------------------------------

alter table public.pacotes enable row level security;
alter table public.pacote_itens enable row level security;
alter table public.pacote_pagamentos enable row level security;
alter table public.pacote_movimentos enable row level security;
revoke all on public.pacotes, public.pacote_itens, public.pacote_pagamentos, public.pacote_movimentos from anon;
revoke insert, update, delete, truncate on public.pacotes, public.pacote_itens, public.pacote_pagamentos, public.pacote_movimentos from authenticated;

create policy "pacotes: select" on public.pacotes
  for select to authenticated using (public.usuario_admin());
create policy "pacote_itens: select" on public.pacote_itens
  for select to authenticated using (public.usuario_admin());
create policy "pacote_pagamentos: select" on public.pacote_pagamentos
  for select to authenticated using (public.usuario_admin());
create policy "pacote_movimentos: select" on public.pacote_movimentos
  for select to authenticated using (public.usuario_admin());

-- -----------------------------------------------------------------------------
-- 3. Saldo (calculado do extrato e das reservas, nunca editável)
-- -----------------------------------------------------------------------------

create or replace function public.hoje_local()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Valor da sessão consumida, dado quantas já foram consumidas antes dela
-- (a última leva o resíduo do rateio para fechar o centavo).
create or replace function public.pacote_valor_sessao(p_item uuid, p_consumidas_antes integer)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when p_consumidas_antes + 1 >= i.sessoes then i.valor_item - i.valor_sessao * (i.sessoes - 1)
              else i.valor_sessao end
    from public.pacote_itens i where i.id = p_item;
$$;

-- Saldo por item. Profissional consulta por cliente, sem valores; administradora vê tudo.
create or replace function public.pacote_saldos(p_cliente uuid default null, p_incluir_encerrados boolean default false)
returns table (
  pacote_id uuid, cliente_id uuid, pacote_nome text, status text, validade date, vencido boolean, vendido_em timestamptz,
  item_id uuid, servico_id uuid, servico_nome text, sessoes integer, usadas integer, faltas integer, reservadas integer,
  disponiveis integer, valor_sessao numeric, valor_restante numeric, comissao_percentual numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- -----------------------------------------------------------------------------
-- 4. Venda, renovação e anulação
-- -----------------------------------------------------------------------------

create or replace function public.vender_pacote(
  p_cliente uuid,
  p_nome text,
  p_validade date,
  p_valor_total numeric,
  p_itens jsonb,
  p_pagamentos jsonb,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  if p_cliente is null or not exists (select 1 from public.clients where id = p_cliente) then
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
    v_taxa := v_taxa + v_pag.valor * coalesce((select percentual from public.taxas_pagamento where forma = v_pag.forma), 0);
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
         coalesce((select percentual from public.taxas_pagamento where forma = x.e ->> 'forma'), 0)
    from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) as x(e);

  perform public.auditoria_gravar('pacote_vendido', 'pacotes', v_id::text,
    jsonb_build_object('cliente', p_cliente, 'valor', v_total, 'validade', p_validade, 'itens', v_n));
  return v_id;
end;
$$;

create or replace function public.renovar_pacote(p_id uuid, p_validade date, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pac public.pacotes%rowtype;
begin
  if not public.usuario_admin() then
    raise exception 'Somente a administradora renova pacotes.';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 500 then
    raise exception 'Informe o motivo da renovação.';
  end if;
  select * into v_pac from public.pacotes where id = p_id for update;
  if not found or v_pac.status <> 'ativo' then
    raise exception 'Pacote não encontrado ou anulado.';
  end if;
  if p_validade is null or p_validade <= greatest(v_pac.validade, public.hoje_local())
     or p_validade > public.hoje_local() + interval '36 months' then
    raise exception 'A nova validade precisa ser posterior à atual e a hoje (até 36 meses).';
  end if;
  update public.pacotes set validade = p_validade where id = p_id;
  insert into public.pacote_movimentos (pacote_id, tipo, quantidade, detalhe, autor_id)
  values (p_id, 'renovacao', 0,
          format('Validade %s para %s: %s', to_char(v_pac.validade, 'DD/MM/YYYY'), to_char(p_validade, 'DD/MM/YYYY'), btrim(p_motivo)),
          public.usuario_atual_id());
  perform public.auditoria_gravar('pacote_renovado', 'pacotes', p_id::text,
    jsonb_build_object('de', v_pac.validade, 'para', p_validade));
end;
$$;

-- Corrige venda lançada por engano. Não é reembolso: só sem sessão usada nem agendada.
create or replace function public.anular_pacote(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.usuario_admin() then
    raise exception 'Somente a administradora anula pacotes.';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 5 and 1000 then
    raise exception 'Informe o motivo da anulação (5 a 1000 caracteres).';
  end if;
  perform 1 from public.pacotes where id = p_id and status = 'ativo' for update;
  if not found then
    raise exception 'Pacote não encontrado ou já anulado.';
  end if;
  if exists (select 1 from public.pacote_movimentos where pacote_id = p_id and tipo in ('uso', 'falta')) then
    raise exception 'Pacote com sessão usada não pode ser anulado.';
  end if;
  if exists (select 1 from public.appointments a join public.pacote_itens i on i.id = a.pacote_item_id
              where i.pacote_id = p_id and a.status in ('scheduled', 'confirmed')) then
    raise exception 'Há agendamentos usando este pacote. Cancele-os antes.';
  end if;
  update public.pacotes set status = 'anulado', anulado_em = now(), anulacao_motivo = btrim(p_motivo) where id = p_id;
  perform public.auditoria_gravar('pacote_anulado', 'pacotes', p_id::text, jsonb_build_object('motivo', btrim(p_motivo)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Agenda: reserva, abatimento na conclusão e falta
-- -----------------------------------------------------------------------------

create or replace function public.appointments_pacote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.pacote_itens%rowtype;
  v_pac public.pacotes%rowtype;
  v_outros integer;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.pacote_movimentos where agendamento_id = old.id) then
      raise exception 'Atendimento já abatido do pacote. Volte o status antes de excluir.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.pacote_item_id is not null
     and new.pacote_item_id is distinct from old.pacote_item_id
     and exists (select 1 from public.pacote_movimentos where agendamento_id = old.id) then
    raise exception 'Atendimento já abatido do pacote. Volte o status antes de trocar o pacote.';
  end if;

  if new.pacote_item_id is null then
    if new.payment_method = 'pacote' then
      raise exception 'A forma "pacote" exige um pacote vinculado.';
    end if;
    new.taxa_percentual := null;
    return new;
  end if;

  if coalesce(new.is_block, false) or coalesce(new.is_manual_reminder, false) then
    raise exception 'Pacote só pode ser usado em atendimento.';
  end if;
  select * into v_item from public.pacote_itens where id = new.pacote_item_id;
  if not found then
    raise exception 'Pacote não encontrado.';
  end if;
  -- Trava o pacote: reservas e abatimentos simultâneos ficam em fila.
  select * into v_pac from public.pacotes where id = v_item.pacote_id for update;
  if v_pac.cliente_id is distinct from new.client_id then
    raise exception 'Este pacote pertence a outra cliente.';
  end if;
  if new.servico_id is distinct from v_item.servico_id then
    raise exception 'O serviço do atendimento não é o do pacote.';
  end if;

  if new.status in ('scheduled', 'confirmed', 'completed', 'no_show') then
    if v_pac.status <> 'ativo' then
      raise exception 'Pacote anulado.';
    end if;
    if (new.start_time at time zone 'America/Sao_Paulo')::date > v_pac.validade then
      raise exception 'Pacote vencido em %. Renove a validade antes de usar.', to_char(v_pac.validade, 'DD/MM/YYYY');
    end if;
    -- Conta pelos atendimentos (e não pelo extrato): num UPDATE de várias linhas, o
    -- gatilho BEFORE já enxerga as linhas anteriores do mesmo comando.
    v_outros := (select count(*) from public.appointments a
                  where a.pacote_item_id = v_item.id and a.id <> new.id
                    and a.status in ('scheduled', 'confirmed', 'completed', 'no_show')
                    and coalesce(a.is_manual_reminder, false) = false);
    if v_outros >= v_item.sessoes then
      raise exception 'Pacote sem sessões disponíveis deste serviço.';
    end if;
  end if;

  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' or old.pacote_item_id is distinct from new.pacote_item_id then
      new.valor_cobrado := public.pacote_valor_sessao(v_item.id, (
        select count(*)::integer from public.appointments a
         where a.pacote_item_id = v_item.id and a.id <> new.id and a.status in ('completed', 'no_show')));
      new.comissao_percentual := v_item.comissao_percentual;
    end if;
    new.payment_method := 'pacote';
    new.taxa_percentual := v_pac.taxa_percentual;
  else
    if tg_op = 'INSERT' or old.pacote_item_id is distinct from new.pacote_item_id or old.status = 'completed' then
      new.valor_cobrado := v_item.valor_sessao;
      new.comissao_percentual := v_item.comissao_percentual;
    end if;
    if new.payment_method = 'pacote' then
      new.payment_method := null;
    end if;
    new.taxa_percentual := null;
  end if;
  return new;
end;
$$;

create or replace function public.appointments_pacote_movimento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.pacote_item_id is not null and old.status in ('completed', 'no_show')
     and (new.status is distinct from old.status or new.pacote_item_id is distinct from old.pacote_item_id) then
    delete from public.pacote_movimentos where agendamento_id = old.id;
  end if;
  if new.pacote_item_id is not null and new.status in ('completed', 'no_show')
     and not exists (select 1 from public.pacote_movimentos where agendamento_id = new.id) then
    insert into public.pacote_movimentos (pacote_id, item_id, agendamento_id, tipo, quantidade, valor, autor_id)
    select i.pacote_id, i.id, new.id,
           case when new.status = 'completed' then 'uso' else 'falta' end, 1,
           case when new.status = 'completed' then coalesce(new.valor_cobrado, 0)
                else public.pacote_valor_sessao(i.id, (select count(*)::integer from public.pacote_movimentos m
                                                        where m.item_id = i.id and m.tipo in ('uso', 'falta'))) end,
           public.usuario_atual_id()
      from public.pacote_itens i where i.id = new.pacote_item_id;
  end if;
  return null;
end;
$$;

-- Depois de appointments_a_protecao (ordem alfabética dos gatilhos BEFORE).
create trigger appointments_b_pacote
  before insert or update or delete on public.appointments
  for each row execute function public.appointments_pacote();
create trigger appointments_pacote_movimento
  after insert or update on public.appointments
  for each row execute function public.appointments_pacote_movimento();

-- Agendamento com pacote: mesma função da agenda, com o item do pacote.
-- A versão anterior (sem pacote) é renomeada e fica sem permissão de execução, em vez de
-- removida: o conector do Supabase segura comandos de remoção para confirmação manual.
alter function public.agendar_atendimento(uuid, uuid, uuid, timestamptz, text, numeric, integer, text, text)
  rename to agendar_atendimento_v1;
revoke execute on function public.agendar_atendimento_v1(uuid, uuid, uuid, timestamptz, text, numeric, integer, text, text)
  from anon, authenticated, public;
create or replace function public.agendar_atendimento(
  p_cliente uuid,
  p_profissional uuid,
  p_servico uuid,
  p_inicio timestamptz,
  p_servico_avulso text default null,
  p_valor numeric default null,
  p_duracao_minutos integer default null,
  p_status text default 'scheduled',
  p_observacao text default null,
  p_pacote_item uuid default null
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
      -- Valor e comissão vêm do pacote (o gatilho appointments_pacote confere saldo e validade).
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
$$;

-- -----------------------------------------------------------------------------
-- 6. Fechamento: sessão de pacote usa a taxa congelada do pacote
-- -----------------------------------------------------------------------------

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
    case when cfg.descontar_taxa_pagamento then coalesce(a.taxa_percentual, tp.percentual, 0) else 0 end,
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

-- Profissional não altera vínculo com pacote nem a taxa do atendimento (só funções e administradora).
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
       or new.payment_method is distinct from old.payment_method
       or new.pacote_item_id is distinct from old.pacote_item_id
       or new.taxa_percentual is distinct from old.taxa_percentual then
      raise exception 'Atendimento já incluído em fechamento de comissão. Cancele o fechamento antes de alterar.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if v_restrito and tg_op = 'INSERT'
     and (new.valor_cobrado is not null or new.comissao_percentual is not null
          or coalesce(new.gorjeta, 0) <> 0 or new.payment_method is not null
          or new.pacote_item_id is not null or new.taxa_percentual is not null) then
    raise exception 'Use o agendamento da agenda para criar atendimento com valor.';
  end if;
  if v_restrito and tg_op = 'UPDATE'
     and (new.valor_cobrado is distinct from old.valor_cobrado
          or new.comissao_percentual is distinct from old.comissao_percentual
          or new.professional_id is distinct from old.professional_id
          or new.created_by is distinct from old.created_by
          or new.gorjeta is distinct from old.gorjeta
          or new.payment_method is distinct from old.payment_method
          or new.pacote_item_id is distinct from old.pacote_item_id
          or new.taxa_percentual is distinct from old.taxa_percentual) then
    raise exception 'Somente a administradora altera valor, pagamento, gorjeta, pacote ou profissional do atendimento.';
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

-- -----------------------------------------------------------------------------
-- 7. Auditoria
-- -----------------------------------------------------------------------------

alter table public.access_logs drop constraint if exists access_logs_acao_check;
alter table public.access_logs add constraint access_logs_acao_check check (acao in (
  'login', 'login_negado', 'logout', 'usuario_criado', 'permissao_alterada', 'alterou', 'excluiu',
  'fechamento_gerado', 'fechamento_assinado', 'fechamento_contestado', 'fechamento_cancelado',
  'pacote_vendido', 'pacote_renovado', 'pacote_anulado'
));

-- Movimento desfeito (status do atendimento voltou) fica registrado na trilha.
create trigger pacote_movimentos_auditoria_exclusao
  after delete on public.pacote_movimentos
  for each row execute function public.auditar_alteracao_generica();

-- -----------------------------------------------------------------------------
-- 8. Permissões de execução
-- -----------------------------------------------------------------------------

revoke execute on function
  public.hoje_local(),
  public.pacote_valor_sessao(uuid, integer),
  public.pacote_saldos(uuid, boolean),
  public.vender_pacote(uuid, text, date, numeric, jsonb, jsonb, text),
  public.renovar_pacote(uuid, date, text),
  public.anular_pacote(uuid, text),
  public.appointments_pacote(),
  public.appointments_pacote_movimento(),
  public.agendar_atendimento(uuid, uuid, uuid, timestamptz, text, numeric, integer, text, text, uuid),
  public.fechamento_candidatos(uuid, date, date),
  public.appointments_protecao()
from anon, public;

revoke execute on function
  public.pacote_valor_sessao(uuid, integer),
  public.appointments_pacote(),
  public.appointments_pacote_movimento(),
  public.fechamento_candidatos(uuid, date, date),
  public.appointments_protecao()
from authenticated;

grant execute on function
  public.hoje_local(),
  public.pacote_saldos(uuid, boolean),
  public.vender_pacote(uuid, text, date, numeric, jsonb, jsonb, text),
  public.renovar_pacote(uuid, date, text),
  public.anular_pacote(uuid, text),
  public.agendar_atendimento(uuid, uuid, uuid, timestamptz, text, numeric, integer, text, text, uuid)
to authenticated;

commit;

-- Conferência depois de aplicar:
--   select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename like 'pacote%';
--   select count(*) from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true');  -- 0
--   select count(*) from information_schema.routine_privileges where grantee = 'anon' and routine_schema = 'public';  -- 0
