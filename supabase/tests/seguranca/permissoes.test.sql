-- Permissões por profissional (fase 1): Agenda, Clientes, Relatório de comissões e
-- histórico de ações. Rodar com run.sh.
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
select set_config('request.jwt.claims', '{"aal": "aal1"}', false);
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@ex.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p1@ex.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'p2@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Profissional Um', 'professional', true),
  ('cc000000-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-000000000003', 'Profissional Dois', 'professional', true);
insert into public.clients (id, name, phone, email) values
  ('c1000000-0000-0000-0000-000000000001', 'Carla Cliente', '(11) 98765-4321', 'carla@ex.com');

set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', null, '2026-10-20 13:00+00', 'Escova', 50, 60);
select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-0000000000c1', null, '2026-10-20 13:00+00', 'Corte', 80, 60);
update public.appointments set status = 'completed', payment_method = 'pix' where professional_id = 'cc000000-0000-0000-0000-0000000000c1';
select public.gerar_fechamento('cc000000-0000-0000-0000-0000000000c1', '2026-10-01', '2026-10-31');
select pg_temp.ok((select count(*) from public.minhas_permissoes() where nivel = 'editar' and alcance = 'todos') = 14, 'administradora tem todas as telas');
select pg_temp.espera_erro($$insert into public.permissoes_profissional (user_id, modulo, nivel) values ('aa000000-0000-0000-0000-0000000000a1', 'agenda', 'ver')$$, 'já tem acesso');

-- 1) Padrão: só os próprios dados; clientes só com o nome.
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select nivel = 'editar' and alcance = 'proprio' from public.minhas_permissoes() where modulo = 'agenda'), 'padrão: agenda própria com edição');
select pg_temp.ok((select nivel from public.minhas_permissoes() where modulo = 'financas') = 'nenhum', 'padrão: telas da administradora sem acesso');
select pg_temp.ok((select count(*) from public.appointments) = 1, 'padrão: só os próprios atendimentos');
select pg_temp.ok((select phone = '(**) *****-**21' and email = 'c***@***' and not contato_visivel from public.clientes_visiveis where id = 'c1000000-0000-0000-0000-000000000001'), 'padrão: cliente só com o nome');
select pg_temp.ok((select count(*) from public.fechamentos) = 0, 'padrão: não vê fechamento alheio');
select pg_temp.espera_erro($$select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-0000000000c1', null, '2026-10-21 13:00+00', 'Escova', 50, 60)$$, 'própria agenda');
select pg_temp.espera_erro($$insert into public.permissoes_profissional (user_id, modulo, nivel, alcance) values ('bb000000-0000-0000-0000-0000000000b1', 'agenda', 'editar', 'todos')$$, 'row-level security');
insert into public.cliente_historico (cliente_id, tipo, texto) values ('c1000000-0000-0000-0000-000000000001', 'tecnico', 'Coloração 7.1');
update public.appointments set status = 'confirmed' where professional_id = 'bb000000-0000-0000-0000-0000000000b1';

-- 2) Agenda: ver a de todas, sem editar.
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.permissoes_profissional (user_id, modulo, nivel, alcance) values ('bb000000-0000-0000-0000-0000000000b1', 'agenda', 'ver', 'todos');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) from public.appointments) = 2, 'agenda de todas: vê os atendimentos da outra profissional');
select pg_temp.espera_erro($$select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', null, '2026-10-21 13:00+00', 'Escova', 50, 60)$$, 'Sem permissão para agendar');
update public.appointments set status = 'scheduled' where professional_id = 'bb000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select status from public.appointments where professional_id = 'bb000000-0000-0000-0000-0000000000b1') = 'confirmed', 'só visualização: não altera nem o próprio');

-- 3) Agenda: editar a de todas (agenda para a outra e remarca).
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
update public.permissoes_profissional set nivel = 'editar' where user_id = 'bb000000-0000-0000-0000-0000000000b1' and modulo = 'agenda';
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok(public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-0000000000c1', null, '2026-10-22 13:00+00', 'Escova', 999, 60) is not null, 'edição de todas: agenda para a outra profissional');
select public.remarcar_atendimento((select id from public.appointments where start_time = '2026-10-22 13:00+00'), '2026-10-22 15:00+00');
select pg_temp.ok(exists (select 1 from public.appointments where start_time = '2026-10-22 15:00+00'), 'edição de todas: remarca atendimento da outra');
select pg_temp.espera_erro($$update public.appointments set valor_cobrado = 1 where start_time = '2026-10-22 15:00+00'$$, 'Somente a administradora');

-- 4) Clientes: só os dados liberados; sem acesso, sem histórico.
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.permissoes_profissional (user_id, modulo, nivel, campos) values ('bb000000-0000-0000-0000-0000000000b1', 'clientes', 'ver', array['telefone']);
select pg_temp.espera_erro($$insert into public.permissoes_profissional (user_id, modulo, nivel, campos) values ('cc000000-0000-0000-0000-0000000000c1', 'clientes', 'ver', array['cpf'])$$, 'permissoes_profissional_campos_check');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select phone = '(11) 98765-4321' and contato_visivel and email = 'c***@***' and not email_visivel from public.clientes_visiveis where id = 'c1000000-0000-0000-0000-000000000001'), 'clientes: vê só o telefone liberado');
select pg_temp.espera_erro($$insert into public.cliente_historico (cliente_id, tipo, texto) values ('c1000000-0000-0000-0000-000000000001', 'tecnico', 'x')$$, 'row-level security');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
update public.permissoes_profissional set nivel = 'nenhum' where user_id = 'bb000000-0000-0000-0000-0000000000b1' and modulo = 'clientes';
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) from public.cliente_historico) = 0, 'clientes sem acesso: não lê o histórico');
select pg_temp.ok((select phone = '(**) *****-**21' from public.clientes_visiveis where id = 'c1000000-0000-0000-0000-000000000001'), 'clientes sem acesso: telefone volta a ficar oculto');

-- 5) Relatório de comissões de todas: fechamento da outra profissional.
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.permissoes_profissional (user_id, modulo, nivel, alcance) values ('bb000000-0000-0000-0000-0000000000b1', 'relatorio_comissoes', 'ver', 'todos');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) from public.fechamentos) = 1 and (select count(*) from public.fechamento_itens) = 1, 'relatório de todas: vê fechamento da outra');
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select count(*) from public.permissoes_profissional) = 0, 'profissional não lê permissões alheias');

-- 6) Histórico: ações da profissional, só a administradora lê.
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) from public.historico_acoes) = 0, 'profissional não lê o histórico');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) from public.historico_acoes where user_id = 'bb000000-0000-0000-0000-0000000000b1' and tela = 'agenda' and acao = 'criou') = 1, 'histórico: agendamento criado pela profissional');
select pg_temp.ok((select count(*) from public.historico_acoes where user_id = 'bb000000-0000-0000-0000-0000000000b1' and acao = 'alterou' and 'start_time' = any (campos)) = 1, 'histórico: remarcação com os campos alterados');
select pg_temp.ok((select count(*) from public.historico_acoes where tela = 'clientes' and acao = 'criou') = 1, 'histórico: registro técnico em clientes');
select pg_temp.ok((select count(*) from public.historico_acoes where user_id = 'aa000000-0000-0000-0000-0000000000a1') = 0, 'histórico não registra a administradora');
reset role;
select 'Permissões: OK';
