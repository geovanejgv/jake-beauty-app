-- Testes das fichas de anamnese e termos (link da cliente, validação, assinatura, RLS). Rodar com run.sh.
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
-- PNG mínimo (assinatura de arquivo correta) e um "PNG" falso.
create or replace function pg_temp.png() returns text language sql as $$
  select 'data:image/png;base64,' || replace(encode('\x89504e470d0a1a0a'::bytea || convert_to(repeat('assinatura', 30), 'UTF8'), 'base64'), E'\n', '');
$$;
create or replace function pg_temp.png_falso() returns text language sql as $$
  select 'data:image/png;base64,' || replace(encode(convert_to(repeat('MZ executavel ', 30), 'UTF8'), 'base64'), E'\n', '');
$$;
create or replace function pg_temp.campos() returns jsonb language sql as $$
  select $j${
    "versao": "teste-1", "tipo": "anamnese", "titulo": "Ficha de teste", "campoNascimento": "data_nascimento",
    "secoes": [
      {"id": "salao", "titulo": "Procedimento", "campos": [
        {"id": "procedimento", "tipo": "texto", "rotulo": "Procedimento", "obrigatorio": true, "origem": "salao"},
        {"id": "valor", "tipo": "numero", "rotulo": "Valor", "origem": "salao", "max": 100000}
      ]},
      {"id": "dados", "titulo": "Dados", "campos": [
        {"id": "aviso", "tipo": "informativo", "rotulo": "Leia com atenção"},
        {"id": "nome_completo", "tipo": "texto", "rotulo": "Nome completo", "obrigatorio": true},
        {"id": "data_nascimento", "tipo": "data", "rotulo": "Data de nascimento", "obrigatorio": true},
        {"id": "cpf", "tipo": "cpf", "rotulo": "CPF"},
        {"id": "telefone", "tipo": "telefone", "rotulo": "Telefone", "obrigatorio": true},
        {"id": "gestante", "tipo": "sim_nao", "rotulo": "Está gestante?", "obrigatorio": true, "alertaSe": "sim",
         "detalhe": {"rotulo": "Quantas semanas?", "obrigatorio": true}},
        {"id": "alergia", "tipo": "sim_nao", "rotulo": "Tem alergia?", "obrigatorio": true},
        {"id": "alergia_qual", "tipo": "texto", "rotulo": "A quê?", "obrigatorio": true, "mostrarSe": {"campo": "alergia", "igual": "sim"}},
        {"id": "fototipo", "tipo": "escolha_unica", "rotulo": "Fototipo", "obrigatorio": true,
         "opcoes": [{"valor": "i", "rotulo": "I"}, {"valor": "ii", "rotulo": "II"}]},
        {"id": "areas", "tipo": "escolha_multipla", "rotulo": "Áreas",
         "opcoes": [{"valor": "axilas", "rotulo": "Axilas"}, {"valor": "buco", "rotulo": "Buço"}]},
        {"id": "consentimento", "tipo": "aceite", "rotulo": "Autorizo o uso dos dados de saúde", "obrigatorio": true}
      ]}
    ]}$j$::jsonb;
$$;
create or replace function pg_temp.respostas() returns jsonb language sql as $$
  select '{"nome_completo": "Maria Teste", "data_nascimento": "1990-05-10", "cpf": "52998224725", "telefone": "11999990000",
           "gestante": "nao", "alergia": "sim", "alergia_qual": "Látex", "fototipo": "ii", "areas": ["axilas"], "consentimento": true}'::jsonb;
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
insert into public.estabelecimentos (id, nome, plano) values ('5a1ab0e1-0000-4000-8000-0000000000b2', 'Salão B', 'premium');
insert into public.clients (id, name, phone, estabelecimento_id) values ('cb000000-0000-0000-0000-0000000000b2', 'Cliente B', '', '5a1ab0e1-0000-4000-8000-0000000000b2');

set role authenticated;

-- 1) Preferência de modelo visual: administradora grava; profissional só lê
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.ficha_preferencias (tipo, modelo_visual) values ('anamnese', 'rose');
select pg_temp.espera_erro($$insert into public.ficha_preferencias (tipo, modelo_visual) values ('termo', 'neon')$$, 'ficha_preferencias_modelo_visual_check');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) = 1 from public.ficha_preferencias), 'profissional lê a preferência');
select pg_temp.espera_erro($$insert into public.ficha_preferencias (tipo, modelo_visual) values ('termo', 'noir')$$, 'row-level security');

