-- Testes da integração com IA (user_ai_settings, ai_generations, ai_usage_logs). Rodar com run.sh.
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
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@ex.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p1@ex.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'b@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Pro Um', 'professional', true);

-- Outro estabelecimento com uma administradora, um lead e uma configuração próprios (montagem sem sessão).
insert into public.estabelecimentos (id, nome, plano) values ('5a1ab0e1-0000-4000-8000-0000000000b2', 'Salão B', 'premium');
insert into public.users (id, auth_id, name, role, active, estabelecimento_id) values
  ('cc000000-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-000000000003', 'Admin B', 'admin', true, '5a1ab0e1-0000-4000-8000-0000000000b2');
insert into public.leads (id, nome, estabelecimento_id) values ('1b000000-0000-0000-0000-0000000000b2', 'Lead do Salão B', '5a1ab0e1-0000-4000-8000-0000000000b2');
insert into public.leads (id, nome) values ('1a000000-0000-0000-0000-0000000000a1', 'Lead do Salão A');
insert into public.user_ai_settings (user_id, provider, api_key_encrypted, model_preference, is_active, consentimento_em, estabelecimento_id)
  values ('cc000000-0000-0000-0000-0000000000c1', 'openai', 'v1.aaaa.bbbb.cccc', 'gpt-6-luna', true, now(), '5a1ab0e1-0000-4000-8000-0000000000b2');

set role authenticated;

-- 1) Configuração: a própria pessoa grava; o banco fixa o dono; formato cifrado obrigatório
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.user_ai_settings (provider, api_key_encrypted, model_preference, is_active, consentimento_em)
  values ('anthropic', 'v1.aXY.dGFn.Y2lmcmE', 'claude-haiku-5-5', true, now());
select pg_temp.ok((select user_id = 'aa000000-0000-0000-0000-0000000000a1' and estabelecimento_id = '5a1ab0e1-0000-4000-8000-000000000001'
                     from public.user_ai_settings where provider = 'anthropic'), 'dono e estabelecimento vêm da sessão');
select pg_temp.espera_erro($$insert into public.user_ai_settings (provider, api_key_encrypted, model_preference, consentimento_em) values ('google', 'sk-ant-texto-puro-123456789', 'gemini-3.8-flash', now())$$, 'api_key_encrypted_check');
select pg_temp.espera_erro($$insert into public.user_ai_settings (provider, api_key_encrypted, model_preference, consentimento_em) values ('mistral', 'v1.a.b.c', 'x', now())$$, 'provider_check');
select pg_temp.espera_erro($$insert into public.user_ai_settings (provider, api_key_encrypted, model_preference, consentimento_em) values ('google', 'v1.a.b.c', 'modelo com espaço', now())$$, 'model_preference_check');
select pg_temp.espera_erro($$insert into public.user_ai_settings (provider, api_key_encrypted, model_preference, is_active, consentimento_em) values ('openai', 'v1.a.b.c', 'gpt-6-luna', true, now())$$, 'user_ai_settings_uma_ativa');
select pg_temp.espera_erro($$insert into public.user_ai_settings (provider, api_key_encrypted, model_preference, consentimento_em, user_id) values ('google', 'v1.a.b.c', 'gemini-3.8-flash', now(), 'cc000000-0000-0000-0000-0000000000c1')$$, 'referencia_de_outro_estabelecimento');
select pg_temp.espera_erro($$insert into public.user_ai_settings (provider, api_key_encrypted, model_preference, consentimento_em, estabelecimento_id) values ('google', 'v1.a.b.c', 'gemini-3.8-flash', now(), '5a1ab0e1-0000-4000-8000-0000000000b2')$$, 'outro_estabelecimento');

