-- Testes da reativação de clientes (fase 1: clientes_reativacao). Rodar com run.sh.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'OK %', msg; end $$;
create or replace function pg_temp.como(p_sub text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_sub, false);
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@ex.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p1@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Pro Um', 'professional', true);
insert into public.categorias_servico (id, nome) values ('ca000000-0000-0000-0000-000000000001', 'Unhas');
insert into public.servicos (id, categoria_id, nome, retorno_dias) values
  ('5e000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Manicure', 15),
  ('5e000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 'Pedicure', 20),
  ('5e000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', 'Spa dos pés', null);
insert into public.clients (id, name, phone) values
  ('c1000000-0000-0000-0000-000000000001', 'Ana Ativa', '11999990001'),
  ('c2000000-0000-0000-0000-000000000002', 'Bia Agendada', '11999990002'),
  ('c3000000-0000-0000-0000-000000000003', 'Carla Sem Atendimento', '11999990003');
insert into public.appointments (client_id, professional_id, servico_id, start_time, end_time, status, valor_cobrado, is_manual_reminder, is_block) values
  -- Ana: duas visitas em 12 meses (60 dias de intervalo); a última tem manicure e pedicure no mesmo dia
  ('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', '5e000000-0000-0000-0000-000000000003', now() - interval '80 days', now() - interval '80 days' + interval '1 hour', 'completed', 100, false, false),
  ('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', '5e000000-0000-0000-0000-000000000002', now() - interval '20 days' - interval '1 hour', now() - interval '20 days', 'completed', 60, false, false),
  ('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', '5e000000-0000-0000-0000-000000000001', now() - interval '20 days', now() - interval '20 days' + interval '1 hour', 'completed', 40, false, false),
  ('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', '5e000000-0000-0000-0000-000000000001', now() - interval '5 days', now() - interval '5 days' + interval '1 hour', 'cancelled', 40, false, false),
  ('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', null, now() + interval '3 days', now() + interval '3 days' + interval '1 hour', 'scheduled', null, true, false),
  -- Bia: atendida há 400 dias e com horário marcado
  ('c2000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-0000000000a1', '5e000000-0000-0000-0000-000000000001', now() - interval '400 days', now() - interval '400 days' + interval '1 hour', 'completed', 50, false, false),
  ('c2000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-0000000000a1', '5e000000-0000-0000-0000-000000000001', now() + interval '2 days', now() + interval '2 days' + interval '1 hour', 'confirmed', 50, false, false);

set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) = 2 from public.clientes_reativacao()), 'só clientes com atendimento concluído');
select pg_temp.ok((select ultimo_atendimento::date = (now() - interval '20 days')::date and retorno_ciclo_dias = 15
                          and visitas_12m = 2 and intervalo_medio_dias = 60 and total_12m = 200 and ticket_medio_12m = 100
                          and ultimo_profissional = 'Pro Um' and proximo_agendamento is null and telefone = '11999990001'
                     from public.clientes_reativacao() where cliente_id = 'c1000000-0000-0000-0000-000000000001'),
                  'Ana: menor ciclo do último dia, frequência, valor; cancelado e lembrete fora');
select pg_temp.ok((select visitas_12m = 0 and total_12m = 0 and ticket_medio_12m is null and intervalo_medio_dias is null
                          and proximo_agendamento::date = (now() + interval '2 days')::date
                     from public.clientes_reativacao() where cliente_id = 'c2000000-0000-0000-0000-000000000002'),
                  'Bia: nada em 12 meses e próximo agendamento');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) = 0 from public.clientes_reativacao()), 'profissional não recebe a lista (RLS de clients)');
reset role;
select pg_temp.ok(not has_function_privilege('anon', 'public.clientes_reativacao()', 'execute'), 'anon não executa');
\echo 'Testes da reativação: OK'
