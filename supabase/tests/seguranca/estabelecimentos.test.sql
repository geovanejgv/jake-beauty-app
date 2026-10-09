-- Vários estabelecimentos e administração global: isolamento, limites, painel com MFA
-- no banco e trava da demonstração vencida. Rodar com run.sh.
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
-- Sessão com o nível de autenticação (aal1 = só o login; aal2 = código do autenticador
-- confirmado agora, registrado na claim "amr").
create or replace function pg_temp.como(p_sub text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_sub, false),
         set_config('request.jwt.claims', json_build_object('sub', p_sub, 'aal', p_aal,
           'amr', case when p_aal = 'aal2' then json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)) end)::text, false);
$$;
create or replace function pg_temp.sem_sessao() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false);
$$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- A = Studio Labeli (já existe, premium). Admin de A também é administradora global.
insert into auth.users values
  ('a1000000-0000-0000-0000-000000000001', 'admin-a@ex.com'),
  ('a2000000-0000-0000-0000-000000000002', 'pro-a@ex.com'),
  ('b1000000-0000-0000-0000-000000000001', 'admin-b@ex.com'),
  ('b2000000-0000-0000-0000-000000000002', 'pro-b@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000001', 'Admin A', 'admin', true),
  ('aa000000-0000-0000-0000-0000000000a2', 'a2000000-0000-0000-0000-000000000002', 'Pro A', 'professional', true);
insert into public.administradores_globais (user_id) values ('a1000000-0000-0000-0000-000000000001');

-- 1) Painel global: lista só com MFA concluído (aal2), conferido no banco
set role authenticated;
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.ok(public.eh_admin_global_cadastrado(), 'cadastrada aparece para o menu');
select pg_temp.ok(not public.eh_admin_global(), 'sem MFA não é admin global para o banco');
select pg_temp.espera_erro($$select * from public.admin_global_estabelecimentos()$$, 'so_admin_global');
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal2');
select pg_temp.ok((select count(*) = 1 and bool_and(proprio) from public.admin_global_estabelecimentos()), 'com aal2 o painel lista (o próprio marcado)');
select pg_temp.espera_erro($$select * from public.administradores_globais$$, 'permission denied');
select pg_temp.espera_erro(
  $$select public.estabelecimento_criar('X', 'premium', null, null, 'Y', 'b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001')$$,
  'permission denied');
select pg_temp.como('a2000000-0000-0000-0000-000000000002', 'aal2');
select pg_temp.ok(not public.eh_admin_global_cadastrado(), 'profissional comum não está na lista');
select pg_temp.espera_erro($$select * from public.admin_global_estabelecimentos()$$, 'so_admin_global');

-- 2) Criação (servidor, com a conta de login já criada pelo convite)
reset role;
select pg_temp.sem_sessao();
select estabelecimento_id as est_b, administradora_id as adm_b
  from public.estabelecimento_criar('Salão B', 'demonstracao', 1, 2, 'Admin B',
       'b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001') \gset
select pg_temp.ok((select plano = 'demonstracao' and demo_expira_em > now() + interval '29 days' and status = 'ativo'
                     from public.estabelecimentos where id = :'est_b'), 'demonstração de 30 dias');
select pg_temp.ok((select count(*) from public.taxas_pagamento where estabelecimento_id = :'est_b') = 6, 'taxas padrão');
select pg_temp.ok((select count(*) from public.categorias_servico where estabelecimento_id = :'est_b' and nome = 'Cabelo') = 1,
                  'categoria com o mesmo nome de outro estabelecimento');
select pg_temp.espera_erro(format($$select public.estabelecimento_criar('C', 'premium', null, null, 'Z', %L, %L)$$,
  'b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'), 'conta_ja_vinculada');
select pg_temp.espera_erro(format($$select public.estabelecimento_criar('C', 'premium', null, null, 'Z', %L, %L)$$,
  'b2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002'), 'so_admin_global');
select pg_temp.ok((select count(*) from public.access_logs where entidade = 'estabelecimentos' and acao = 'estabelecimento_criado') = 1,
                  'criação na trilha');

-- Dados de A para tentar alcançar a partir de B
select pg_temp.como('a1000000-0000-0000-0000-000000000001');
set role authenticated;
select public.kanban_garantir_padrao();
select id as quadro_a from public.kanban_quadros where escopo = 'negocio' \gset
reset role;

