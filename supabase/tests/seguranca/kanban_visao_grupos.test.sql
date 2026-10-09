-- Testes da visão do quadro (negócio, pessoal, ambos) e dos grupos de quadros. Rodar com run.sh.
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
-- As sessões destes testes já concluíram o MFA (aal2); as regras de aal1 estão em login_mfa.test.sql.
select set_config('request.jwt.claims', '{"aal": "aal2"}', false);
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@ex.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p1@ex.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'p2@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Pro Um', 'professional', true),
  ('cc000000-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-000000000003', 'Pro Dois', 'professional', true);

set role authenticated;
-- 1) Base: negócio padrão (admin) e pessoal da P1
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select public.kanban_garantir_padrao();
select id as negocio from public.kanban_quadros where escopo = 'negocio' \gset
select id as col_neg from public.kanban_colunas where quadro_id = :'negocio' and posicao = 1 \gset
insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('Tarefa da admin', 'aa000000-0000-0000-0000-0000000000a1', :'col_neg');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select public.kanban_criar_quadro('Rotina', '[{"nome":"A fazer"},{"nome":"Feito"}]', 'pessoal') as pessoal \gset
select id as col_pes from public.kanban_colunas where quadro_id = :'pessoal' and posicao = 1 \gset
insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('Tarefa da P1', 'bb000000-0000-0000-0000-0000000000b1', :'col_pes');

-- 2) Regras de quem muda a visão
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.espera_erro(format($$select public.kanban_definir_visao(%L, 'ambos')$$, :'pessoal'), 'dono do quadro');
select pg_temp.espera_erro(format($$select public.kanban_definir_visao(%L, 'ambos')$$, :'negocio'), 'dono do quadro');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.espera_erro(format($$select public.kanban_definir_visao(%L, 'negocio')$$, :'pessoal'), 'administradora');
select pg_temp.espera_erro(format($$select public.kanban_definir_visao(%L, 'tudo')$$, :'pessoal'), 'inválida');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.espera_erro(format($$select public.kanban_definir_visao(%L, 'pessoal')$$, :'negocio'), 'único quadro do negócio');

-- 3) Pessoal -> ambos: aparece nas duas visões; o mesmo quadro (alteração vale nas duas)
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select public.kanban_compartilhar(:'pessoal', 'negocio', null, 'ver');
select pg_temp.espera_erro(format($$select public.kanban_definir_visao(%L, 'ambos')$$, :'pessoal'), 'Remova o compartilhamento');
delete from public.kanban_compartilhamentos where quadro_id = :'pessoal' and destino = 'negocio';
select public.kanban_definir_visao(:'pessoal', 'ambos');
select pg_temp.ok((select escopo = 'negocio' and dono_id = 'bb000000-0000-0000-0000-0000000000b1' from public.kanban_quadros where id = :'pessoal'), 'ambos: negócio com dono');
select pg_temp.ok((select no_negocio and no_pessoal and gerencia and permissao = 'editar' from public.kanban_quadros_visiveis() where id = :'pessoal'), 'dono vê nas duas visões e gerencia');
select pg_temp.ok((select count(*) from public.internal_tasks where coluna_id = :'col_pes') = 1, 'dono segue vendo todas as tarefas');
select public.kanban_salvar_quadro(:'pessoal', 'Rotina da casa', (select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by posicao) from public.kanban_colunas where quadro_id = :'pessoal'));
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select nome = 'Rotina da casa' and no_negocio and not no_pessoal and not gerencia from public.kanban_quadros_visiveis() where id = :'pessoal'), 'equipe vê o mesmo quadro (com a alteração) só no negócio');
select pg_temp.ok((select count(*) from public.internal_tasks where coluna_id = :'col_pes') = 0, 'equipe segue a regra do negócio (só as próprias tarefas)');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select gerencia and not no_pessoal from public.kanban_quadros_visiveis() where id = :'pessoal'), 'administradora gerencia no negócio, sem aparecer no pessoal dela');

