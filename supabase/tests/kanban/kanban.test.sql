-- Testes de regras de negócio e segurança do Kanban. Rodar com supabase/tests/kanban/run.sh
\set ON_ERROR_STOP 1
-- helpers
create or replace function pg_temp.espera_erro(p_sql text, p_trecho text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if position(p_trecho in sqlerrm) = 0 then raise exception 'erro errado para [%]: % (esperado: %)', p_sql, sqlerrm, p_trecho; end if;
    raise notice 'OK erro esperado: %', sqlerrm; return;
  end;
  raise exception 'esperava erro em: %', p_sql;
end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(c,false) then raise exception 'FALHOU: %', msg; end if; raise notice 'OK %', msg; end $$;

-- 1) anon não acessa nada
set role anon;
select pg_temp.espera_erro('select * from public.internal_tasks', 'permission denied');
select pg_temp.espera_erro('select public.kanban_garantir_padrao()', 'permission denied');
reset role;

-- 2) login: cria pessoa e quadro padrão
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
select pg_temp.ok(public.kanban_usuario_atual() is not null, 'usuário atual criado');
select pg_temp.ok((select name from public.users where auth_id = auth.uid()) = 'geovanedejesus.ti', 'nome vem do e-mail');
select pg_temp.ok((select role::text from public.users where auth_id = auth.uid()) = 'admin', 'primeiro usuário é admin');
select public.kanban_garantir_padrao();
select public.kanban_garantir_padrao(); -- idempotente
select pg_temp.ok((select count(*) from public.kanban_quadros) = 1, 'um só Kanban Padrão');
select pg_temp.ok((select string_agg(nome, ',' order by posicao) from public.kanban_colunas) = 'A Fazer,Fazendo,Concluído', 'colunas padrão');

-- escrita direta em quadros/colunas é bloqueada
select pg_temp.espera_erro($$insert into public.kanban_quadros(nome) values ('x')$$, 'row-level security');
update public.kanban_colunas set nome='x'; delete from public.kanban_colunas; delete from public.kanban_quadros;
select pg_temp.ok((select count(*) from public.kanban_colunas where nome='x') = 0, 'update direto em coluna não altera nada');
select pg_temp.ok((select count(*) from public.kanban_colunas) = 3 and (select count(*) from public.kanban_quadros) = 1, 'delete direto em quadro/coluna não apaga nada');

-- 3) quadro com 4 colunas
select public.kanban_criar_quadro('Atendimento', '[{"nome":"Entrada"},{"nome":"Em contato"},{"nome":"Aguardando"},{"nome":"Fechado"}]') as q \gset
select id as c1 from public.kanban_colunas where quadro_id = :'q' and posicao=1 \gset
select id as c2 from public.kanban_colunas where quadro_id = :'q' and posicao=2 \gset
select id as c3 from public.kanban_colunas where quadro_id = :'q' and posicao=3 \gset
select id as c4 from public.kanban_colunas where quadro_id = :'q' and posicao=4 \gset
select public.kanban_usuario_atual() as me \gset

-- validações de quadro
select pg_temp.espera_erro($$select public.kanban_criar_quadro('A', '[{"nome":"Só uma"}]')$$, '2 a 10');
select pg_temp.espera_erro($$select public.kanban_criar_quadro('A', (select jsonb_agg(jsonb_build_object('nome','c'||g)) from generate_series(1,11) g))$$, '2 a 10');
select pg_temp.espera_erro($$select public.kanban_criar_quadro('A', '[{"nome":"12345678901234567890123456"},{"nome":"b"}]')$$, '1 a 25');
select pg_temp.espera_erro($$select public.kanban_criar_quadro('1234567890123456789012345678901', '[{"nome":"a"},{"nome":"b"}]')$$, '1 a 30');
select pg_temp.espera_erro($$select public.kanban_criar_quadro('A', '[{"nome":"a","extra":1},{"nome":"b"}]')$$, 'Coluna inválida');

