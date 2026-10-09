-- Testes dos pacotes de sessões (venda, rateio, reserva, abatimento, falta, validade,
-- renovação, anulação, comissão na execução e acesso). Rodar com run.sh.
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
-- Horário local (São Paulo) daqui a N dias, na hora H.
create or replace function pg_temp.h(p_dias int, p_hora int) returns timestamptz language sql as $$
  select ((public.hoje_local() + p_dias)::timestamp + make_interval(hours => p_hora)) at time zone 'America/Sao_Paulo';
$$;
-- As sessões destes testes já concluíram o MFA (aal2); as regras de aal1 estão em login_mfa.test.sql.
select set_config('request.jwt.claims', '{"aal": "aal2"}', false);
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- A = administradora; P e Q = profissionais
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@ex.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p1@ex.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'p2@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Profissional Um', 'professional', true),
  ('cc000000-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-000000000003', 'Profissional Dois', 'professional', true);
insert into public.clients (id, name, phone) values
  ('c1000000-0000-0000-0000-000000000001', 'Carla Titular', '(11) 98765-4321'),
  ('c2000000-0000-0000-0000-000000000002', 'Dora Outra', '(11) 91111-2222');
insert into public.servicos (id, categoria_id, nome, preco_base, duracao_base_minutos)
  select 'e1000000-0000-0000-0000-000000000001', id, 'Laser', 100, 45 from public.categorias_servico where nome = 'Depilação';
insert into public.servicos (id, categoria_id, nome, preco_base, duracao_base_minutos)
  select 'e2000000-0000-0000-0000-000000000002', id, 'Drenagem', 50, 60 from public.categorias_servico where nome = 'Estética Corporal';
insert into public.usuario_servico (user_id, servico_id) values
  ('bb000000-0000-0000-0000-0000000000b1', 'e1000000-0000-0000-0000-000000000001'),
  ('bb000000-0000-0000-0000-0000000000b1', 'e2000000-0000-0000-0000-000000000002'),
  ('cc000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-000000000001');
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.7"}', false);

set role authenticated;

-- 1) Venda: só a administradora; pagamentos fecham o total; rateio pelo preço de tabela
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.espera_erro($$select public.vender_pacote('c1000000-0000-0000-0000-000000000001', 'X', public.hoje_local() + 30, 100,
  '[{"servico_id":"e1000000-0000-0000-0000-000000000001","sessoes":1,"comissao_percentual":40}]', '[{"forma":"pix","valor":100}]')$$, 'Somente a administradora');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.espera_erro($$select public.vender_pacote('c1000000-0000-0000-0000-000000000001', 'X', public.hoje_local() + 30, 100,
  '[{"servico_id":"e1000000-0000-0000-0000-000000000001","sessoes":1,"comissao_percentual":40}]', '[{"forma":"pix","valor":90}]')$$, 'soma dos pagamentos');
select pg_temp.espera_erro($$select public.vender_pacote('c1000000-0000-0000-0000-000000000001', 'X', public.hoje_local(), 100,
  '[{"servico_id":"e1000000-0000-0000-0000-000000000001","sessoes":1,"comissao_percentual":40}]', '[{"forma":"pix","valor":100}]')$$, 'Validade inválida');
select pg_temp.espera_erro($$select public.vender_pacote('c1000000-0000-0000-0000-000000000001', 'X', public.hoje_local() + 30, 100,
  '[{"servico_id":"e1000000-0000-0000-0000-000000000001","sessoes":1,"comissao_percentual":140}]', '[{"forma":"pix","valor":100}]')$$, 'comissão entre 0 e 100');
select pg_temp.espera_erro($$select public.vender_pacote('c1000000-0000-0000-0000-000000000001', 'X', public.hoje_local() + 30, 100,
  '[{"servico_id":"e1000000-0000-0000-0000-000000000001","sessoes":1,"comissao_percentual":40}]', '[{"forma":"pix","valor":100,"parcelas":3}]')$$, 'Forma de pagamento inválida');

-- Pacote combinado: 8 laser (tabela 800) + 4 drenagem (tabela 200) por R$ 900; crédito 500 (3,49%) + pix 400.
select public.vender_pacote('c1000000-0000-0000-0000-000000000001', 'Corpo verão', (public.hoje_local() + interval '12 months')::date, 900,
  '[{"servico_id":"e1000000-0000-0000-0000-000000000001","sessoes":8,"comissao_percentual":40},
    {"servico_id":"e2000000-0000-0000-0000-000000000002","sessoes":4,"comissao_percentual":30}]',
  '[{"forma":"credito","parcelas":3,"valor":500},{"forma":"pix","valor":400}]', 'Venda balcão') as pacote1 \gset