-- 2) Criação: o banco força pendente, autor, profissional e modelo visual
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.fichas (id, client_id, profissional_id, tipo, titulo, versao, campos, dados_salao, status, respostas, modelo_visual, hash_documento)
  values ('f1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-0000000000c1',
          'anamnese', ' Ficha de teste ', 'teste-1', pg_temp.campos(), '{"procedimento": "Limpeza de pele", "valor": 180}',
          'assinada', '{"x": 1}', 'noir', repeat('a', 64));
select pg_temp.ok((select status = 'pendente' and respostas is null and hash_documento is null and modelo_visual = 'rose'
                          and titulo = 'Ficha de teste' and profissional_id = 'bb000000-0000-0000-0000-0000000000b1'
                          and created_by = 'bb000000-0000-0000-0000-0000000000b1'
                     from public.fichas where id = 'f1000000-0000-0000-0000-000000000001'), 'criação com regras do banco');
select pg_temp.espera_erro($$insert into public.fichas (client_id, tipo, titulo, versao, campos, dados_salao)
  values ('c0000000-0000-0000-0000-000000000001', 'anamnese', 'Sem procedimento', 'teste-1', pg_temp.campos(), '{}')$$, 'Preencha: Procedimento');
select pg_temp.espera_erro($$insert into public.fichas (client_id, tipo, titulo, versao, campos, dados_salao)
  values ('c0000000-0000-0000-0000-000000000001', 'anamnese', 'Extra', 'teste-1', pg_temp.campos(), '{"procedimento": "X", "desconto": 50}')$$, 'Campo não previsto');
select pg_temp.espera_erro($$insert into public.fichas (client_id, tipo, titulo, versao, campos, dados_salao)
  values ('c0000000-0000-0000-0000-000000000001', 'termo', 'Tipo trocado', 'teste-1', pg_temp.campos(), '{"procedimento": "X"}')$$, 'Modelo de ficha inválido');
select pg_temp.espera_erro($$insert into public.fichas (client_id, tipo, titulo, versao, campos, dados_salao)
  values ('cb000000-0000-0000-0000-0000000000b2', 'anamnese', 'Outro salão', 'teste-1', pg_temp.campos(), '{"procedimento": "X"}')$$, 'referencia_de_outro_estabelecimento');

-- 3) Dado de saúde: a outra profissional não vê; a administradora vê
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select count(*) = 0 from public.fichas), 'outra profissional não vê a ficha');
select pg_temp.espera_erro($$select public.ficha_gerar_link('f1000000-0000-0000-0000-000000000001')$$, 'Ficha não encontrada');
update public.fichas set status = 'cancelada', cancelado_motivo = 'tentativa' where id = 'f1000000-0000-0000-0000-000000000001';
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) = 1 from public.fichas where status = 'pendente'), 'administradora vê; outra profissional não cancelou');

-- 4) Pela tela não se altera conteúdo; link só por função
select pg_temp.espera_erro($$update public.fichas set dados_salao = '{"procedimento": "Outro"}' where id = 'f1000000-0000-0000-0000-000000000001'$$, 'não pode ser alterada');
select pg_temp.espera_erro($$update public.fichas set token_hash = repeat('b', 64), token_expira_em = now() + interval '1 day' where id = 'f1000000-0000-0000-0000-000000000001'$$, 'não pode ser alterada');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
create temp table link_antigo as select public.ficha_gerar_link('f1000000-0000-0000-0000-000000000001') ->> 'token' as token;
create temp table link as select public.ficha_gerar_link('f1000000-0000-0000-0000-000000000001') ->> 'token' as token;
grant select on link, link_antigo to anon, authenticated;
select pg_temp.ok((select token ~ '^[0-9a-f]{64}$' from link), 'token com 64 hexadecimais');
select pg_temp.ok((select f.token_hash = encode(sha256(convert_to(l.token, 'UTF8')), 'hex') from public.fichas f, link l
                    where f.id = 'f1000000-0000-0000-0000-000000000001'), 'banco guarda só o hash do token');