-- 4) cartões: fim da fila, created_by, status
insert into public.internal_tasks (titulo, responsible_id, coluna_id, ordem, status, created_by) values ('T1', :'me', :'c1', 99, 'concluida', null) returning id as t1 \gset
insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('T2', :'me', :'c1') returning id as t2 \gset
insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('T3', :'me', :'c1') returning id as t3 \gset
select pg_temp.ok((select string_agg(titulo||':'||ordem, ',' order by ordem) from public.internal_tasks where coluna_id = :'c1') = 'T1:0,T2:1,T3:2', 'novos no fim, ordem ignora valor enviado');
select pg_temp.ok((select status from public.internal_tasks where id=:'t1') = 'pendente', 'status vem da coluna (não do corpo)');
select pg_temp.ok((select created_by from public.internal_tasks where id=:'t1') = :'me', 'created_by gravado pelo banco');
update public.internal_tasks set status='concluida' where id=:'t2';
select pg_temp.ok((select status from public.internal_tasks where id=:'t2') = 'pendente', 'status direto é ignorado');
update public.internal_tasks set created_by = null where id=:'t2';
select pg_temp.ok((select created_by from public.internal_tasks where id=:'t2') = :'me', 'created_by não muda');

-- mover até a última: concluída com data
update public.internal_tasks set coluna_id=:'c4' where id=:'t1';
select pg_temp.ok((select status='concluida' and concluida_em is not null from public.internal_tasks where id=:'t1'), 'última coluna = concluída com data');
update public.internal_tasks set concluida_em='2026-10-01T12:00:00-03:00' where id=:'t1';
select pg_temp.ok((select concluida_em = '2026-10-01T15:00:00Z' from public.internal_tasks where id=:'t1'), 'concluída em editável');
update public.internal_tasks set coluna_id=:'c2' where id=:'t1';
select pg_temp.ok((select status='em_andamento' and concluida_em is null from public.internal_tasks where id=:'t1'), 'meio = em andamento, limpa conclusão');

-- limites
select pg_temp.espera_erro(format($$insert into public.internal_tasks (titulo, responsible_id, coluna_id, criticidade) values ('x', %L, %L, 'altissima')$$, :'me', :'c1'), 'check constraint');
select pg_temp.espera_erro(format($$insert into public.internal_tasks (titulo, responsible_id, coluna_id, descricao) values ('x', %L, %L, repeat('a',4001))$$, :'me', :'c1'), 'check constraint');
select pg_temp.espera_erro(format($$insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('', %L, %L)$$, :'me', :'c1'), 'check constraint');
select pg_temp.espera_erro(format($$insert into public.internal_tasks (titulo, responsible_id, coluna_id, envolvidos) values ('x', %L, %L, array[gen_random_uuid()])$$, :'me', :'c1'), 'Envolvido inválido');
select pg_temp.espera_erro(format($$insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('x', gen_random_uuid(), %L)$$, :'c1'), 'foreign key');
select pg_temp.espera_erro(format($$insert into public.internal_tasks (titulo, responsible_id, coluna_id) values ('x', %L, gen_random_uuid())$$, :'me'), 'Coluna do kanban inválida');
insert into public.users (name, role) select 'P'||g, 'professional' from generate_series(1,21) g;
select pg_temp.espera_erro(format($$insert into public.internal_tasks (titulo, responsible_id, coluna_id, envolvidos) values ('x', %L, %L, (select array_agg(id) from public.users where name like 'P%%'))$$, :'me', :'c1'), 'internal_tasks_envolvidos_check');
insert into public.internal_tasks (titulo, responsible_id, coluna_id, envolvidos) values ('dup', :'me', :'c1', array[:'me', :'me']::uuid[]) returning id as tdup \gset
select pg_temp.ok((select cardinality(envolvidos) = 1 from public.internal_tasks where id = :'tdup'), 'envolvidos sem repetição');
delete from public.internal_tasks where id = :'tdup';