select pg_temp.ok((select taxa_percentual = 1.94 and valor_total = 900 and status = 'ativo' from public.pacotes where id = :'pacote1'), 'taxa média ponderada das formas (500 x 3,49% / 900)');
select pg_temp.ok((select valor_item = 720 and valor_sessao = 90 and comissao_percentual = 40 from public.pacote_itens where pacote_id = :'pacote1' and servico_id = 'e1000000-0000-0000-0000-000000000001'), 'laser: 720 rateados, 90 por sessão');
select pg_temp.ok((select valor_item = 180 and valor_sessao = 45 from public.pacote_itens where pacote_id = :'pacote1' and servico_id = 'e2000000-0000-0000-0000-000000000002'), 'drenagem: 180 rateados, 45 por sessão');
select pg_temp.ok((select count(*) = 2 and sum(valor) = 900 from public.pacote_pagamentos where pacote_id = :'pacote1'), 'pagamentos gravados');
select pg_temp.ok((select count(*) = 1 from public.access_logs where acao = 'pacote_vendido'), 'venda auditada');
select id as laser from public.pacote_itens where pacote_id = :'pacote1' and servico_id = 'e1000000-0000-0000-0000-000000000001' \gset
select id as dren from public.pacote_itens where pacote_id = :'pacote1' and servico_id = 'e2000000-0000-0000-0000-000000000002' \gset

-- 2) Profissional: vê saldo sem valores, não lê as tabelas, agenda com pacote (reserva)
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) from public.pacotes) = 0 and (select count(*) from public.pacote_pagamentos) = 0, 'profissional não lê as tabelas de pacote');
select pg_temp.ok((select disponiveis = 8 and valor_sessao is null and valor_restante is null and comissao_percentual is null
   from public.pacote_saldos('c1000000-0000-0000-0000-000000000001') where item_id = :'laser'), 'saldo sem valores para a profissional');
select pg_temp.ok((select count(*) from public.pacote_saldos()) = 0, 'profissional não lista todos os pacotes');
select pg_temp.ok(public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1',
  'e1000000-0000-0000-0000-000000000001', pg_temp.h(5, 9), null, 1, null, 'scheduled', null, :'laser') is not null, 'profissional agenda sessão do pacote');
select pg_temp.ok((select valor_cobrado = 90 and comissao_percentual = 40 and pacote_item_id = :'laser' from public.appointments where start_time = pg_temp.h(5, 9)),
  'valor e comissão do pacote (valor enviado ignorado)');
select pg_temp.ok((select disponiveis = 7 and reservadas = 1 from public.pacote_saldos('c1000000-0000-0000-0000-000000000001') where item_id = :'laser'), 'agendar reserva a sessão');
select pg_temp.espera_erro(format($$select public.agendar_atendimento('c2000000-0000-0000-0000-000000000002', 'bb000000-0000-0000-0000-0000000000b1',
  'e1000000-0000-0000-0000-000000000001', pg_temp.h(5, 11), null, null, null, 'scheduled', null, %L)$$, :'laser'), 'outra cliente');
select pg_temp.espera_erro(format($$select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1',
  'e2000000-0000-0000-0000-000000000002', pg_temp.h(5, 11), null, null, null, 'scheduled', null, %L)$$, :'laser'), 'não é o do pacote');
select pg_temp.espera_erro(format($$update public.appointments set pacote_item_id = null where pacote_item_id = %L$$, :'laser'), 'Somente a administradora');
select pg_temp.espera_erro($$update public.appointments set taxa_percentual = 0$$, 'Somente a administradora');

-- 3) Conclusão abate a sessão; idempotente; não exclui atendimento abatido
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
update public.appointments set status = 'completed', gorjeta = 5 where start_time = pg_temp.h(5, 9);
select pg_temp.ok((select payment_method = 'pacote' and valor_cobrado = 90 and taxa_percentual = 1.94 and comissao_percentual = 40
   from public.appointments where start_time = pg_temp.h(5, 9)), 'conclusão grava forma pacote, valor, taxa e comissão da venda');
update public.appointments set status = 'completed' where start_time = pg_temp.h(5, 9);
select pg_temp.ok((select count(*) = 1 and sum(valor) = 90 from public.pacote_movimentos where tipo = 'uso'), 'um único abatimento por atendimento');
select pg_temp.ok((select usadas = 1 and reservadas = 0 and disponiveis = 7 and valor_restante = 630
   from public.pacote_saldos('c1000000-0000-0000-0000-000000000001') where item_id = :'laser'), 'saldo após o uso');
