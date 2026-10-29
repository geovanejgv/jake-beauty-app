-- Testes da reativação, fase 2 (modelos, convites, resultado, não quer contato, agendou). Rodar com run.sh.
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

-- 1) Modelos: um padrão por salão
insert into public.mensagem_modelos (id, nome, texto, padrao) values ('70000000-0000-0000-0000-000000000001', 'Retorno', 'Oi, {primeiro_nome}!', true);
insert into public.mensagem_modelos (id, nome, texto, padrao) values ('70000000-0000-0000-0000-000000000002', 'Saudade', 'Saudade, {primeiro_nome}!', true);
select pg_temp.ok((select count(*) = 1 and bool_and(id = '70000000-0000-0000-0000-000000000002') from public.mensagem_modelos where padrao), 'marcar padrão desmarca o anterior');
select pg_temp.espera_erro($$insert into public.mensagem_modelos (nome, texto) values ('X', 'Texto ok')$$, 'mensagem_modelos_nome_check');

-- 2) Convite: autor, data, canal e resultado do banco
insert into public.contatos_reativacao (id, client_id, modelo_id, texto_enviado, resultado, enviado_por, enviado_em, canal)
  values ('80000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', ' Oi, Ana! ',
          'agendou', 'bb000000-0000-0000-0000-0000000000b1', now() - interval '90 days', 'whatsapp_api');
select pg_temp.ok((select resultado = 'enviado' and enviado_por = 'aa000000-0000-0000-0000-0000000000a1' and enviado_em > now() - interval '1 minute'
                          and canal = 'whatsapp_link' and texto_enviado = 'Oi, Ana!'
                     from public.contatos_reativacao where id = '80000000-0000-0000-0000-000000000001'), 'envio registrado pelo banco');
select pg_temp.espera_erro($$update public.contatos_reativacao set texto_enviado = 'Outro texto' where id = '80000000-0000-0000-0000-000000000001'$$, 'só o resultado');
select pg_temp.espera_erro($$insert into public.contatos_reativacao (client_id, texto_enviado) values ('cb000000-0000-0000-0000-0000000000b2', 'Oi, B!')$$, 'referencia_de_outro_estabelecimento');

-- 3) Agendamento até 30 dias depois do convite marca "agendou"
reset role;
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.appointments (id, client_id, professional_id, start_time, end_time, status)
  values ('a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1',
          now() + interval '3 days', now() + interval '3 days' + interval '1 hour', 'scheduled');
select pg_temp.ok((select resultado = 'agendou' and agendamento_id = 'a1000000-0000-0000-0000-000000000001' and resultado_em is not null
                     from public.contatos_reativacao where id = '80000000-0000-0000-0000-000000000001'), 'agendou automático');

-- 4) Não quer contato bloqueia convites futuros
set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.contatos_reativacao (id, client_id, texto_enviado) values ('80000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'Oi, Bia!');
update public.contatos_reativacao set resultado = 'nao_quer' where id = '80000000-0000-0000-0000-000000000002';
select pg_temp.ok((select nao_quer_contato and nao_quer_contato_em is not null from public.clients where id = 'c2000000-0000-0000-0000-000000000002'), 'resultado marca a cliente');
select pg_temp.espera_erro($$insert into public.contatos_reativacao (client_id, texto_enviado) values ('c2000000-0000-0000-0000-000000000002', 'Oi de novo!')$$, 'pediu para não receber');

-- 5) Profissional não vê nem grava; anon sem acesso
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) = 0 from public.contatos_reativacao), 'profissional não vê convites');
select pg_temp.ok((select count(*) = 0 from public.mensagem_modelos), 'profissional não vê modelos');
select pg_temp.espera_erro($$insert into public.contatos_reativacao (client_id, texto_enviado) values ('c1000000-0000-0000-0000-000000000001', 'Oi, Ana!')$$, 'row-level security');
reset role;
select pg_temp.ok(not has_table_privilege('anon', 'public.contatos_reativacao', 'select'), 'anon sem acesso aos convites');
select pg_temp.ok((select count(*) >= 2 from public.access_logs where entidade = 'contatos_reativacao'), 'convites na trilha');
\echo 'Testes dos convites de reativação: OK'