-- 4) Negócio -> ambos pela administradora; volta para só negócio
select public.kanban_definir_visao(:'negocio', 'ambos');
select pg_temp.ok((select no_pessoal and no_negocio from public.kanban_quadros_visiveis() where id = :'negocio'), 'negócio também no pessoal da administradora');
select public.kanban_definir_visao(:'negocio', 'negocio');
select pg_temp.ok((select dono_id is null from public.kanban_quadros where id = :'negocio'), 'só negócio: sem dono');

-- 5) Ambos -> pessoal: some do negócio
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select public.kanban_definir_visao(:'pessoal', 'pessoal');
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select count(*) from public.kanban_quadros where id = :'pessoal') = 0, 'de volta ao pessoal: equipe não vê');

-- 6) Grupos: pessoais, um grupo por quadro, grupo da mesma pessoa
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.kanban_grupos (nome) values ('Casa') returning id as g_casa \gset
insert into public.kanban_grupos (nome) values ('Salão') returning id as g_salao \gset
insert into public.kanban_quadro_grupo (quadro_id, grupo_id) values (:'pessoal', :'g_casa');
select pg_temp.espera_erro(format($$insert into public.kanban_quadro_grupo (quadro_id, grupo_id) values (%L, %L)$$, :'pessoal', :'g_salao'), 'duplicate key');
insert into public.kanban_quadro_grupo (quadro_id, grupo_id) values (:'pessoal', :'g_salao')
  on conflict (user_id, quadro_id) do update set grupo_id = excluded.grupo_id;
select pg_temp.ok((select grupo_id = :'g_salao' from public.kanban_quadro_grupo where quadro_id = :'pessoal'), 'mover de grupo');
update public.kanban_grupos set nome = 'Salão e casa' where id = :'g_salao';
select pg_temp.ok((select count(*) from public.kanban_grupos where nome = 'Salão e casa') = 1, 'renomear grupo');
select pg_temp.espera_erro($$insert into public.kanban_grupos (nome) values ('   ')$$, 'check');

select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select count(*) from public.kanban_grupos) = 0, 'outra pessoa não vê os grupos');
select pg_temp.espera_erro(format($$insert into public.kanban_quadro_grupo (quadro_id, grupo_id) values (%L, %L)$$, :'negocio', :'g_casa'), 'violates');
select pg_temp.espera_erro(format($$insert into public.kanban_grupos (user_id, nome) values (%L, 'Invasão')$$, 'bb000000-0000-0000-0000-0000000000b1'), 'row-level security');
insert into public.kanban_grupos (nome) values ('Meu') returning id as g_c \gset
select pg_temp.espera_erro(format($$insert into public.kanban_quadro_grupo (quadro_id, grupo_id) values (%L, %L)$$, :'pessoal', :'g_c'), 'row-level security');
update public.kanban_grupos set nome = 'X' where id = :'g_casa';
delete from public.kanban_grupos where id = :'g_salao';
reset role;
select pg_temp.ok((select count(*) from public.kanban_grupos where user_id = 'bb000000-0000-0000-0000-0000000000b1' and nome in ('Casa', 'Salão e casa')) = 2, 'outra pessoa não altera nem exclui grupos alheios');
set role authenticated;

select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
delete from public.kanban_grupos where id = :'g_salao';
select pg_temp.ok((select count(*) from public.kanban_quadro_grupo where quadro_id = :'pessoal') = 0, 'excluir grupo tira os quadros do grupo');
select pg_temp.ok((select count(*) from public.kanban_quadros where id = :'pessoal') = 1, 'e não apaga o quadro');
reset role;
set role anon;
select pg_temp.espera_erro($$select * from public.kanban_grupos$$, 'permission denied');
reset role;
\echo 'Testes da visão e dos grupos do Kanban: OK'