select pg_temp.espera_erro($$delete from public.appointments where payment_method = 'pacote'$$, 'já abatido do pacote');
select pg_temp.espera_erro($$insert into public.appointments (client_id, professional_id, start_time, end_time, payment_method) values ('c2000000-0000-0000-0000-000000000002', 'bb000000-0000-0000-0000-0000000000b1', pg_temp.h(50, 9), pg_temp.h(50, 10), 'pacote')$$, 'exige um pacote');

-- 4) Comissão na execução: outra profissional executa a sessão seguinte e recebe
select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-0000000000c1',
  'e1000000-0000-0000-0000-000000000001', pg_temp.h(6, 9), null, null, null, 'confirmed', null, :'laser');
update public.appointments set status = 'completed' where start_time = pg_temp.h(6, 9);
select public.gerar_fechamento('cc000000-0000-0000-0000-0000000000c1', public.hoje_local(), public.hoje_local() + 30) as fech \gset
-- 90 com taxa 1,94% = 1,75; base 88,25; 40% = 35,30
select pg_temp.ok((select qtd_atendimentos = 1 and total_bruto = 90 and total_taxas = 1.75 and total_comissao = 35.30 and total_a_pagar = 35.30
   from public.fechamentos where id = :'fech'), 'sessão entra no fechamento de quem executou, com a taxa do pacote');
select pg_temp.espera_erro($$update public.appointments set status = 'scheduled' where start_time = pg_temp.h(6, 9)$$, 'já incluído em fechamento');

-- 5) Falta consome a sessão sem comissão; voltar o status devolve
select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1',
  'e1000000-0000-0000-0000-000000000001', pg_temp.h(7, 9), null, null, null, 'scheduled', null, :'laser');
update public.appointments set status = 'no_show' where start_time = pg_temp.h(7, 9);
select pg_temp.ok((select usadas = 2 and faltas = 1 and disponiveis = 5 from public.pacote_saldos('c1000000-0000-0000-0000-000000000001') where item_id = :'laser'), 'falta consome a sessão');
reset role;
select pg_temp.ok((select count(*) = 0 from public.fechamento_candidatos('bb000000-0000-0000-0000-0000000000b1', public.hoje_local(), public.hoje_local() + 30)
   where agendamento_id = (select id from public.appointments where start_time = pg_temp.h(7, 9))), 'falta não gera comissão');
set role authenticated;
update public.appointments set status = 'scheduled' where start_time = pg_temp.h(7, 9);
select pg_temp.ok((select faltas = 0 and reservadas = 1 from public.pacote_saldos('c1000000-0000-0000-0000-000000000001') where item_id = :'laser'), 'voltar o status desfaz a falta');
select pg_temp.ok((select count(*) = 1 from public.access_logs where acao = 'excluiu' and entidade = 'pacote_movimentos'), 'desfazer movimento fica na trilha');
update public.appointments set status = 'cancelled' where start_time = pg_temp.h(7, 9);
select pg_temp.ok((select reservadas = 0 and disponiveis = 6 from public.pacote_saldos('c1000000-0000-0000-0000-000000000001') where item_id = :'laser'), 'cancelar libera a reserva');

-- 6) Saldo esgotado: 4 drenagens reservadas, a quinta é recusada
select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1',
  'e2000000-0000-0000-0000-000000000002', pg_temp.h(10 + n, 14), null, null, null, 'scheduled', null, :'dren')
  from generate_series(1, 4) n;
select pg_temp.espera_erro(format($$select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1',
  'e2000000-0000-0000-0000-000000000002', pg_temp.h(20, 14), null, null, null, 'scheduled', null, %L)$$, :'dren'), 'sem sessões disponíveis');
select pg_temp.ok((select disponiveis = 0 from public.pacote_saldos('c1000000-0000-0000-0000-000000000001') where item_id = :'dren'), 'drenagem sem saldo');

-- 7) Último centavo: R$ 100 em 3 sessões = 33,33 + 33,33 + 33,34
select public.vender_pacote('c2000000-0000-0000-0000-000000000002', 'Laser 3x', public.hoje_local() + 90, 100,
  '[{"servico_id":"e1000000-0000-0000-0000-000000000001","sessoes":3,"comissao_percentual":50}]', '[{"forma":"dinheiro","valor":100}]') as pacote2 \gset
select id as item2 from public.pacote_itens where pacote_id = :'pacote2' \gset
select public.agendar_atendimento('c2000000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-0000000000c1',
  'e1000000-0000-0000-0000-000000000001', pg_temp.h(8, 9 + n), null, null, null, 'scheduled', null, :'item2')
  from generate_series(0, 2) n;