-- 2) O navegador nunca lê a chave cifrada (privilégio por coluna)
select pg_temp.espera_erro($$select api_key_encrypted from public.user_ai_settings$$, 'permission denied');
select pg_temp.ok((select count(*) = 1 from public.user_ai_settings), 'administradora vê só a própria configuração (nem a do Salão B)');
update public.user_ai_settings set provider = 'google', consentimento_em = now() - interval '1 year', status_chave = 'invalida' where provider = 'anthropic';
select pg_temp.ok((select provider = 'anthropic' and consentimento_em > now() - interval '1 day' and status_chave = 'invalida'
                     from public.user_ai_settings), 'provedor e consentimento não mudam; status muda');

-- 3) Profissional não vê nem mexe na configuração da administradora; a dela nasce dela
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) = 0 from public.user_ai_settings), 'profissional não vê a configuração alheia');
update public.user_ai_settings set is_active = false;
delete from public.user_ai_settings;
insert into public.user_ai_settings (provider, api_key_encrypted, model_preference, consentimento_em, user_id)
  values ('google', 'v1.a.b.c', 'gemini-3.8-flash', now(), 'aa000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = 'bb000000-0000-0000-0000-0000000000b1') from public.user_ai_settings), 'user_id do corpo é ignorado (AUZ-06)');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select is_active from public.user_ai_settings where provider = 'anthropic'), 'profissional não altera nem exclui a configuração alheia');

-- 4) Resultados: o navegador não inclui; só o texto revisado e a marca de revisão são editáveis
select pg_temp.espera_erro($$insert into public.ai_generations (estabelecimento_id, user_id, funcionalidade, provider, modelo, conteudo) values ('5a1ab0e1-0000-4000-8000-000000000001', 'aa000000-0000-0000-0000-0000000000a1', 'triagem_lead', 'anthropic', 'claude-haiku-5-5', '{}')$$, 'permission denied');
reset role;
set role service_role;
insert into public.ai_generations (id, estabelecimento_id, user_id, funcionalidade, provider, modelo, lead_id, conteudo)
  values ('9e000000-0000-0000-0000-000000000001', '5a1ab0e1-0000-4000-8000-000000000001', 'aa000000-0000-0000-0000-0000000000a1', 'triagem_lead', 'anthropic', 'claude-haiku-5-5', '1a000000-0000-0000-0000-0000000000a1', '{"resumo":"x"}');
select pg_temp.espera_erro($$insert into public.ai_generations (estabelecimento_id, user_id, funcionalidade, provider, modelo, lead_id, conteudo) values ('5a1ab0e1-0000-4000-8000-000000000001', 'aa000000-0000-0000-0000-0000000000a1', 'triagem_lead', 'anthropic', 'm', '1b000000-0000-0000-0000-0000000000b2', '{}')$$, 'referencia_de_outro_estabelecimento');
select pg_temp.espera_erro($$insert into public.ai_generations (estabelecimento_id, user_id, funcionalidade, provider, modelo, conteudo) values ('5a1ab0e1-0000-4000-8000-000000000001', 'aa000000-0000-0000-0000-0000000000a1', 'peticao', 'anthropic', 'm', '{}')$$, 'ai_generations_funcionalidade_check');
select pg_temp.espera_erro($$insert into public.ai_generations (estabelecimento_id, user_id, funcionalidade, provider, modelo, conteudo, parametros) values ('5a1ab0e1-0000-4000-8000-000000000001', 'aa000000-0000-0000-0000-0000000000a1', 'triagem_lead', 'anthropic', 'm', '{}', '[]')$$, 'ai_generations_parametros_check');
insert into public.ai_usage_logs (estabelecimento_id, user_id, provider, acao, sucesso, modelo, duracao_ms)
  values ('5a1ab0e1-0000-4000-8000-000000000001', 'aa000000-0000-0000-0000-0000000000a1', 'anthropic', 'triagem_lead', true, 'claude-haiku-5-5', 1200);
select pg_temp.espera_erro($$insert into public.ai_usage_logs (estabelecimento_id, user_id, provider, acao, sucesso) values ('5a1ab0e1-0000-4000-8000-0000000000b2', 'aa000000-0000-0000-0000-0000000000a1', 'anthropic', 'triagem_lead', true)$$, 'outro_estabelecimento');
reset role;
set role authenticated;

