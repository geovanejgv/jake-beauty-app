-- Login pelo Google e MFA no banco: sessão aal1 com autenticador ativo não vê nada,
-- permissões exigem aal2, código recente para excluir estabelecimento e auditoria.
-- Rodar com run.sh.
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
create or replace function pg_temp.como(p_sub text, p_aal text default 'aal1', p_amr jsonb default null) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_sub, false),
         set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object('sub', p_sub, 'aal', p_aal, 'amr', p_amr))::text, false);
$$;
create or replace function pg_temp.sem_sessao() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false);
$$;
create or replace function pg_temp.totp_ha(p_segundos integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', extract(epoch from now())::bigint - 3600),
                           jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - p_segundos));
$$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- Studio Labeli: admin com autenticador (a1), profissional sem (a2), admin sem autenticador (a3).
insert into auth.users values
  ('a1000000-0000-0000-0000-000000000001', 'admin-a@ex.com'),
  ('a2000000-0000-0000-0000-000000000002', 'pro-a@ex.com'),
  ('a3000000-0000-0000-0000-000000000003', 'admin2-a@ex.com'),
  ('b1000000-0000-0000-0000-000000000001', 'admin-b@ex.com');
insert into auth.mfa_factors (user_id, status) values
  ('a1000000-0000-0000-0000-000000000001', 'verified'),
  ('a2000000-0000-0000-0000-000000000002', 'unverified');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000001', 'Admin A', 'admin', true),
  ('aa000000-0000-0000-0000-0000000000a2', 'a2000000-0000-0000-0000-000000000002', 'Pro A', 'professional', true),
  ('aa000000-0000-0000-0000-0000000000a3', 'a3000000-0000-0000-0000-000000000003', 'Admin A2', 'admin', true);
insert into public.administradores_globais (user_id) values ('a1000000-0000-0000-0000-000000000001');

-- 1) Autenticador ativo e sessão aal1: nada do estabelecimento aparece (M-06)
set role authenticated;
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.ok(public.mfa_pendente(), 'com autenticador e aal1 o MFA está pendente');
select pg_temp.ok(not public.usuario_ativo() and not public.usuario_admin(), 'MFA pendente: sem acesso');
select pg_temp.ok(public.estabelecimento_atual() is null and public.usuario_atual_id() is null, 'MFA pendente: sem estabelecimento');
select pg_temp.ok((select count(*) from public.clients) = 0, 'MFA pendente: nenhuma cliente pela API REST');
select pg_temp.ok((select count(*) from public.users) = 0, 'MFA pendente: nenhum perfil');

-- 2) Mesmo usuário depois do código (aal2): acesso normal
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal2');
select pg_temp.ok(not public.mfa_pendente() and public.usuario_admin(), 'com aal2 a administradora entra');
select pg_temp.ok((select count(*) from public.clients) >= 1, 'com aal2 as clientes aparecem');

-- 3) Sem autenticador confirmado (cadastro não concluído conta como sem): aal1 basta
select pg_temp.como('a2000000-0000-0000-0000-000000000002', 'aal1');
select pg_temp.ok(not public.mfa_pendente() and public.usuario_ativo(), 'sem autenticador confirmado, aal1 entra');

-- 4) Permissões da equipe exigem aal2 (M-01)
select pg_temp.como('a3000000-0000-0000-0000-000000000003', 'aal1');
select pg_temp.ok(public.usuario_admin(), 'administradora sem autenticador usa o sistema em aal1');
select pg_temp.espera_erro($$update public.users set role = 'admin' where id = 'aa000000-0000-0000-0000-0000000000a2'$$, 'mfa_requerido');
select pg_temp.espera_erro($$update public.users set active = false where id = 'aa000000-0000-0000-0000-0000000000a2'$$, 'mfa_requerido');
select pg_temp.espera_erro($$insert into public.users (name, role) values ('Nova admin', 'admin')$$, 'mfa_requerido');
update public.users set name = 'Pro A.' where id = 'aa000000-0000-0000-0000-0000000000a2';
select pg_temp.ok((select name = 'Pro A.' from public.users where id = 'aa000000-0000-0000-0000-0000000000a2'), 'trocar nome não exige MFA');
insert into public.users (name, role) values ('Pro sem login', 'professional');
select pg_temp.ok((select count(*) = 1 from public.users where name = 'Pro sem login'), 'cadastrar profissional sem login não exige MFA');
select pg_temp.como('a3000000-0000-0000-0000-000000000003', 'aal2');
update public.users set active = false where id = 'aa000000-0000-0000-0000-0000000000a2';
update public.users set active = true where id = 'aa000000-0000-0000-0000-0000000000a2';
select pg_temp.ok(true, 'com aal2 a administradora altera o status');

