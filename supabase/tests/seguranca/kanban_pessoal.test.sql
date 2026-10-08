-- Testes do Kanban pessoal e do negócio, com compartilhamento (ver/editar). Rodar com run.sh.
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
  ('cccccccc-0000-0000-0000-000000000003', 'p2@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Pro Um', 'professional', true),
  ('cc000000-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-000000000003', 'Pro Dois', 'professional', true);

set role authenticated;
-- 1) Negócio padrão e quadro pessoal privado
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select public.kanban_garantir_padrao();
select id as negocio from public.kanban_quadros where escopo = 'negocio' \gset
select id as col_neg from public.kanban_colunas where quadro_id = :'negocio' and posicao = 1 \gset
insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('Tarefa da admin', 'aa000000-0000-0000-0000-0000000000a1', :'col_neg');

select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select public.kanban_criar_quadro('Minha vida', '[{"nome":"A fazer"},{"nome":"Feito"}]', 'pessoal') as pessoal \gset
select id as col_pes from public.kanban_colunas where quadro_id = :'pessoal' and posicao = 1 \gset
insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('Pagar conta', 'bb000000-0000-0000-0000-0000000000b1', :'col_pes');
select pg_temp.ok((select escopo = 'pessoal' and dono_id = 'bb000000-0000-0000-0000-0000000000b1' from public.kanban_quadros where id = :'pessoal'), 'quadro pessoal com dono');
select pg_temp.ok((select no_pessoal and not no_negocio and gerencia from public.kanban_quadros_visiveis() where id = :'pessoal'), 'dono vê o pessoal na visão pessoal');

select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) from public.kanban_quadros where id = :'pessoal') = 0, 'administradora não vê pessoal alheio sem compartilhamento');
select pg_temp.ok((select count(*) from public.internal_tasks where titulo = 'Pagar conta') = 0, 'nem as tarefas dele');
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select count(*) from public.kanban_quadros where id = :'pessoal') = 0, 'outra profissional não vê');
select pg_temp.espera_erro(format($$select public.kanban_compartilhar(%L, 'negocio', null, 'ver')$$, :'pessoal'), 'dono do quadro');
select pg_temp.espera_erro(format($$select public.kanban_excluir_quadro(%L)$$, :'pessoal'), 'não encontrado');

-- 2) Pessoal compartilhado com o negócio: somente visualizar
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select public.kanban_compartilhar(:'pessoal', 'negocio', null, 'ver');
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select permissao = 'ver' and no_negocio and not no_pessoal and not gerencia from public.kanban_quadros_visiveis() where id = :'pessoal'), 'equipe vê o pessoal na visão do negócio, só leitura');
select pg_temp.ok((select count(*) from public.internal_tasks where titulo = 'Pagar conta') = 1, 'vê todas as tarefas do quadro compartilhado');
select pg_temp.espera_erro(format($$insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('Intrusa', 'cc000000-0000-0000-0000-0000000000c1', %L)$$, :'col_pes'), 'row-level security');
update public.internal_tasks set titulo = 'Alterada' where titulo = 'Pagar conta';
select pg_temp.ok((select count(*) from public.internal_tasks where titulo = 'Pagar conta') = 1, 'só leitura: edição ignorada');
select pg_temp.espera_erro($$insert into public.tarefa_comentarios (task_id, texto) select id, 'oi' from public.internal_tasks where titulo = 'Pagar conta'$$, 'row-level security');
select pg_temp.espera_erro(format($$select public.kanban_salvar_quadro(%L, 'X', (select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by posicao) from public.kanban_colunas where quadro_id = %L))$$, :'pessoal', :'pessoal'), 'sem permissão');

-- 3) Mudar para editar
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select public.kanban_compartilhar(:'pessoal', 'negocio', null, 'editar');
select pg_temp.ok((select count(*) from public.kanban_compartilhamentos where quadro_id = :'pessoal') = 1, 'mudar a permissão não duplica');
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('Ajuda da colega', 'cc000000-0000-0000-0000-0000000000c1', :'col_pes');
select pg_temp.ok((select count(*) from public.internal_tasks where coluna_id = :'col_pes') = 2, 'com editar, a equipe cria tarefa no quadro compartilhado');

-- 4) Negócio compartilhado com o pessoal de uma profissional, somente visualizar
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select count(*) from public.internal_tasks where titulo = 'Tarefa da admin') = 0, 'sem compartilhamento, vê só as próprias tarefas do negócio');
select pg_temp.espera_erro(format($$select public.kanban_compartilhar(%L, 'pessoa', 'cc000000-0000-0000-0000-0000000000c1', 'ver')$$, :'negocio'), 'dono do quadro');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.espera_erro(format($$select public.kanban_compartilhar(%L, 'negocio', null, 'ver')$$, :'negocio'), 'já é do negócio');
select public.kanban_compartilhar(:'negocio', 'pessoa', 'cc000000-0000-0000-0000-0000000000c1', 'ver') as comp_neg \gset
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select permissao = 'ver' and no_pessoal and no_negocio from public.kanban_quadros_visiveis() where id = :'negocio'), 'negócio aparece no pessoal dela, só leitura');
select pg_temp.ok((select count(*) from public.internal_tasks where titulo = 'Tarefa da admin') = 1, 'compartilhado: vê todas as tarefas');
select pg_temp.espera_erro(format($$insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('X', 'cc000000-0000-0000-0000-0000000000c1', %L)$$, :'col_neg'), 'row-level security');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('Tarefa da P1 no negócio', 'bb000000-0000-0000-0000-0000000000b1', :'col_neg');
select pg_temp.ok(true, 'quem não recebeu restrição continua editando o negócio');

-- 5) Remover compartilhamento e excluir
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
delete from public.kanban_compartilhamentos where id = :'comp_neg';
reset role;
select pg_temp.ok((select count(*) from public.kanban_compartilhamentos where id = :'comp_neg') = 1, 'quem recebeu não remove o compartilhamento');
set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
delete from public.kanban_compartilhamentos where id = :'comp_neg';
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select count(*) from public.internal_tasks where titulo = 'Tarefa da admin') = 0, 'sem o compartilhamento, volta a ver só as próprias');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.espera_erro(format($$select public.kanban_excluir_quadro(%L)$$, :'negocio'), 'único quadro do negócio');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select public.kanban_excluir_quadro(:'pessoal');
select pg_temp.ok((select count(*) from public.kanban_quadros where id = :'pessoal') = 0, 'dono exclui o próprio pessoal');
reset role;
select pg_temp.ok((select count(*) from public.kanban_compartilhamentos where quadro_id = :'pessoal') = 0, 'compartilhamentos saem junto');
select pg_temp.ok((select count(*) from public.access_logs where entidade = 'kanban_compartilhamentos') >= 2, 'mudança e remoção de compartilhamento na trilha');
set role anon;
select pg_temp.espera_erro($$select * from public.kanban_quadros_visiveis()$$, 'permission denied');
reset role;
\echo 'Testes do Kanban pessoal: OK'
