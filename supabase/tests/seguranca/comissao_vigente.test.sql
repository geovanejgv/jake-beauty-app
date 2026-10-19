-- Comissão vigente: atendimento em aberto segue a configuração atual do profissional;
-- fechado e sessão de pacote não mudam. Rodar com run.sh.
\set ON_ERROR_STOP 1
create or replace function pg_temp.espera_erro(p_sql text, p_trecho text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if position(p_trecho in sqlerrm) = 0 then raise exception 'erro errado para [%]: % (esperado: %)', p_sql, sqlerrm, p_trecho; end if;
    raise notice 'OK erro esperado: %', sqlerrm; return;
  end;
  raise exception 'esperava erro em: %', p_sql;
end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'OK %', msg; end $$;
create or replace function pg_temp.como(p_sub text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_sub, false);
$$;
create or replace function pg_temp.pct(p_inicio text) returns numeric language sql as $$
  select comissao_percentual from public.appointments where start_time = p_inicio::timestamptz;
$$;
select set_config('request.jwt.claims', '{"aal": "aal2"}', false);
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@ex.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p1@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Valentin', 'professional', true);
insert into public.clients (id, name, phone) values ('c1000000-0000-0000-0000-000000000001', 'Carla Cliente', '(11) 98765-4321');

set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.servicos (id, categoria_id, nome, preco_base, duracao_base_minutos)
  select 'd1000000-0000-0000-0000-000000000001', id, 'Escova', 60, 30 from public.categorias_servico where nome = 'Cabelo';
select public.habilitar_servicos('bb000000-0000-0000-0000-0000000000b1', array['d1000000-0000-0000-0000-000000000001']::uuid[], true);

-- Agendados sem nenhuma comissão configurada: ficam com 0%.
select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', null, '2026-10-19 13:00+00', 'Teste', 65, 30);
select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-000000000001', '2026-10-19 14:00+00');
select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-000000000001', '2026-10-19 15:00+00');
update public.appointments set status = 'completed', payment_method = 'pix' where start_time = '2026-10-19 13:00+00';
select pg_temp.ok(pg_temp.pct('2026-10-19 13:00+00') = 0, 'sem configuração a comissão é 0%');

-- Taxa fixa no perfil: vale para os atendimentos já agendados e já concluídos em aberto.
insert into public.perfis_profissionais (user_id, comissao_padrao_percentual) values ('bb000000-0000-0000-0000-0000000000b1', 60);
select pg_temp.ok(pg_temp.pct('2026-10-19 13:00+00') = 60, 'concluído em aberto passa a usar a taxa fixa do perfil');
select pg_temp.ok(pg_temp.pct('2026-10-19 14:00+00') = 60, 'agendado passa a usar a taxa fixa do perfil');

-- Comissão no vínculo do serviço prevalece sobre o perfil, só naquele serviço.
update public.usuario_servico set comissao_percentual = 45 where user_id = 'bb000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.pct('2026-10-19 14:00+00') = 45 and pg_temp.pct('2026-10-19 13:00+00') = 60, 'vínculo do serviço prevalece só no serviço');

-- Fechado não muda.
update public.appointments set status = 'completed', payment_method = 'pix' where start_time = '2026-10-19 14:00+00';
select public.gerar_fechamento('bb000000-0000-0000-0000-0000000000b1', '2026-10-19', '2026-10-19', 'Teste');
update public.perfis_profissionais set comissao_padrao_percentual = 50 where user_id = 'bb000000-0000-0000-0000-0000000000b1';
update public.usuario_servico set comissao_percentual = null where user_id = 'bb000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.pct('2026-10-19 13:00+00') = 60 and pg_temp.pct('2026-10-19 14:00+00') = 45, 'atendimentos em fechamento ativo ficam como estavam');
select pg_temp.ok(pg_temp.pct('2026-10-19 15:00+00') = 50, 'agendado em aberto acompanha a nova taxa');

-- Base do serviço vale quando não há vínculo nem perfil; profissional não altera comissão.
update public.perfis_profissionais set comissao_padrao_percentual = null where user_id = 'bb000000-0000-0000-0000-0000000000b1';
update public.servicos set comissao_base_percentual = 35 where id = 'd1000000-0000-0000-0000-000000000001';
select pg_temp.ok(pg_temp.pct('2026-10-19 15:00+00') = 35, 'base do serviço vale sem vínculo nem perfil');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.espera_erro($$update public.appointments set comissao_percentual = 99 where start_time = '2026-10-19 15:00+00'$$, 'Somente a administradora');
update public.appointments set status = 'completed' where start_time = '2026-10-19 15:00+00';
select pg_temp.ok(pg_temp.pct('2026-10-19 15:00+00') = 35, 'profissional conclui e o banco grava a comissão vigente');
select pg_temp.espera_erro($$select public.recalcular_comissoes_abertas(null, null)$$, 'permission denied');
select pg_temp.espera_erro($$update public.appointments set gorjeta = 5 where start_time = '2026-10-19 15:00+00'$$, 'Somente a administradora');

-- Relatório de comissões: edição e exclusão só com justificativa, pelas funções do banco.
select pg_temp.espera_erro($$select public.excluir_lancamento((select id from public.appointments where start_time = '2026-10-19 15:00+00'), 'Lançado errado')$$, 'Somente a administradora');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
-- Sem segundo fator (sessão aal1).
select set_config('request.jwt.claims', '{"aal": "aal1"}', false);
select pg_temp.espera_erro($$select public.editar_lancamento((select id from public.appointments where start_time = '2026-10-19 15:00+00'), 70, 50, 'dinheiro', 5, ' ')$$, 'justificativa');
select pg_temp.espera_erro($$update public.lancamento_ajustes set justificativa = 'x'$$, 'permission denied');
select public.editar_lancamento((select id from public.appointments where start_time = '2026-10-19 15:00+00'), 70, 50, 'dinheiro', 5, 'Cliente pagou em dinheiro');
select pg_temp.ok((select valor_cobrado = 70 and comissao_percentual = 50 and payment_method = 'dinheiro' and gorjeta = 5
   from public.appointments where start_time = '2026-10-19 15:00+00'), 'administradora edita lançamento em aberto sem aal2');
select pg_temp.ok((select tipo = 'edicao' and valor_antes = 60 and valor_depois = 70 and comissao_antes = 35 and forma_depois = 'dinheiro'
   and cliente_nome = 'Carla Cliente' and servico_nome = 'Escova' and profissional_nome = 'Valentin' and justificativa = 'Cliente pagou em dinheiro'
   from public.lancamento_ajustes), 'edição grava antes, depois e justificativa');
select pg_temp.espera_erro($$select public.editar_lancamento((select id from public.appointments where start_time = '2026-10-19 14:00+00'), 1, 1, 'pix', 0, 'Tentativa em fechamento')$$, 'já incluído em fechamento');
select pg_temp.espera_erro($$select public.excluir_lancamento((select id from public.appointments where start_time = '2026-10-19 14:00+00'), 'Tentativa em fechamento')$$, 'já incluído em fechamento');
select pg_temp.ok((select count(*) from public.lancamento_ajustes) = 1, 'tentativa recusada não deixa ajuste');
select public.excluir_lancamento((select id from public.appointments where start_time = '2026-10-19 15:00+00'), 'Atendimento lançado em duplicidade');
select pg_temp.ok(not exists (select 1 from public.appointments where start_time = '2026-10-19 15:00+00'), 'administradora exclui lançamento em aberto sem aal2');
select pg_temp.ok((select valor_antes = 70 and gorjeta_antes = 5 and valor_depois is null from public.lancamento_ajustes where tipo = 'exclusao'), 'exclusão guarda os dados apagados');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) from public.lancamento_ajustes) = 2, 'profissional vê os ajustes dos próprios atendimentos');
reset role;
select pg_temp.ok((select count(*) from public.access_logs where acao = 'excluiu' and entidade = 'appointments') = 1, 'exclusão registrada na auditoria');
select 'Comissão vigente: OK';
