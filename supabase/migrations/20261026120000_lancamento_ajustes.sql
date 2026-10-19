-- =============================================================================
-- Ajustes de lançamento com justificativa (Relatório de comissões).
--
-- A administradora edita ou exclui um lançamento em aberto só pelas funções abaixo,
-- que exigem justificativa e gravam, na mesma transação, o registro do ajuste com os
-- dados de antes (e os de depois, na edição). O lançamento excluído continua aparecendo
-- no relatório com valor zerado, os dados apagados e a justificativa.
--  - Sem segundo fator (pedido da usuária): basta ser administradora ativa.
--  - Lançamento em fechamento ativo continua travado (appointments_protecao).
--  - Profissional vê os ajustes dos próprios atendimentos; só funções do banco escrevem.
--  - Vários estabelecimentos: coluna, política restritiva e gatilho de guarda.
--  - Sem DROP, DELETE ou UPDATE de dados existentes: só cria.
-- =============================================================================

begin;

create table public.lancamento_ajustes (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  -- Sem FK: o registro sobrevive à exclusão do atendimento.
  agendamento_id uuid not null,
  tipo text not null check (tipo in ('edicao', 'exclusao')),
  justificativa text not null check (char_length(btrim(justificativa)) between 5 and 500),
  data_atendimento timestamptz not null,
  profissional_id uuid references public.users(id) on delete set null,
  profissional_nome text not null check (char_length(profissional_nome) <= 200),
  cliente_nome text not null check (char_length(cliente_nome) <= 200),
  servico_nome text not null check (char_length(servico_nome) <= 200),
  valor_antes numeric(10,2),
  comissao_antes numeric(5,2),
  forma_antes text check (char_length(forma_antes) <= 20),
  gorjeta_antes numeric(10,2),
  valor_depois numeric(10,2),
  comissao_depois numeric(5,2),
  forma_depois text check (char_length(forma_depois) <= 20),
  gorjeta_depois numeric(10,2),
  autor_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index lancamento_ajustes_data_idx on public.lancamento_ajustes (estabelecimento_id, data_atendimento);
create index lancamento_ajustes_agendamento_idx on public.lancamento_ajustes (agendamento_id);

alter table public.lancamento_ajustes enable row level security;
revoke all on public.lancamento_ajustes from anon;
revoke insert, update, delete, truncate on public.lancamento_ajustes from authenticated;

-- Leitura (AUZ-04): administradora vê todos; profissional, os dos próprios atendimentos.
-- Escrita só pelas funções editar_lancamento/excluir_lancamento (sem grant de escrita).
create policy "lancamento_ajustes: select" on public.lancamento_ajustes
  for select to authenticated
  using (public.usuario_admin() or (public.usuario_ativo() and profissional_id = public.usuario_atual_id()));
create policy "lancamento_ajustes: mesmo estabelecimento" on public.lancamento_ajustes as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));

create trigger a0_estabelecimento_guarda before insert or update or delete on public.lancamento_ajustes
  for each row execute function public.estabelecimento_guarda();

-- Grava o ajuste com a foto do lançamento (nomes resolvidos no banco).
create or replace function public.registrar_ajuste_lancamento(
  p_a public.appointments, p_tipo text, p_justificativa text,
  p_valor numeric, p_comissao numeric, p_forma text, p_gorjeta numeric
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.lancamento_ajustes (
    estabelecimento_id, agendamento_id, tipo, justificativa, data_atendimento, profissional_id, profissional_nome,
    cliente_nome, servico_nome, valor_antes, comissao_antes, forma_antes, gorjeta_antes,
    valor_depois, comissao_depois, forma_depois, gorjeta_depois, autor_id
  ) values (
    p_a.estabelecimento_id, p_a.id, p_tipo, btrim(p_justificativa), p_a.start_time, p_a.professional_id,
    left(coalesce((select u.name from public.users u where u.id = p_a.professional_id), 'Sem profissional'), 200),
    left(coalesce((select c.name from public.clients c where c.id = p_a.client_id), 'Cliente'), 200),
    left(coalesce((select s.nome from public.servicos s where s.id = p_a.servico_id),
                  (select s.name from public.services s where s.id = p_a.service_id), 'Atendimento'), 200),
    p_a.valor_cobrado, p_a.comissao_percentual, p_a.payment_method, p_a.gorjeta,
    p_valor, p_comissao, p_forma, p_gorjeta, public.usuario_atual_id()
  );
end;
$$;
revoke execute on function public.registrar_ajuste_lancamento(public.appointments, text, text, numeric, numeric, text, numeric) from public, anon, authenticated;

create or replace function public.lancamento_para_ajuste(p_id uuid, p_justificativa text)
returns public.appointments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_a public.appointments%rowtype;
begin
  if not public.usuario_admin() then
    raise exception 'Somente a administradora ajusta lançamentos.';
  end if;
  if char_length(btrim(coalesce(p_justificativa, ''))) not between 5 and 500 then
    raise exception 'Informe a justificativa (de 5 a 500 caracteres).';
  end if;
  select * into v_a from public.appointments
   where id = p_id and estabelecimento_id = public.estabelecimento_atual()
     and coalesce(is_block, false) = false and coalesce(is_manual_reminder, false) = false
   for update;
  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;
  return v_a;
end;
$$;
revoke execute on function public.lancamento_para_ajuste(uuid, text) from public, anon, authenticated;

-- Edição com justificativa. Sessão de pacote: só a gorjeta muda (valor, comissão e forma vêm do pacote).
create or replace function public.editar_lancamento(
  p_id uuid, p_valor numeric, p_comissao numeric, p_forma text, p_gorjeta numeric, p_justificativa text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_a public.appointments%rowtype;
begin
  v_a := public.lancamento_para_ajuste(p_id, p_justificativa);
  if v_a.pacote_item_id is not null then
    p_valor := v_a.valor_cobrado;
    p_comissao := v_a.comissao_percentual;
    p_forma := v_a.payment_method;
  end if;
  if p_valor is null or p_valor < 0 or p_valor > 100000 then
    raise exception 'Valor inválido.';
  end if;
  if p_comissao is null or p_comissao < 0 or p_comissao > 100 then
    raise exception 'Comissão entre 0 e 100%%.';
  end if;
  if p_gorjeta is null or p_gorjeta < 0 or p_gorjeta > 100000 then
    raise exception 'Gorjeta inválida.';
  end if;
  update public.appointments
     set valor_cobrado = p_valor, comissao_percentual = p_comissao, payment_method = p_forma, gorjeta = p_gorjeta
   where id = v_a.id;
  perform public.registrar_ajuste_lancamento(v_a, 'edicao', p_justificativa, p_valor, p_comissao, p_forma, p_gorjeta);
end;
$$;
revoke execute on function public.editar_lancamento(uuid, numeric, numeric, text, numeric, text) from public, anon;
grant execute on function public.editar_lancamento(uuid, numeric, numeric, text, numeric, text) to authenticated;

-- Exclusão com justificativa: o atendimento sai; o ajuste guarda os dados apagados.
create or replace function public.excluir_lancamento(p_id uuid, p_justificativa text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_a public.appointments%rowtype;
begin
  v_a := public.lancamento_para_ajuste(p_id, p_justificativa);
  perform public.registrar_ajuste_lancamento(v_a, 'exclusao', p_justificativa, null, null, null, null);
  delete from public.appointments where id = v_a.id;
end;
$$;
revoke execute on function public.excluir_lancamento(uuid, text) from public, anon;
grant execute on function public.excluir_lancamento(uuid, text) to authenticated;

commit;
