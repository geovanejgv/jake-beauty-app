-- Testes de segurança do banco. Rodar com supabase/tests/seguranca/run.sh
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
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- Pessoas: A = administradora ativa; B = profissional ativa; C = login sem perfil; D = perfil inativo
insert into auth.users values ('33333333-3333-3333-3333-333333333333', 'c@ex.com'), ('44444444-4444-4444-4444-444444444444', 'd@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Admin', 'admin', true),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Prof', 'professional', true),
  ('d0000000-0000-0000-0000-00000000000d', '44444444-4444-4444-4444-444444444444', 'Inativa', 'professional', false);
insert into public.personal_finances (description, amount, finance_date) values ('aluguel casa', 1000, '2026-10-01');
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "teste/1.0"}', false);

-- 1) Estrutura: RLS em toda tabela, nenhuma política aberta, nada executável por anon
select pg_temp.ok((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0, 'AUZ-04: toda tabela com RLS');
select pg_temp.ok((select count(*) from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')) = 0, 'AUZ-04: nenhuma política using(true)');
select pg_temp.ok((select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')
  and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')) = 0, 'anon não executa nenhuma função do app');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.auditoria_gravar(text,text,text,jsonb)', 'execute'), 'auditoria_gravar é interna');

-- 2) Visitante sem sessão
set role anon;
select pg_temp.espera_erro('select * from public.clients', 'permission denied');
select pg_temp.espera_erro('select * from public.users', 'permission denied');
select pg_temp.espera_erro('select * from public.access_logs', 'permission denied');
select pg_temp.espera_erro('select public.registrar_auditoria(''login'')', 'permission denied');
select pg_temp.espera_erro('select public.kanban_garantir_padrao()', 'permission denied');
reset role;

-- 3) Login sem perfil (C) e perfil inativo (D): não leem nem gravam nada
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select pg_temp.ok((select count(*) from public.clients) = 0, 'sem perfil: não lê clientes');
select pg_temp.ok((select count(*) from public.users) = 0, 'sem perfil: não lê equipe');
select pg_temp.espera_erro('insert into public.clients (name, phone) values (''x'', ''1'')', 'row-level security');
select pg_temp.espera_erro('select public.kanban_usuario_atual()', 'Acesso ainda não liberado');
select pg_temp.espera_erro('select public.kanban_garantir_padrao()', 'Acesso ainda não liberado');
select pg_temp.espera_erro('insert into public.users (auth_id, name, role) values (auth.uid(), ''eu'', ''admin'')', 'row-level security');
select public.registrar_auditoria('login_negado');
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
select pg_temp.ok((select count(*) from public.clients) = 0, 'inativo: não lê clientes');
select pg_temp.espera_erro('select public.kanban_usuario_atual()', 'Acesso ainda não liberado');
update public.users set active = true where auth_id = auth.uid();
reset role;
select pg_temp.ok(not (select active from public.users where id = 'd0000000-0000-0000-0000-00000000000d'), 'inativo não se reativa');

-- 4) Profissional ativa (B)
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select public.registrar_auditoria('login');
select pg_temp.ok((select count(*) from public.clients) = 1, 'profissional lê clientes');
insert into public.clients (id, name, phone) values ('c0000000-0000-0000-0000-000000000002', 'Nova', '2');
update public.clients set name = 'Nova Cliente' where id = 'c0000000-0000-0000-0000-000000000002';
delete from public.clients where id = 'c0000000-0000-0000-0000-000000000002';
select pg_temp.ok((select count(*) from public.users) = 3, 'profissional lê a equipe');
select pg_temp.ok((select count(*) from public.personal_finances) = 0, 'profissional não lê finanças pessoais');
select pg_temp.espera_erro('insert into public.personal_finances (description, amount, finance_date) values (''x'', 1, current_date)', 'row-level security');
update public.users set role = 'admin' where auth_id = auth.uid();
select pg_temp.espera_erro('insert into public.users (name, role) values (''Outra'', ''professional'')', 'row-level security');
select pg_temp.ok((select count(*) from public.access_logs) = 0, 'profissional não lê a auditoria');
select pg_temp.espera_erro('insert into public.access_logs (acao, entidade) values (''login'', ''x'')', 'permission denied');
select pg_temp.espera_erro('select public.registrar_auditoria(''excluiu'')', 'Evento de auditoria inválido');
select pg_temp.espera_erro('select public.auditoria_gravar(''excluiu'', ''clients'', null, null)', 'permission denied');
select pg_temp.ok(public.kanban_usuario_atual() = 'b0000000-0000-0000-0000-00000000000b', 'kanban reconhece a profissional');
select public.kanban_garantir_padrao();
select pg_temp.ok((select count(*) from public.kanban_quadros) = 1, 'profissional usa o Kanban');
reset role;
select pg_temp.ok((select role::text from public.users where id = 'b0000000-0000-0000-0000-00000000000b') = 'professional', 'AUZ-06: profissional não se promove');

