-- Lembrete do agendamento por WhatsApp (appointments.lembrete_enviado_em). Rodar com run.sh.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'OK %', msg; end $$;
create or replace function pg_temp.como(p_sub text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_sub, false);
$$;
select set_config('request.jwt.claims', '{"aal": "aal1"}', false);
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@ex.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p1@ex.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'p2@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Profissional Um', 'professional', true),
  ('cc000000-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-000000000003', 'Profissional Dois', 'professional', true);
insert into public.clients (id, name, phone) values
  ('c1000000-0000-0000-0000-000000000001', 'Carla Cliente', '(11) 98765-4321');

set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', null, '2026-11-20 13:00+00', 'Escova', 50, 60);
select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-0000000000c1', null, '2026-11-20 13:00+00', 'Corte', 80, 60);

-- 1) Administradora marca o lembrete de qualquer atendimento.
update public.appointments set lembrete_enviado_em = now() where professional_id = 'cc000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select lembrete_enviado_em is not null and whatsapp_sent_at is null from public.appointments where professional_id = 'cc000000-0000-0000-0000-0000000000c1'),
  'administradora marca o lembrete, separado da confirmação');

-- 2) Profissional (padrão: edita a própria agenda) marca o próprio e não o da outra.
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
update public.appointments set lembrete_enviado_em = now() where professional_id = 'bb000000-0000-0000-0000-0000000000b1';
update public.appointments set lembrete_enviado_em = null where professional_id = 'cc000000-0000-0000-0000-0000000000c1';
reset role;
select pg_temp.ok((select lembrete_enviado_em is not null from public.appointments where professional_id = 'bb000000-0000-0000-0000-0000000000b1'), 'profissional marca o próprio');
select pg_temp.ok((select lembrete_enviado_em is not null from public.appointments where professional_id = 'cc000000-0000-0000-0000-0000000000c1'), 'profissional não mexe no da outra');

-- 3) Só visualização da agenda: não marca nem o próprio.
set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.permissoes_profissional (user_id, modulo, nivel, alcance) values ('bb000000-0000-0000-0000-0000000000b1', 'agenda', 'ver', 'proprio');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
update public.appointments set lembrete_enviado_em = null where professional_id = 'bb000000-0000-0000-0000-0000000000b1';
reset role;
select pg_temp.ok((select lembrete_enviado_em is not null from public.appointments where professional_id = 'bb000000-0000-0000-0000-0000000000b1'), 'só visualização não marca');

-- 4) Sem sessão (anon) não altera.
set role anon;
do $$ begin update public.appointments set lembrete_enviado_em = null; exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.ok((select count(*) = 2 from public.appointments where lembrete_enviado_em is not null), 'anon não altera');
