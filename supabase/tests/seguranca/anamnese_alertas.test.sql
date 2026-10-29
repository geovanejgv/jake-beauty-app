-- Testes da fase 4: alertas da anamnese no agendamento e auditoria de acesso à ficha. Rodar com run.sh.
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
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p1@ex.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'p2@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Pro Um', 'professional', true),
  ('cc000000-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-000000000003', 'Pro Dois', 'professional', true);
insert into public.clients (id, name, phone) values ('c1000000-0000-0000-0000-000000000001', 'Ana', '11999990001');

-- Ficha assinada (montagem direta, como se tivesse vindo do link), dona: administradora
select set_config('app.ficha_interna', '1', false);
insert into public.fichas (id, client_id, tipo, titulo, versao, campos, dados_salao, status, respostas, assinatura_cliente, assinado_em, hash_documento, profissional_id)
values ('f1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'anamnese', 'Ficha', 'teste-1',
  $j${"versao": "teste-1", "tipo": "anamnese", "validadeMeses": 6, "secoes": [{"id": "s", "titulo": "S", "campos": [
    {"id": "alergia", "tipo": "sim_nao", "rotulo": "Tem alergia?", "alertaSe": "sim", "detalhe": {"rotulo": "A quê?"}},
    {"id": "gestante", "tipo": "sim_nao", "rotulo": "Está gestante?", "alertaSe": "sim"},
    {"id": "fototipo", "tipo": "escolha_unica", "rotulo": "Fototipo", "opcoes": [{"valor": "i", "rotulo": "I"}, {"valor": "vi", "rotulo": "VI", "alerta": true}]},
    {"id": "areas", "tipo": "escolha_multipla", "rotulo": "Áreas", "opcoes": [{"valor": "buco", "rotulo": "Buço", "alerta": true}, {"valor": "axilas", "rotulo": "Axilas"}]}
  ]}]}$j$::jsonb, '{}',
  'pendente', null, null, null, null, null);
update public.fichas set status = 'assinada', respostas = '{"alergia": "sim", "alergia__detalhe": "Dipirona", "gestante": "nao", "fototipo": "vi", "areas": ["buco", "axilas"]}',
  assinatura_cliente = 'data:image/png;base64,AAAA', assinado_em = now() - interval '1 month', hash_documento = repeat('a', 64)
 where id = 'f1000000-0000-0000-0000-000000000001';
select set_config('app.ficha_interna', '', false);
insert into public.appointments (client_id, professional_id, start_time, end_time, status)
  values ('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', now() + interval '1 day', now() + interval '1 day' + interval '1 hour', 'scheduled');

set role authenticated;
-- 1) Administradora: alertas com detalhe e opções, validade pelo modelo
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select alertas = array['Tem alergia? (Dipirona)', 'Fototipo: VI', 'Áreas: Buço']
                          and valida_ate::date = (now() - interval '1 month' + interval '6 months')::date and tipo = 'anamnese'
                     from public.alertas_anamnese(array['c1000000-0000-0000-0000-000000000001'::uuid])), 'alertas e validade');
-- 2) Profissional que atende a cliente vê os alertas (sem ser dona da ficha); outra não vê
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) = 1 from public.alertas_anamnese(array['c1000000-0000-0000-0000-000000000001'::uuid])), 'profissional da cliente vê alertas');
select pg_temp.ok((select count(*) = 0 from public.fichas), 'mas não lê a ficha inteira');
select pg_temp.espera_erro($$select public.ficha_registrar_acesso('f1000000-0000-0000-0000-000000000001', false)$$, 'Ficha não encontrada');
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select count(*) = 0 from public.alertas_anamnese(array['c1000000-0000-0000-0000-000000000001'::uuid])), 'outra profissional não vê');
-- 3) Auditoria de visualização e download
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select public.ficha_registrar_acesso('f1000000-0000-0000-0000-000000000001', false);
select public.ficha_registrar_acesso('f1000000-0000-0000-0000-000000000001', true);
reset role;
select pg_temp.ok((select count(*) = 2 from public.access_logs where entidade = 'fichas' and acao in ('ficha_visualizada', 'ficha_baixada')
                          and user_id = 'aa000000-0000-0000-0000-0000000000a1'), 'visualização e download na trilha');
select pg_temp.ok(not has_function_privilege('anon', 'public.alertas_anamnese(uuid[])', 'execute'), 'anon não executa alertas');
select pg_temp.ok(not has_function_privilege('anon', 'public.ficha_registrar_acesso(uuid, boolean)', 'execute'), 'anon não registra acesso');
\echo 'Testes da anamnese (alertas e acesso): OK'