-- 5) Cliente sem login abre e assina pelo link
reset role;
select pg_temp.como('');
set role anon;
select pg_temp.espera_erro($$select * from public.fichas$$, 'permission denied');
select pg_temp.espera_erro($$select public.ficha_gerar_link('f1000000-0000-0000-0000-000000000001')$$, 'permission denied');
select pg_temp.espera_erro($$select public.ficha_publica_abrir((select token from link_antigo))$$, 'Link inválido ou vencido');
select pg_temp.espera_erro($$select public.ficha_publica_abrir('nao-e-token')$$, 'Link inválido ou vencido');
select pg_temp.ok((select (public.ficha_publica_abrir(token) ->> 'primeiro_nome') = 'Carla'
                          and (public.ficha_publica_abrir(token) #>> '{dados_salao,procedimento}') = 'Limpeza de pele'
                          and (public.ficha_publica_abrir(token) ->> 'modelo_visual') = 'rose' from link), 'cliente abre a ficha pelo link');

-- Validação no servidor (VAL-01, VAL-02)
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas() - 'nome_completo', pg_temp.png())$$, 'Preencha: Nome completo');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas() || '{"cpf": "12345678900"}', pg_temp.png())$$, 'CPF inválido');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas() || '{"fototipo": "vii"}', pg_temp.png())$$, 'Opção inválida: Fototipo');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas() || '{"areas": ["axilas", "axilas"]}', pg_temp.png())$$, 'Opção inválida: Áreas');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas() || '{"consentimento": false}', pg_temp.png())$$, 'Confirme: Autorizo');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas() || '{"gestante": "sim"}', pg_temp.png())$$, 'Preencha: Quantas semanas?');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas() || '{"alergia": "nao"}', pg_temp.png())$$, 'Campo não esperado: A quê?');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas() || '{"admin": true}', pg_temp.png())$$, 'Campo não previsto');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas() || '{"procedimento": "Grátis"}', pg_temp.png())$$, 'Campo não previsto');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas() || '{"data_nascimento": "2999-01-01"}', pg_temp.png())$$, 'Data inválida');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas() || '{"telefone": "abc"}', pg_temp.png())$$, 'Telefone inválido');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas(), pg_temp.png_falso())$$, 'Faça a sua assinatura');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas(), null)$$, 'Faça a sua assinatura');

-- Menor de idade: exige responsável legal com CPF válido e assinatura
create temp table menor as select (pg_temp.respostas() || jsonb_build_object('data_nascimento', to_char(current_date - interval '17 years', 'YYYY-MM-DD'))) as r;
grant select on menor to anon;
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), (select r from menor), pg_temp.png())$$, 'responsável legal');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), (select r from menor), pg_temp.png(),
  '{"nome": "Mãe Teste", "cpf": "11111111111", "parentesco": "Mãe"}', pg_temp.png())$$, 'CPF do responsável inválido');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), (select r from menor), pg_temp.png(),
  '{"nome": "Mãe Teste", "cpf": "52998224725", "parentesco": "Mãe"}', null)$$, 'responsável legal também precisa assinar');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas(), pg_temp.png(),
  '{"nome": "Mãe Teste", "cpf": "52998224725", "parentesco": "Mãe"}', pg_temp.png())$$, 'só é pedido para menor');

-- Assinatura válida (menor com responsável)
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Teste/1.0"}', false);
select pg_temp.ok((select (public.ficha_publica_assinar(token, (select r from menor), pg_temp.png(),
  '{"nome": "Mãe Teste", "cpf": "52998224725", "parentesco": "Mãe"}', pg_temp.png(), 'Celular de teste') ->> 'hash') ~ '^[0-9a-f]{64}$' from link), 'assinatura gravada com hash');
select pg_temp.espera_erro($$select public.ficha_publica_assinar((select token from link), pg_temp.respostas(), pg_temp.png())$$, 'Link inválido ou vencido');
select pg_temp.espera_erro($$select public.ficha_publica_abrir((select token from link))$$, 'Link inválido ou vencido');
reset role;
select set_config('request.headers', '', false);
select pg_temp.ok((select status = 'assinada' and token_hash is null and assinatura_ip = '203.0.113.7' and assinatura_dispositivo = 'Celular de teste'
                          and responsavel_cpf = '52998224725' and assinatura_responsavel is not null and respostas ->> 'alergia_qual' = 'Látex'
                     from public.fichas where id = 'f1000000-0000-0000-0000-000000000001'), 'evidências da assinatura gravadas');
select pg_temp.ok((select count(*) = 1 from public.access_logs where acao = 'ficha_assinada' and entidade_id = 'f1000000-0000-0000-0000-000000000001'
                          and estabelecimento_id = '5a1ab0e1-0000-4000-8000-000000000001'), 'assinatura sem login entra na trilha do estabelecimento');