-- 5) Administradora (A)
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.ok((select count(*) from public.personal_finances) = 1, 'admin lê finanças pessoais');
insert into public.personal_finances (description, amount, finance_date) values ('luz', 100, '2026-10-05');
insert into public.users (id, name, role) values ('e0000000-0000-0000-0000-00000000000e', 'Nova Profissional', 'professional');
update public.users set name = 'Nova Prof.' where id = 'e0000000-0000-0000-0000-00000000000e'; -- só nome: sem auditoria
update public.users set active = false where id = 'b0000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.access_logs) > 0, 'admin lê a auditoria');
select pg_temp.espera_erro('update public.access_logs set acao = ''login''', 'permission denied');
select pg_temp.espera_erro('delete from public.access_logs', 'permission denied');
reset role;

-- 6) B desativada perde o acesso na hora
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.ok((select count(*) from public.clients) = 0, 'desativada não lê mais');
select pg_temp.espera_erro('select public.kanban_usuario_atual()', 'Acesso ainda não liberado');
reset role;

-- 7) Trilha: somente inserção, inclusive para service_role e dono
set role service_role;
select pg_temp.espera_erro('update public.access_logs set acao = ''login''', 'permission denied');
select pg_temp.espera_erro('delete from public.access_logs', 'permission denied');
reset role;
select pg_temp.espera_erro('update public.access_logs set acao = ''login''', 'somente inserção');
select pg_temp.espera_erro('delete from public.access_logs', 'somente inserção');
select pg_temp.espera_erro('truncate public.access_logs', 'somente inserção');

-- 8) Conteúdo dos registros: quem, o quê, de onde, sem dado pessoal
select pg_temp.ok((select count(*) from public.access_logs where acao = 'login_negado' and auth_id = '33333333-3333-3333-3333-333333333333' and user_id is null) = 1, 'login negado registrado');
select pg_temp.ok((select count(*) from public.access_logs where acao = 'login' and user_id = 'b0000000-0000-0000-0000-00000000000b') = 1, 'login registrado com o perfil');
select pg_temp.ok((select ip from public.access_logs where acao = 'login') = '203.0.113.7', 'IP do primeiro x-forwarded-for');
select pg_temp.ok((select user_agent from public.access_logs where acao = 'login') = 'teste/1.0', 'user agent registrado');
select pg_temp.ok((select count(*) from public.access_logs where acao = 'alterou' and entidade = 'clients' and entidade_id = 'c0000000-0000-0000-0000-000000000002') = 1, 'alteração de cliente registrada');
select pg_temp.ok((select count(*) from public.access_logs where acao = 'excluiu' and entidade = 'clients' and entidade_id = 'c0000000-0000-0000-0000-000000000002' and user_id = 'b0000000-0000-0000-0000-00000000000b') = 1, 'exclusão registrada com autor');
select pg_temp.ok((select count(*) from public.access_logs where acao = 'usuario_criado' and entidade_id = 'e0000000-0000-0000-0000-00000000000e') = 1, 'usuário criado registrado');
select pg_temp.ok((select count(*) from public.access_logs where acao = 'permissao_alterada' and entidade_id = 'e0000000-0000-0000-0000-00000000000e') = 0, 'troca de nome não é permissão');
select pg_temp.ok((select detalhes ->> 'ativo_depois' from public.access_logs where acao = 'permissao_alterada' and entidade_id = 'b0000000-0000-0000-0000-00000000000b') = 'false', 'desativação registrada');
select pg_temp.ok((select count(*) from public.access_logs where detalhes::text ~* 'Nova|aluguel|luz|@') = 0, 'LOG-04: sem dado pessoal nos detalhes');