-- 3) Isolamento: B não vê nem alcança nada de A
set role authenticated;
select pg_temp.como('b1000000-0000-0000-0000-000000000001');
select pg_temp.ok(public.usuario_admin(), 'administradora de B ativa');
select pg_temp.ok((select count(*) from public.clients) = 0, 'B não vê clientes de A');
select pg_temp.ok((select count(*) from public.clientes_visiveis) = 0, 'nem pela visão de clientes');
select pg_temp.ok((select count(*) from public.users) = 1, 'B só vê a própria equipe');
select pg_temp.ok((select count(*) from public.categorias_servico) = 7, 'B vê só as próprias categorias');
select pg_temp.ok((select count(*) from public.pacote_saldos()) = 0, 'pacotes de A não aparecem');
select pg_temp.ok(public.kanban_permissao(:'quadro_a') is null, 'quadro de A sem permissão para B');
select pg_temp.ok(not public.kanban_gerencia(:'quadro_a'), 'nem gerência');
select public.kanban_garantir_padrao();
select pg_temp.ok((select count(*) from public.kanban_quadros_visiveis()) = 1, 'B ganha o próprio quadro padrão e só vê ele');
select id as quadro_b from public.kanban_quadros where escopo = 'negocio' \gset
select id as col_b from public.kanban_colunas where quadro_id = :'quadro_b' and posicao = 1 \gset
select pg_temp.espera_erro(format($$select public.kanban_compartilhar(%L, 'pessoa', %L, 'ver')$$, :'quadro_a', 'aa000000-0000-0000-0000-0000000000a2'), 'dono do quadro');
select pg_temp.espera_erro(format(
  $$insert into public.internal_tasks (titulo, responsible_id, coluna_id, client_id) values ('X', %L, %L, 'c0000000-0000-0000-0000-000000000001')$$,
  :'adm_b', :'col_b'), 'referencia_de_outro_estabelecimento');
select pg_temp.espera_erro(format(
  $$insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('X', %L, %L)$$,
  'aa000000-0000-0000-0000-0000000000a2', :'col_b'), 'referencia_de_outro_estabelecimento');
update public.clients set name = 'Invadida' where id = 'c0000000-0000-0000-0000-000000000001';
select public.cadastrar_cliente_rapido('Cliente B', '11999990000') as cli_b \gset
reset role;
select pg_temp.ok((select name = 'Carla' and estabelecimento_id = '5a1ab0e1-0000-4000-8000-000000000001'
                     from public.clients where id = 'c0000000-0000-0000-0000-000000000001'), 'cliente de A intacta');
select pg_temp.ok((select estabelecimento_id = :'est_b' from public.clients where id = :'cli_b'), 'cliente nova nasce em B');
set role authenticated;
select pg_temp.como('a1000000-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) from public.clients where id = :'cli_b') = 0, 'A não vê a cliente de B');
select pg_temp.ok((select count(*) from public.kanban_quadros_visiveis()) = 1, 'A segue vendo só o próprio quadro');
-- Mesmo com o id em mãos, gravar no registro de B por função security definer é barrado.
select pg_temp.espera_erro(format($$select public.kanban_salvar_quadro(%L, 'X', '[]')$$, :'quadro_b'), 'sem permissão');
reset role;

-- 4) Limites do plano (gatilho; vale também sem sessão / service role)
set role authenticated;
select pg_temp.como('b1000000-0000-0000-0000-000000000001', 'aal2');
insert into public.users (auth_id, name, role, active) values ('b2000000-0000-0000-0000-000000000002', 'Pro B', 'professional', true);
select pg_temp.espera_erro($$insert into public.users (name, role, active) values ('Pro B2', 'professional', true)$$, 'limite_plano_profissional');
select public.cadastrar_cliente_rapido('Cliente B2', '11999990001');
select pg_temp.espera_erro($$select public.cadastrar_cliente_rapido('Cliente B3', '11999990002')$$, 'limite_plano_cliente');
reset role;
select pg_temp.sem_sessao();
select pg_temp.espera_erro(format($$insert into public.users (estabelecimento_id, name, role, active) values (%L, 'Pro B3', 'professional', true)$$, :'est_b'),
  'limite_plano_profissional');
-- Última administradora: por estabelecimento (A ter outra não libera a de B).
select pg_temp.espera_erro(format($$update public.users set active = false where id = %L$$, :'adm_b'), 'administradora ativa');

-- 5) Demonstração vencida: módulos pagos só leem; telas liberadas e servidor gravam
update public.estabelecimentos set demo_expira_em = now() - interval '1 day' where id = :'est_b';
set role authenticated;
select pg_temp.como('b1000000-0000-0000-0000-000000000001');
select pg_temp.espera_erro($$select public.kanban_criar_quadro('Novo', '[{"nome":"A"},{"nome":"B"}]', 'negocio')$$, 'plano_demonstracao_encerrada');
select pg_temp.espera_erro(format($$insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('X', %L, %L)$$, :'adm_b', :'col_b'),
  'plano_demonstracao_encerrada');
select pg_temp.espera_erro(format($$select public.kanban_salvar_quadro(%L, 'Y', (select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by posicao) from public.kanban_colunas where quadro_id = %L))$$,
  :'quadro_b', :'quadro_b'), 'plano_demonstracao_encerrada');
