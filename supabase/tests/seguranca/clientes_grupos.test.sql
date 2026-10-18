-- Testes de origem de cliente, grupos de clientes e lembrete por grupo. Rodar com run.sh.
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
select set_config('request.jwt.claims', '{"aal": "aal2"}', false);
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@ex.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p1@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Pro Um', 'professional', true);

-- Outro estabelecimento com uma origem e um grupo próprios (montagem sem sessão).
insert into public.estabelecimentos (id, nome, plano) values ('5a1ab0e1-0000-4000-8000-0000000000b2', 'Salão B', 'premium');
insert into public.origens_cliente (id, estabelecimento_id, nome) values ('0b000000-0000-0000-0000-0000000000b2', '5a1ab0e1-0000-4000-8000-0000000000b2', 'Outra cidade');
insert into public.grupos_cliente (id, estabelecimento_id, nome) values ('6b000000-0000-0000-0000-0000000000b2', '5a1ab0e1-0000-4000-8000-0000000000b2', 'Grupo B');

set role authenticated;

-- 1) Origens: as duas opções padrão; a equipe lê, só a administradora cria
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select array_agg(nome order by nome) = array['Guaianases', 'Lírios'] from public.origens_cliente), 'Guaianases e Lírios já existem (sem as de outro salão)');
insert into public.origens_cliente (nome) values ('Indicação');
select id as guaianases from public.origens_cliente where nome = 'Guaianases' \gset
insert into public.clients (id, name, phone, origem_id) values
  ('c1000000-0000-0000-0000-000000000001', 'Cliente Um', '(11) 90000-0001', :'guaianases'),
  ('c2000000-0000-0000-0000-000000000002', 'Cliente Dois', '(11) 90000-0002', :'guaianases'),
  ('c3000000-0000-0000-0000-000000000003', 'Cliente Três', '(11) 90000-0003', null);
select pg_temp.espera_erro($$update public.clients set origem_id = '0b000000-0000-0000-0000-0000000000b2' where id = 'c3000000-0000-0000-0000-000000000003'$$, 'referencia_de_outro_estabelecimento');

select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) = 3 from public.origens_cliente), 'profissional lê as origens');
select pg_temp.ok((select origem_id = :'guaianases' from public.clientes_visiveis where id = 'c1000000-0000-0000-0000-000000000001'), 'origem aparece na visão da equipe');
select pg_temp.espera_erro($$insert into public.origens_cliente (nome) values ('Pela profissional')$$, 'row-level security');
update public.origens_cliente set nome = 'Mudou' where nome = 'Indicação';
select pg_temp.ok((select count(*) = 0 from public.origens_cliente where nome = 'Mudou'), 'profissional não altera origem');

-- 2) Grupos: só a administradora vê e monta
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.grupos_cliente (id, nome) values ('60000000-0000-0000-0000-000000000001', 'Guaianases - novembro');
insert into public.grupo_cliente_membros (grupo_id, cliente_id) values
  ('60000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) = 1 from public.grupos_cliente), 'administradora não vê grupo de outro salão');
select pg_temp.espera_erro($$insert into public.grupo_cliente_membros (grupo_id, cliente_id) values ('6b000000-0000-0000-0000-0000000000b2', 'c3000000-0000-0000-0000-000000000003')$$, 'referencia_de_outro_estabelecimento');

select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) = 0 from public.grupos_cliente), 'profissional não vê grupos');
select pg_temp.ok((select count(*) = 0 from public.grupo_cliente_membros), 'profissional não vê membros');
select pg_temp.espera_erro($$insert into public.grupos_cliente (nome) values ('Grupo da profissional')$$, 'row-level security');
select pg_temp.espera_erro($$select public.agendar_lembrete_grupo('60000000-0000-0000-0000-000000000001', now())$$, 'Só a administração');

-- 3) Lembrete por grupo: um por cliente do grupo, com profissional e procedimento
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.espera_erro($$select public.agendar_lembrete_grupo('6b000000-0000-0000-0000-0000000000b2', now())$$, 'Grupo não encontrado');
select pg_temp.espera_erro($$select public.agendar_lembrete_grupo('60000000-0000-0000-0000-000000000001', now(), null, null, null, 7)$$, 'Repetição inválida');
select pg_temp.ok(public.agendar_lembrete_grupo('60000000-0000-0000-0000-000000000001', '2026-11-02 12:00+00', 'bb000000-0000-0000-0000-0000000000b1', null, 'Limpeza de pele') = 2, 'retorna 2 clientes');
select pg_temp.ok((select count(*) = 2 and bool_and(is_manual_reminder) and bool_and(notes = 'Limpeza de pele')
                          and bool_and(professional_id = 'bb000000-0000-0000-0000-0000000000b1') and bool_and(not is_recurring)
                     from public.appointments where start_time = '2026-11-02 12:00+00'), 'lembretes gravados para as 2 clientes');
select pg_temp.ok((select count(*) = 0 from public.appointments where client_id = 'c3000000-0000-0000-0000-000000000003'), 'cliente fora do grupo sem lembrete');
select public.agendar_lembrete_grupo('60000000-0000-0000-0000-000000000001', '2026-12-01 12:00+00', null, null, 'Retorno', 24);
select pg_temp.ok((select count(*) = 48 and count(distinct recurring_group_id) = 2 from public.appointments where notes = 'Retorno'), 'recorrente: 24 meses por cliente, série própria');

select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) = 2 from public.appointments where start_time = '2026-11-02 12:00+00'), 'profissional vê os lembretes dela');

-- 4) Excluir origem não apaga a cliente (fica sem origem)
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
delete from public.origens_cliente where id = :'guaianases';
select pg_temp.ok((select count(*) = 2 from public.clients where id in ('c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002') and origem_id is null), 'clientes ficam sem origem');
reset role;
select 'clientes_grupos: OK';