-- 5) reordenar
select public.kanban_reordenar(:'c1', array[:'t3', :'t2']::uuid[]);
select pg_temp.ok((select string_agg(titulo, ',' order by ordem) from public.internal_tasks where coluna_id=:'c1') = 'T3,T2', 'reordenar dentro da coluna');
select public.kanban_reordenar(:'c3', array[:'t2']::uuid[]);
select pg_temp.ok((select coluna_id=:'c3' and status='em_andamento' from public.internal_tasks where id=:'t2'), 'reordenar muda de coluna e status');
select pg_temp.espera_erro(format($$select public.kanban_reordenar(%L, array[%L,%L]::uuid[])$$, :'c1', :'t3', :'t3'), 'Lista de cartões inválida');
select pg_temp.espera_erro(format($$select public.kanban_reordenar(%L, array[gen_random_uuid()])$$, :'c1'), 'Tarefa inválida');
select pg_temp.espera_erro($$select public.kanban_reordenar(gen_random_uuid(), array[gen_random_uuid()])$$, 'Coluna do kanban inválida');

-- 6) editar quadro: renomear, reordenar meio, remover coluna 2, nova coluna
select pg_temp.espera_erro(format($$select public.kanban_salvar_quadro(%L, 'Atendimento', %L)$$, :'q', jsonb_build_array(jsonb_build_object('id',:'c2','nome','x'), jsonb_build_object('id',:'c1','nome','y'), jsonb_build_object('id',:'c4','nome','z'))), 'fixas');
select pg_temp.espera_erro(format($$select public.kanban_salvar_quadro(%L, 'Atendimento', %L)$$, :'q', jsonb_build_array(jsonb_build_object('id',:'c1','nome','x'), jsonb_build_object('id',(select id from public.kanban_colunas where quadro_id<>:'q' limit 1),'nome','y'), jsonb_build_object('id',:'c4','nome','z'))), 'Coluna inválida');
select public.kanban_salvar_quadro(:'q', 'Atendimento 2', jsonb_build_array(
  jsonb_build_object('id',:'c1','nome','Entrada!'),
  jsonb_build_object('nome','Nova'),
  jsonb_build_object('id',:'c4','nome','Fechado')));
select pg_temp.ok((select string_agg(nome, ',' order by posicao) from public.kanban_colunas where quadro_id=:'q') = 'Entrada!,Nova,Fechado', 'colunas editadas');
select pg_temp.ok((select nome from public.kanban_quadros where id=:'q') = 'Atendimento 2', 'quadro renomeado');
select pg_temp.ok((select string_agg(titulo, ',' order by ordem) from public.internal_tasks where coluna_id=:'c1') = 'T3,T1,T2', 'cartões das removidas foram para o fim da primeira');
select pg_temp.ok((select bool_and(status='pendente') from public.internal_tasks where coluna_id=:'c1'), 'status recalculado');

-- 7) sub-itens cascata
insert into public.tarefa_itens (task_id, titulo) values (:'t1','sub');
delete from public.internal_tasks where id=:'t1';
select pg_temp.ok((select count(*) from public.tarefa_itens) = 0, 'sub-itens apagados junto');

-- 8) excluir quadros
select public.kanban_excluir_quadro(:'q');
select pg_temp.ok((select count(*) from public.internal_tasks) = 0 and (select count(*) from public.kanban_colunas where quadro_id = :'q') = 0, 'excluir quadro apaga colunas e cartões');
select pg_temp.espera_erro(format($$select public.kanban_excluir_quadro(%L)$$, (select id from public.kanban_quadros limit 1)), 'único quadro');
select pg_temp.espera_erro($$select public.kanban_excluir_quadro(gen_random_uuid())$$, 'Quadro não encontrado');

-- 9) segundo login vira professional
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
select public.kanban_usuario_atual();
select pg_temp.ok((select role::text from public.users where auth_id = auth.uid()) = 'professional', 'segundo usuário é professional');

-- 10) sem sessão
select set_config('request.jwt.claim.sub','', false);
select pg_temp.espera_erro($$select public.kanban_garantir_padrao()$$, 'Sessão expirada');
select pg_temp.espera_erro($$select public.kanban_reordenar(gen_random_uuid(), array[gen_random_uuid()])$$, 'Sessão expirada');
reset role;
select 'TODOS OS TESTES PASSARAM';