select pg_temp.ok((select count(*) = 2 from public.access_logs where acao = 'ficha_link_gerado'), 'geração de link auditada');

-- 6) Assinada: ninguém altera nem exclui; só a administradora cancela, com motivo
set role authenticated;
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.espera_erro($$update public.fichas set status = 'cancelada', cancelado_motivo = 'Erro de digitação' where id = 'f1000000-0000-0000-0000-000000000001'$$, 'Só a administradora');
select pg_temp.espera_erro($$select public.ficha_gerar_link('f1000000-0000-0000-0000-000000000001')$$, 'Só ficha pendente');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.espera_erro($$update public.fichas set respostas = '{}' where id = 'f1000000-0000-0000-0000-000000000001'$$, 'não pode ser alterada');
select pg_temp.espera_erro($$delete from public.fichas where id = 'f1000000-0000-0000-0000-000000000001'$$, 'não pode ser excluída');
select pg_temp.espera_erro($$update public.fichas set status = 'cancelada' where id = 'f1000000-0000-0000-0000-000000000001'$$, 'Informe o motivo');
update public.fichas set status = 'cancelada', cancelado_motivo = ' Assinada pela pessoa errada ' where id = 'f1000000-0000-0000-0000-000000000001';
select pg_temp.ok((select status = 'cancelada' and cancelado_motivo = 'Assinada pela pessoa errada' and cancelado_em is not null and hash_documento is not null
                     from public.fichas where id = 'f1000000-0000-0000-0000-000000000001'), 'cancelamento mantém o documento');
select pg_temp.espera_erro($$update public.fichas set status = 'pendente' where id = 'f1000000-0000-0000-0000-000000000001'$$, 'não pode ser alterada');
select pg_temp.espera_erro($$delete from public.clients where id = 'c0000000-0000-0000-0000-000000000001'$$, 'fichas_client_id_fkey');

-- 7) Pendente: profissional cancela a dela; administradora exclui; profissional não exclui
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.fichas (id, client_id, tipo, titulo, versao, campos, dados_salao)
  values ('f2000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'anamnese', 'Pendente', 'teste-1', pg_temp.campos(), '{"procedimento": "Peeling"}');
delete from public.fichas where id = 'f2000000-0000-0000-0000-000000000002';
select pg_temp.ok((select count(*) = 1 from public.fichas where id = 'f2000000-0000-0000-0000-000000000002'), 'profissional não exclui');
select pg_temp.ok((public.ficha_gerar_link('f2000000-0000-0000-0000-000000000002') ->> 'token') is not null, 'profissional gera link da ficha dela');
update public.fichas set status = 'cancelada', cancelado_motivo = 'Cliente desistiu' where id = 'f2000000-0000-0000-0000-000000000002';
select pg_temp.ok((select status = 'cancelada' and token_hash is null from public.fichas where id = 'f2000000-0000-0000-0000-000000000002'), 'cancelar invalida o link');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
delete from public.fichas where id = 'f2000000-0000-0000-0000-000000000002';
select pg_temp.ok((select count(*) = 0 from public.fichas where id = 'f2000000-0000-0000-0000-000000000002'), 'administradora exclui ficha não assinada');

-- 8) Link vencido não abre
insert into public.fichas (id, client_id, tipo, titulo, versao, campos, dados_salao)
  values ('f3000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'anamnese', 'Vence', 'teste-1', pg_temp.campos(), '{"procedimento": "Peeling"}');
create temp table link3 as select public.ficha_gerar_link('f3000000-0000-0000-0000-000000000003') ->> 'token' as token;
grant select on link3 to anon;
reset role;
-- Simula a passagem do tempo (rotina interna do servidor).
select set_config('app.ficha_interna', '1', false);
update public.fichas set token_expira_em = now() - interval '1 minute' where id = 'f3000000-0000-0000-0000-000000000003';
select set_config('app.ficha_interna', '', false);
select pg_temp.como('');
set role anon;
select pg_temp.espera_erro($$select public.ficha_publica_abrir((select token from link3))$$, 'Link inválido ou vencido');
reset role;

select pg_temp.ok(not has_table_privilege('anon', 'public.fichas', 'select'), 'anon sem acesso à tabela fichas');
select pg_temp.ok(not has_function_privilege('anon', 'public.ficha_validar_respostas(jsonb, jsonb, text)', 'execute'), 'validação interna fechada');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.fichas_regras()', 'execute'), 'regras internas fechadas');
\echo 'Testes das fichas: OK'