select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) = 1 from public.ai_generations), 'autora vê o próprio resultado');
update public.ai_generations set conteudo_editado = 'Texto revisado', revisado_em = now() where id = '9e000000-0000-0000-0000-000000000001';
select pg_temp.ok((select conteudo_editado = 'Texto revisado' and revisado_em is not null from public.ai_generations), 'autora edita e marca como revisado');
select pg_temp.espera_erro($$update public.ai_generations set conteudo = 'forjado' where id = '9e000000-0000-0000-0000-000000000001'$$, 'permission denied');
select pg_temp.espera_erro($$update public.ai_generations set provider = 'openai' where id = '9e000000-0000-0000-0000-000000000001'$$, 'permission denied');

-- 5) Log de uso: autora lê, ninguém inclui, altera nem exclui pela API
select pg_temp.ok((select count(*) = 1 from public.ai_usage_logs), 'autora lê o próprio uso');
select pg_temp.espera_erro($$insert into public.ai_usage_logs (estabelecimento_id, user_id, provider, acao, sucesso) values ('5a1ab0e1-0000-4000-8000-000000000001', 'aa000000-0000-0000-0000-0000000000a1', 'anthropic', 'triagem_lead', true)$$, 'permission denied');
select pg_temp.espera_erro($$update public.ai_usage_logs set sucesso = false$$, 'permission denied');
select pg_temp.espera_erro($$delete from public.ai_usage_logs$$, 'permission denied');

-- 6) Profissional e outro estabelecimento não veem nada
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) = 0 from public.ai_generations), 'profissional não vê resultado alheio');
select pg_temp.ok((select count(*) = 0 from public.ai_usage_logs), 'profissional não vê uso alheio');
update public.ai_generations set conteudo_editado = 'mexido';
delete from public.ai_generations;
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select count(*) = 0 from public.ai_generations) and (select count(*) = 1 from public.user_ai_settings where provider = 'openai'), 'Salão B só vê o que é dele');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select conteudo_editado = 'Texto revisado' from public.ai_generations), 'profissional não altera nem exclui resultado alheio');

-- 7) Exclusões ficam na trilha; "Desativar totalmente" apaga as chaves da pessoa
delete from public.ai_generations where id = '9e000000-0000-0000-0000-000000000001';
delete from public.user_ai_settings;
select pg_temp.ok((select count(*) = 0 from public.user_ai_settings), 'desativar totalmente apaga as chaves');
reset role;
select pg_temp.ok((select count(*) = 1 from public.user_ai_settings where user_id = 'bb000000-0000-0000-0000-0000000000b1'), 'a da profissional continua');
select pg_temp.ok((select count(*) >= 1 from public.access_logs where acao = 'excluiu' and entidade = 'ai_generations' and entidade_id = '9e000000-0000-0000-0000-000000000001'), 'exclusão de resultado auditada');
select pg_temp.ok((select count(*) >= 1 from public.access_logs where acao = 'excluiu' and entidade = 'user_ai_settings'), 'exclusão de chave auditada');
select pg_temp.ok((select count(*) = 0 from public.access_logs where detalhes::text like '%v1.%'), 'trilha sem a chave cifrada');

-- 8) Visitante sem sessão não tem acesso
select pg_temp.ok(not has_table_privilege('anon', 'public.user_ai_settings', 'select'), 'anon sem acesso à configuração');
select pg_temp.ok(not has_table_privilege('anon', 'public.ai_generations', 'select'), 'anon sem acesso aos resultados');
select pg_temp.ok(not has_table_privilege('anon', 'public.ai_usage_logs', 'select'), 'anon sem acesso ao uso');
select pg_temp.ok(not has_column_privilege('authenticated', 'public.user_ai_settings', 'api_key_encrypted', 'select'), 'chave cifrada sem select para o navegador');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.user_ai_settings_regras()', 'execute'), 'função interna sem execução');
select 'ia: OK';