select pg_temp.ok((select count(*) from public.kanban_quadros) = 1, 'leitura continua');
update public.clients set name = 'Cliente B editada' where id = :'cli_b';
select pg_temp.ok((select name = 'Cliente B editada' from public.clients where id = :'cli_b'), 'clientes (tela liberada) gravam');
reset role;
select pg_temp.sem_sessao();
insert into public.kanban_quadros (estabelecimento_id, nome) values (:'est_b', 'Criado pelo servidor');
select pg_temp.ok(true, 'rotina do servidor grava');
update public.estabelecimentos set demo_expira_em = now() + interval '10 days' where id = :'est_b';

-- 6) Plano Básico: Kanban sem compartilhar
update public.estabelecimentos set plano = 'basico', demo_expira_em = null where id = :'est_b';
set role authenticated;
select pg_temp.como('b1000000-0000-0000-0000-000000000001');
select pg_temp.espera_erro(format($$select public.kanban_compartilhar(%L, 'pessoa', (select id from public.users where name = 'Pro B'), 'ver')$$, :'quadro_b'),
  'plano_sem_compartilhamento');

-- 7) Desativar / excluir / reativar (só admin global com MFA; nunca o próprio)
select pg_temp.como('b1000000-0000-0000-0000-000000000001', 'aal2');
select pg_temp.espera_erro(format($$select public.admin_global_atualizar_estabelecimento(%L, 'Salão B', 'basico', 'ativo', null, 5, 5)$$, :'est_b'), 'so_admin_global');
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.espera_erro(format($$select public.admin_global_atualizar_estabelecimento(%L, 'Salão B', 'basico', 'desativado', null, 1, 2)$$, :'est_b'), 'so_admin_global');
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal2');
select pg_temp.espera_erro($$select public.admin_global_atualizar_estabelecimento('5a1ab0e1-0000-4000-8000-000000000001', 'Studio Labeli', 'premium', 'desativado', null, null, null)$$,
  'nao_desativa_o_proprio');
select pg_temp.espera_erro($$select public.admin_global_atualizar_estabelecimento('5a1ab0e1-0000-4000-8000-000000000001', 'Studio Labeli', 'premium', 'excluido', null, null, null)$$,
  'nao_desativa_o_proprio');
select pg_temp.espera_erro($$select public.admin_global_atualizar_estabelecimento(gen_random_uuid(), 'X', 'premium', 'ativo', null, null, null)$$,
  'estabelecimento_nao_encontrado');
select public.admin_global_atualizar_estabelecimento(:'est_b', 'Salão B', 'basico', 'desativado', null, 1, 2);
select pg_temp.como('b1000000-0000-0000-0000-000000000001');
select pg_temp.ok(not public.usuario_ativo(), 'desativado: sessão sem acesso');
select pg_temp.ok((select count(*) from public.clients) = 0 and (select count(*) from public.users) = 0, 'desativado: RLS não mostra nada');
select pg_temp.ok((select status = 'desativado' from public.minha_situacao_estabelecimento()), 'mas sabe o motivo');
select pg_temp.espera_erro($$select public.kanban_usuario_atual()$$, 'Acesso ainda não liberado');
select pg_temp.como('a1000000-0000-0000-0000-000000000001', 'aal2');
select public.admin_global_atualizar_estabelecimento(:'est_b', 'Salão B', 'basico', 'excluido', null, 1, 2);
select pg_temp.ok((select status = 'excluido' and excluido_em is not null and administradoras = 1
                     from public.admin_global_estabelecimentos() where id = :'est_b'), 'exclusão lógica: dados guardados');
select public.admin_global_atualizar_estabelecimento(:'est_b', 'Salão B', 'premium', 'ativo', null, null, null);
select pg_temp.como('b1000000-0000-0000-0000-000000000001');
select pg_temp.ok(public.usuario_ativo() and (select count(*) from public.clients) = 2, 'reativado: acesso e dados de volta');
reset role;
select pg_temp.ok((select count(*) from public.access_logs where entidade = 'estabelecimentos' and acao in ('alterou', 'excluiu')) >= 3,
                  'alterações do painel na trilha');

-- 8) Funções internas sem execução pela API; tabela de admins sem política
select pg_temp.ok(not has_function_privilege('authenticated', 'public.plano_liberado()', 'execute'), 'plano_liberado interna');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.plano_trava_demonstracao()', 'execute'), 'trava interna');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.estabelecimento_guarda()', 'execute'), 'guarda interna');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.limite_do_estabelecimento(uuid, text)', 'execute'), 'limite interno');
select pg_temp.ok(not has_function_privilege('anon', 'public.minha_situacao_estabelecimento()', 'execute'), 'visitante sem situação');
select pg_temp.ok((select count(*) from pg_policies where tablename = 'administradores_globais') = 0, 'administradores_globais sem política');
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.administradores_globais'::regclass), 'com RLS ligado');
\echo 'Testes de estabelecimentos e administração global: OK'