update public.appointments set status = 'completed' where pacote_item_id = :'item2';
select pg_temp.ok((select sum(valor) = 100 and max(valor) = 33.34 and min(valor) = 33.33 from public.pacote_movimentos where item_id = :'item2'), 'rateio fecha no centavo');
select pg_temp.ok((select sum(valor_cobrado) = 100 from public.appointments where pacote_item_id = :'item2'), 'atendimentos somam o valor do pacote');

-- 8) Validade: vencido não agenda; renovação reabre
reset role;
update public.pacotes set validade = public.hoje_local() - 1 where id = :'pacote1';
set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select vencido and disponiveis = 0 from public.pacote_saldos('c1000000-0000-0000-0000-000000000001', true) where item_id = :'laser'), 'pacote vencido sem saldo disponível');
select pg_temp.ok((select count(*) = 0 from public.pacote_saldos('c1000000-0000-0000-0000-000000000001')), 'vencido sai da lista padrão');
select pg_temp.espera_erro(format($$select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1',
  'e1000000-0000-0000-0000-000000000001', pg_temp.h(30, 9), null, null, null, 'scheduled', null, %L)$$, :'laser'), 'vencido');
select pg_temp.espera_erro(format($$select public.renovar_pacote(%L, public.hoje_local() - 1, 'Cliente pediu')$$, :'pacote1'), 'nova validade');
select public.renovar_pacote(:'pacote1', (public.hoje_local() + interval '12 months')::date, 'Cliente operada, retomando');
select pg_temp.ok((select count(*) = 1 from public.pacote_movimentos where pacote_id = :'pacote1' and tipo = 'renovacao'), 'renovação no extrato');
select pg_temp.ok(public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1',
  'e1000000-0000-0000-0000-000000000001', pg_temp.h(30, 9), null, null, null, 'scheduled', null, :'laser') is not null, 'renovado volta a agendar');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.espera_erro(format($$select public.renovar_pacote(%L, public.hoje_local() + 400, 'teste')$$, :'pacote1'), 'Somente a administradora');

-- 9) Anulação: só sem uso; pacote anulado não agenda
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.espera_erro(format($$select public.anular_pacote(%L, 'Lançado errado')$$, :'pacote1'), 'sessão usada');
select public.vender_pacote('c2000000-0000-0000-0000-000000000002', 'Engano', public.hoje_local() + 90, 0,
  '[{"servico_id":"e2000000-0000-0000-0000-000000000002","sessoes":2,"comissao_percentual":0}]', '[]') as pacote3 \gset
select id as item3 from public.pacote_itens where pacote_id = :'pacote3' \gset
select public.agendar_atendimento('c2000000-0000-0000-0000-000000000002', 'bb000000-0000-0000-0000-0000000000b1',
  'e2000000-0000-0000-0000-000000000002', pg_temp.h(40, 9), null, null, null, 'scheduled', null, :'item3');
select pg_temp.espera_erro(format($$select public.anular_pacote(%L, 'Lançado errado')$$, :'pacote3'), 'Cancele-os antes');
update public.appointments set status = 'cancelled' where pacote_item_id = :'item3';
select public.anular_pacote(:'pacote3', 'Lançado errado');
select pg_temp.ok((select status = 'anulado' from public.pacotes where id = :'pacote3'), 'pacote anulado');
select pg_temp.espera_erro(format($$update public.appointments set status = 'scheduled' where pacote_item_id = %L$$, :'item3'), 'Pacote anulado');
select pg_temp.ok((select count(*) = 1 from public.access_logs where acao = 'pacote_anulado'), 'anulação auditada');

-- 10) Escrita direta nas tabelas é negada (só funções)
select pg_temp.espera_erro(format($$update public.pacotes set validade = '2099-01-01' where id = %L$$, :'pacote1'), 'permission denied');
select pg_temp.espera_erro($$insert into public.pacote_movimentos (pacote_id, tipo, quantidade) select id, 'renovacao', 0 from public.pacotes limit 1$$, 'permission denied');
reset role;
set role anon;
select pg_temp.espera_erro($$select * from public.pacote_saldos()$$, 'permission denied');
reset role;

-- 11) RLS ligado nas tabelas novas e nenhuma política aberta
select pg_temp.ok((select bool_and(rowsecurity) from pg_tables where schemaname = 'public' and tablename like 'pacote%'), 'RLS em todas as tabelas de pacote');
select pg_temp.ok((select count(*) = 0 from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')), 'nenhuma política using (true)');
\echo 'Testes de pacotes: OK'
