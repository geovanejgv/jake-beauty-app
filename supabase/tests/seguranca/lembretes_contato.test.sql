-- Testes dos lembretes de contato (reativação, fase 3). Rodar com run.sh.
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
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@ex.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p1@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Pro Um', 'professional', true);
insert into public.clients (id, name, phone) values
  ('c1000000-0000-0000-0000-000000000001', 'Ana', '11999990001'),
  ('c2000000-0000-0000-0000-000000000002', 'Bia', '11999990002');
insert into public.estabelecimentos (id, nome, plano) values ('5a1ab0e1-0000-4000-8000-0000000000b2', 'Salão B', 'premium');
insert into public.clients (id, name, phone, estabelecimento_id) values ('cb000000-0000-0000-0000-0000000000b2', 'Cliente B', '', '5a1ab0e1-0000-4000-8000-0000000000b2');

set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');

-- 1) Criação com regras do banco
insert into public.lembretes_contato (id, client_id, data, observacao, status, created_by, concluido_em)
  values ('90000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_date, '  Ligar depois das 14h ', 'concluido', 'bb000000-0000-0000-0000-0000000000b1', now());
select pg_temp.ok((select status = 'pendente' and concluido_em is null and created_by = 'aa000000-0000-0000-0000-0000000000a1' and observacao = 'Ligar depois das 14h'
                     from public.lembretes_contato where id = '90000000-0000-0000-0000-000000000001'), 'criação com padrões do banco');
insert into public.lembretes_contato (id, client_id, data) values ('90000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', current_date + 7);
select pg_temp.espera_erro($$insert into public.lembretes_contato (client_id, data) values ('cb000000-0000-0000-0000-0000000000b2', current_date)$$, 'referencia_de_outro_estabelecimento');
select pg_temp.espera_erro($$insert into public.lembretes_contato (client_id, data, observacao) values ('c1000000-0000-0000-0000-000000000001', current_date, repeat('x', 501))$$, 'lembretes_contato_observacao_check');

-- 2) Adiar muda a data; cancelar não volta
update public.lembretes_contato set data = data + 3 where id = '90000000-0000-0000-0000-000000000002';
select pg_temp.ok((select data = current_date + 10 and status = 'pendente' from public.lembretes_contato where id = '90000000-0000-0000-0000-000000000002'), 'adiar');
update public.lembretes_contato set status = 'cancelado' where id = '90000000-0000-0000-0000-000000000002';
select pg_temp.espera_erro($$update public.lembretes_contato set status = 'pendente' where id = '90000000-0000-0000-0000-000000000002'$$, 'já concluído ou cancelado');

-- 3) Convite registrado conclui o lembrete pendente da cliente
insert into public.contatos_reativacao (id, client_id, texto_enviado) values ('80000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Oi, Ana!');
select pg_temp.ok((select status = 'concluido' and contato_id = '80000000-0000-0000-0000-000000000001' and concluido_em is not null
                     from public.lembretes_contato where id = '90000000-0000-0000-0000-000000000001'), 'convite conclui o lembrete');
select pg_temp.ok((select status = 'cancelado' from public.lembretes_contato where id = '90000000-0000-0000-0000-000000000002'), 'lembrete de outra cliente não muda');

-- 4) Profissional não vê nem grava; anon sem acesso; trilha
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) = 0 from public.lembretes_contato), 'profissional não vê lembretes');
select pg_temp.espera_erro($$insert into public.lembretes_contato (client_id, data) values ('c1000000-0000-0000-0000-000000000001', current_date)$$, 'row-level security');
reset role;
select pg_temp.ok(not has_table_privilege('anon', 'public.lembretes_contato', 'select'), 'anon sem acesso');
select pg_temp.ok((select count(*) >= 2 from public.access_logs where entidade = 'lembretes_contato'), 'lembretes na trilha');
\echo 'Testes dos lembretes de contato: OK'