-- 5) Auditoria de MFA (A-01): com MFA pendente o evento fica no estabelecimento da pessoa
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal1');
select public.registrar_auditoria('mfa_falhou', null);
select pg_temp.espera_erro($$select public.registrar_auditoria('senha_trocada', null)$$, 'Evento de auditoria inválido');
reset role;
select pg_temp.ok((select estabelecimento_id = '5a1ab0e1-0000-4000-8000-000000000001' from public.access_logs where acao = 'mfa_falhou'),
  'mfa_falhou gravado no estabelecimento da pessoa');

-- 6) Logs só com aal2 (M-01)
set role authenticated;
select pg_temp.como('a3000000-0000-0000-0000-000000000003', 'aal1');
select pg_temp.ok((select count(*) from public.access_logs) = 0, 'logs não aparecem em aal1');
select pg_temp.como('a3000000-0000-0000-0000-000000000003', 'aal2');
select pg_temp.ok((select count(*) from public.access_logs) >= 1, 'logs aparecem em aal2');
select pg_temp.como('a2000000-0000-0000-0000-000000000002', 'aal2');
select pg_temp.ok((select count(*) from public.access_logs) = 0, 'profissional não vê logs');

-- 7) Código recente (claim amr), para ação crítica (M-04)
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal2', pg_temp.totp_ha(10));
select pg_temp.ok(public.mfa_recente(300), 'código de 10 s atrás vale');
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal2', pg_temp.totp_ha(1000));
select pg_temp.ok(not public.mfa_recente(300), 'código de 1000 s atrás não vale');
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal1', pg_temp.totp_ha(10));
select pg_temp.ok(not public.mfa_recente(300), 'aal1 nunca vale');
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal2', '[{"method":"totp","timestamp":"1e99"}]'::jsonb);
select pg_temp.ok(not public.mfa_recente(300), 'horário fora do padrão não vale');
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal2', '{"method":"totp"}'::jsonb);
select pg_temp.ok(not public.mfa_recente(300), 'amr que não é lista não vale');

-- 8) Excluir estabelecimento pede o código na hora; desativar não
reset role;
select pg_temp.sem_sessao();
select estabelecimento_id as est_b
  from public.estabelecimento_criar('Salão B', 'premium', null, null, 'Admin B',
       'b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001') \gset
set role authenticated;
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal2', pg_temp.totp_ha(1000));
select pg_temp.espera_erro(format($$select public.admin_global_atualizar_estabelecimento(%L, 'Salão B', 'premium', 'excluido', null, null, null)$$, :'est_b'), 'mfa_codigo_requerido');
select public.admin_global_atualizar_estabelecimento(:'est_b', 'Salão B', 'premium', 'desativado', null, null, null);
select pg_temp.ok(true, 'desativar não pede código novo');
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal2', pg_temp.totp_ha(20));
select public.admin_global_atualizar_estabelecimento(:'est_b', 'Salão B', 'premium', 'excluido', null, null, null);
reset role;
select pg_temp.ok((select status = 'excluido' from public.estabelecimentos where id = :'est_b'), 'com código recente exclui');

-- 9) Funções novas não abrem para anon
set role anon;
select pg_temp.espera_erro($$select public.mfa_pendente()$$, 'permission denied');
select pg_temp.espera_erro($$select public.mfa_recente(300)$$, 'permission denied');
reset role;
select 'login_mfa: OK';
