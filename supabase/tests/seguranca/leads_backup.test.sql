-- Testes dos leads (funil) e do backup em planilha. Rodar com run.sh.
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
create or replace function pg_temp.aal(p_nivel text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('aal', p_nivel)::text, false);
$$;
select pg_temp.aal('aal2');
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@ex.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p1@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Pro Um', 'professional', true);

-- Outro estabelecimento com um lead e uma cliente próprios (montagem sem sessão).
insert into public.estabelecimentos (id, nome, plano) values ('5a1ab0e1-0000-4000-8000-0000000000b2', 'Salão B', 'premium');
insert into public.clients (id, name, phone, estabelecimento_id) values ('cb000000-0000-0000-0000-0000000000b2', 'Cliente B', '', '5a1ab0e1-0000-4000-8000-0000000000b2');
insert into public.leads (id, nome, estabelecimento_id) values ('1b000000-0000-0000-0000-0000000000b2', 'Lead do Salão B', '5a1ab0e1-0000-4000-8000-0000000000b2');

set role authenticated;

-- 1) Administradora cria; o banco grava autor, responsável e etapa padrão
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.leads (id, nome, telefone, email, origem, interesse, valor_estimado)
  values ('10000000-0000-0000-0000-000000000001', '  Maria Souza ', '(11) 9 6000-0000', 'maria@ex.com', 'instagram', 'Design de sobrancelhas', 150);
select pg_temp.ok((select nome = 'Maria Souza' and etapa = 'novo' and created_by = 'aa000000-0000-0000-0000-0000000000a1'
                          and responsavel_id = 'aa000000-0000-0000-0000-0000000000a1' and fechado_em is null
                     from public.leads where id = '10000000-0000-0000-0000-000000000001'), 'criação com padrões do banco');
select pg_temp.ok((select count(*) = 1 from public.leads), 'administradora não vê lead de outro salão');
select pg_temp.espera_erro($$insert into public.leads (nome) values ('M')$$, 'leads_nome_check');
select pg_temp.espera_erro($$insert into public.leads (nome, etapa) values ('Ana', 'ganho')$$, 'leads_etapa_check');
select pg_temp.espera_erro($$insert into public.leads (nome, origem) values ('Ana', 'tiktok')$$, 'leads_origem_check');
select pg_temp.espera_erro($$insert into public.leads (nome, telefone) values ('Ana', 'abc')$$, 'leads_telefone_check');
select pg_temp.espera_erro($$insert into public.leads (nome, email) values ('Ana', 'nao-e-email')$$, 'leads_email_check');
select pg_temp.espera_erro($$insert into public.leads (nome, valor_estimado) values ('Ana', -1)$$, 'leads_valor_estimado_check');
select pg_temp.espera_erro($$insert into public.leads (nome, estabelecimento_id) values ('Ana', '5a1ab0e1-0000-4000-8000-0000000000b2')$$, 'outro_estabelecimento');
select pg_temp.espera_erro($$update public.leads set client_id = 'cb000000-0000-0000-0000-0000000000b2' where id = '10000000-0000-0000-0000-000000000001'$$, 'referencia_de_outro_estabelecimento');

-- 2) Regras do funil: fechado grava a data; motivo só em perdido
update public.leads set etapa = 'fechado' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok((select fechado_em is not null from public.leads where id = '10000000-0000-0000-0000-000000000001'), 'fechado grava a data');
update public.leads set etapa = 'perdido', motivo_perda = 'Achou caro' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok((select fechado_em is null and motivo_perda = 'Achou caro' from public.leads where id = '10000000-0000-0000-0000-000000000001'), 'sair de fechado limpa a data; perdido guarda o motivo');
update public.leads set etapa = 'contato' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok((select motivo_perda is null from public.leads where id = '10000000-0000-0000-0000-000000000001'), 'sair de perdido limpa o motivo');
update public.leads set created_by = null where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok((select created_by = 'aa000000-0000-0000-0000-0000000000a1' from public.leads where id = '10000000-0000-0000-0000-000000000001'), 'autor não muda');

-- 3) Profissional não vê nem grava leads
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) = 0 from public.leads), 'profissional não vê leads');
select pg_temp.espera_erro($$insert into public.leads (nome) values ('Pela profissional')$$, 'row-level security');
update public.leads set nome = 'Mudou' where id = '10000000-0000-0000-0000-000000000001';
delete from public.leads where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select nome = 'Maria Souza' from public.leads where id = '10000000-0000-0000-0000-000000000001'), 'profissional não altera nem exclui');

-- 4) Exclusão pela administradora fica na trilha
delete from public.leads where id = '10000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.ok((select count(*) >= 1 from public.access_logs where acao = 'excluiu' and entidade = 'leads' and entidade_id = '10000000-0000-0000-0000-000000000001'), 'exclusão auditada');
select pg_temp.ok(not has_table_privilege('anon', 'public.leads', 'select'), 'anon sem acesso a leads');

-- 5) Backup: só administradora com aal2; grava na trilha; último backup por tipo
set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.aal('aal1');
select pg_temp.espera_erro($$select public.registrar_backup('clientes', 10)$$, 'Confirme o código');
select pg_temp.ok((select count(*) = 0 from public.ultimos_backups()), 'sem backup ainda');
select pg_temp.aal('aal2');
select pg_temp.espera_erro($$select public.registrar_backup('senhas', 1)$$, 'Tipo de backup inválido');
select pg_temp.espera_erro($$select public.registrar_backup('clientes', -1)$$, 'Backup inválido');
select public.registrar_backup('clientes', 25);
select pg_temp.ok((select ultimo is not null from public.ultimos_backups() where tipo = 'clientes'), 'último backup de clientes registrado');
select pg_temp.ok((select count(*) = 1 from public.ultimos_backups()), 'só o tipo exportado aparece');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.espera_erro($$select public.registrar_backup('clientes', 1)$$, 'Só a administração');
select pg_temp.ok((select count(*) = 0 from public.ultimos_backups()), 'profissional não vê os backups');
reset role;
select pg_temp.ok((select detalhes ->> 'linhas' = '25' and estabelecimento_id = '5a1ab0e1-0000-4000-8000-000000000001'
                     from public.access_logs where acao = 'exportou' and entidade = 'backup_clientes'), 'trilha com linhas e estabelecimento');
select pg_temp.ok(not has_function_privilege('anon', 'public.registrar_backup(text, integer)', 'execute'), 'anon não registra backup');
select 'leads_backup: OK';
