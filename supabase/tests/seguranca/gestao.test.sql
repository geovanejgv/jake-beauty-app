-- Testes da gestão do salão (usuários e perfis, clientes mascarados, catálogo,
-- agenda sem conflito, fechamento assinado, Kanban). Rodar com run.sh.
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

-- A = administradora; P = profissional 1; Q = profissional 2
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@ex.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p1@ex.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'p2@ex.com');
insert into public.users (id, auth_id, name, role, active) values
  ('aa000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin', 'admin', true),
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'Profissional Um', 'professional', true),
  ('cc000000-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-000000000003', 'Profissional Dois', 'professional', true);
insert into public.clients (id, name, phone, email, notes) values
  ('c1000000-0000-0000-0000-000000000001', 'Carla Cliente', '(11) 98765-4321', 'carla@ex.com', 'Cliente VIP');
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.9", "user-agent": "teste-gestao/1.0"}', false);

-- 1) Perfis: CPF/CNPJ validados, CPF único, leitura só própria
set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.perfis_profissionais (user_id, cpf, cnpj, modelo_contrato, comissao_padrao_percentual, email)
  values ('bb000000-0000-0000-0000-0000000000b1', '529.982.247-25', '11.222.333/0001-81', 'salao_parceiro', 40, ' P1@Ex.com ');
select pg_temp.ok((select cpf from public.perfis_profissionais where user_id = 'bb000000-0000-0000-0000-0000000000b1') = '52998224725', 'CPF gravado só com dígitos');
select pg_temp.ok((select email from public.perfis_profissionais where user_id = 'bb000000-0000-0000-0000-0000000000b1') = 'p1@ex.com', 'e-mail normalizado');
select pg_temp.espera_erro($$insert into public.perfis_profissionais (user_id, cpf) values ('cc000000-0000-0000-0000-0000000000c1', '52998224725')$$, 'duplicate key');
select pg_temp.espera_erro($$insert into public.perfis_profissionais (user_id, cpf) values ('cc000000-0000-0000-0000-0000000000c1', '12345678900')$$, 'perfis_profissionais_cpf_check');
select pg_temp.espera_erro($$insert into public.perfis_profissionais (user_id, cnpj) values ('cc000000-0000-0000-0000-0000000000c1', '11222333000100')$$, 'perfis_profissionais_cnpj_check');
insert into public.perfis_profissionais (user_id, cpf, comissao_padrao_percentual) values ('cc000000-0000-0000-0000-0000000000c1', '11144477735', 50);
select pg_temp.espera_erro($$update public.users set active = false where id = 'aa000000-0000-0000-0000-0000000000a1'$$, 'ao menos uma administradora');

select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) from public.perfis_profissionais) = 1, 'profissional lê só o próprio perfil');
update public.perfis_profissionais set comissao_padrao_percentual = 90;
select pg_temp.ok((select comissao_padrao_percentual from public.perfis_profissionais) = 40, 'profissional não altera a própria comissão');
select pg_temp.ok((public.salvar_preferencias_ui('{"ocultar": ["kanban"]}'::jsonb)) ->> 'ocultar' is not null, 'salva preferências de interface');
select pg_temp.espera_erro($$select public.salvar_preferencias_ui('[1]'::jsonb)$$, 'Preferências inválidas');

-- 2) Clientes: profissional vê nome com contato mascarado; admin vê tudo
select pg_temp.ok((select count(*) from public.clients) = 0, 'profissional não lê a tabela de clientes');
select pg_temp.ok((select phone from public.clientes_visiveis where id = 'c1000000-0000-0000-0000-000000000001') = '(**) *****-**21', 'telefone mascarado');
select pg_temp.ok((select email from public.clientes_visiveis where id = 'c1000000-0000-0000-0000-000000000001') = 'c***@***', 'e-mail mascarado');
select pg_temp.ok((select notes is null and not contato_visivel from public.clientes_visiveis where id = 'c1000000-0000-0000-0000-000000000001'), 'observações ocultas para profissional');
insert into public.cliente_historico (cliente_id, tipo, texto) values ('c1000000-0000-0000-0000-000000000001', 'tecnico', 'Coloração 7.1 com 20 vol');
select pg_temp.ok((select autor_id from public.cliente_historico limit 1) = 'bb000000-0000-0000-0000-0000000000b1', 'histórico grava o autor da sessão');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select phone from public.clientes_visiveis where id = 'c1000000-0000-0000-0000-000000000001') = '(11) 98765-4321', 'admin vê telefone completo');
reset role;
set role anon;
select pg_temp.espera_erro('select * from public.clientes_visiveis', 'permission denied');
reset role;

-- 3) Catálogo e vínculo por profissional
set role authenticated;
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.espera_erro($$insert into public.servicos (categoria_id, nome, preco_base) select id, 'X', 10 from public.categorias_servico limit 1$$, 'row-level security');
select pg_temp.espera_erro($$select public.habilitar_servicos('bb000000-0000-0000-0000-0000000000b1', array[gen_random_uuid()], true)$$, 'Somente a administradora');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.servicos (id, categoria_id, nome, preco_base, duracao_base_minutos, comissao_base_percentual, custo_material)
  select 'd1000000-0000-0000-0000-000000000001', id, 'Corte feminino', 100, 60, 30, 10 from public.categorias_servico where nome = 'Cabelo';
insert into public.servicos (id, categoria_id, nome, preco_base, duracao_base_minutos)
  select 'd1000000-0000-0000-0000-000000000002', id, 'Escova', 60, 45 from public.categorias_servico where nome = 'Cabelo';
select pg_temp.ok(public.habilitar_servicos('bb000000-0000-0000-0000-0000000000b1',
  array['d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002']::uuid[], true) = 2, 'habilita em lote');
update public.usuario_servico set valor_personalizado = 120, comissao_percentual = 60
 where user_id = 'bb000000-0000-0000-0000-0000000000b1' and servico_id = 'd1000000-0000-0000-0000-000000000001';
select pg_temp.ok((select valor = 120 and comissao = 60 and minutos = 60 and oferece from public.servico_condicoes('bb000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-000000000001')), 'preço e comissão do vínculo prevalecem');
select pg_temp.ok((select valor = 60 and comissao = 40 from public.servico_condicoes('bb000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-000000000002')), 'sem comissão no vínculo usa a taxa fixa do perfil');
select pg_temp.ok((select not oferece from public.servico_condicoes('cc000000-0000-0000-0000-0000000000c1', 'd1000000-0000-0000-0000-000000000001')), 'profissional sem vínculo não oferece');

-- 4) Agenda: trava de conflito, valores calculados no banco, visão própria
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok(public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1',
  'd1000000-0000-0000-0000-000000000001', '2026-10-20 13:00+00', null, 1, 5) is not null, 'profissional agenda na própria agenda');
select pg_temp.ok((select valor_cobrado = 120 and comissao_percentual = 60 and end_time = '2026-10-20 14:00+00' from public.appointments limit 1),
  'valor, comissão e fim vêm do catálogo (preço enviado pela profissional ignorado)');
select pg_temp.espera_erro($$select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-0000000000c1', null, '2026-10-20 13:00+00', 'Escova', 50)$$, 'sua própria agenda');
select pg_temp.espera_erro($$select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-000000000002', '2026-10-20 13:30+00')$$, 'Conflito de horário');
select pg_temp.ok(public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1',
  'd1000000-0000-0000-0000-000000000002', '2026-10-20 14:00+00') is not null, 'horário encostado (14:00) é permitido');
select pg_temp.espera_erro($$insert into public.appointments (client_id, professional_id, start_time, end_time, valor_cobrado) values ('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', '2026-10-21 10:00+00', '2026-10-21 11:00+00', 1)$$, 'Use o agendamento');
select pg_temp.espera_erro($$update public.appointments set valor_cobrado = 1$$, 'Somente a administradora');
select pg_temp.espera_erro($$update public.appointments set gorjeta = 500$$, 'Somente a administradora');
update public.appointments set status = 'confirmed' where start_time = '2026-10-20 13:00+00';
select pg_temp.ok((select status from public.appointments where start_time = '2026-10-20 13:00+00') = 'confirmed', 'profissional confirma o próprio atendimento');
insert into public.appointments (professional_id, start_time, end_time, is_block, block_reason)
  values ('bb000000-0000-0000-0000-0000000000b1', '2026-10-20 16:00+00', '2026-10-20 17:00+00', true, 'Almoço');
select pg_temp.espera_erro($$select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-000000000002', '2026-10-20 16:30+00')$$, 'Horário bloqueado');
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select count(*) from public.appointments) = 0, 'outra profissional não vê a agenda alheia');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) from public.appointments) = 3, 'admin vê todas as agendas');
-- Garantia final no banco, mesmo sem a função: inserção direta sobreposta falha.
select pg_temp.espera_erro($$insert into public.appointments (client_id, professional_id, start_time, end_time) values ('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1', '2026-10-20 13:15+00', '2026-10-20 13:45+00')$$, 'appointments_sem_conflito');
select pg_temp.ok(public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000b1',
  null, '2026-10-22 13:00+00', 'Hidratação avulsa', 80, 30) is not null, 'admin agenda procedimento avulso');
select pg_temp.espera_erro($$select public.remarcar_atendimento((select id from public.appointments where start_time = '2026-10-22 13:00+00'), '2026-10-20 13:30+00')$$, 'Conflito de horário');
select pg_temp.espera_erro($$update public.appointments set status = 'teste'$$, 'appointments_status_check');

-- 5) Fechamento de comissões com assinatura digital
-- Conclui os três atendimentos de 20 e 22/10 com formas de pagamento diferentes.
update public.appointments set status = 'completed', payment_method = 'credito', gorjeta = 10 where start_time = '2026-10-20 13:00+00';
update public.appointments set status = 'completed', payment_method = 'pix' where start_time = '2026-10-20 14:00+00';
update public.appointments set status = 'completed', payment_method = 'dinheiro' where start_time = '2026-10-22 13:00+00';
update public.configuracoes_comissao set descontar_custo_material = true;
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.espera_erro($$select public.gerar_fechamento('bb000000-0000-0000-0000-0000000000b1', '2026-10-01', '2026-10-31')$$, 'Somente a administradora');
select pg_temp.espera_erro($$insert into public.fechamentos (profissional_id, periodo_inicio, periodo_fim, qtd_atendimentos, total_bruto, total_taxas, total_materiais, total_comissao, total_gorjetas, total_a_pagar, descontou_taxa, descontou_material) values ('bb000000-0000-0000-0000-0000000000b1', '2026-10-01', '2026-10-31', 1, 0, 0, 0, 0, 0, 999, false, false)$$, 'permission denied');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select public.gerar_fechamento('bb000000-0000-0000-0000-0000000000b1', '2026-10-01', '2026-10-31', 'Outubro');
-- Corte 120 no crédito: taxa 3,49% = 4,19; material 10; base 105,81; 60% = 63,49; gorjeta 10 -> 73,49
-- Escova 60 no pix: base 60; 40% = 24,00
-- Avulso 80 em dinheiro: comissão do perfil 40% = 32,00
select pg_temp.ok((select qtd_atendimentos = 3 and total_bruto = 260 and total_taxas = 4.19 and total_materiais = 10
   and total_comissao = 119.49 and total_gorjetas = 10 and total_a_pagar = 129.49
   from public.fechamentos), 'totais calculados no banco (taxa, material, comissão e gorjeta)');
select pg_temp.espera_erro($$select public.gerar_fechamento('bb000000-0000-0000-0000-0000000000b1', '2026-10-01', '2026-10-31')$$, 'Nenhum atendimento');
select pg_temp.espera_erro($$update public.appointments set valor_cobrado = 1 where start_time = '2026-10-20 14:00+00'$$, 'já incluído em fechamento');
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select count(*) from public.fechamentos) = 0, 'outra profissional não vê o fechamento');
select pg_temp.espera_erro($$select public.assinar_fechamento((select id from public.fechamentos limit 1))$$, 'não encontrado');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) from public.fechamento_itens) = 3, 'profissional vê os itens do próprio fechamento');
select pg_temp.ok(public.assinar_fechamento((select id from public.fechamentos limit 1)) ~ '^[0-9a-f]{64}$', 'assinatura gera SHA-256');
select pg_temp.ok((select status = 'assinado_pago' and assinado_ip = '198.51.100.9' and assinado_user_agent = 'teste-gestao/1.0'
   and assinado_por_auth = 'bbbbbbbb-0000-0000-0000-000000000002' and assinado_em is not null from public.fechamentos), 'grava status, IP, navegador, conta e momento');
select pg_temp.ok(public.verificar_fechamento((select id from public.fechamentos limit 1)), 'assinatura confere');
select pg_temp.espera_erro($$select public.assinar_fechamento((select id from public.fechamentos limit 1))$$, 'não está aguardando');
reset role;
select pg_temp.espera_erro($$update public.fechamento_itens set valor_liquido = 999$$, 'não podem ser alterados');
select pg_temp.espera_erro($$update public.fechamentos set total_a_pagar = 999$$, 'já encerrado');
select pg_temp.espera_erro($$delete from public.fechamentos$$, 'não pode ser excluído');
-- Adulteração por fora (gatilhos desligados) é detectada pela verificação.
set session_replication_role = replica;
update public.fechamento_itens set valor_liquido = valor_liquido + 1 where servico_nome = 'Escova';
update public.fechamento_itens set valor_comissao = valor_comissao + 1 where servico_nome = 'Escova';
set session_replication_role = origin;
set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok(not public.verificar_fechamento((select id from public.fechamentos limit 1)), 'adulteração detectada pelo hash');
reset role;
select pg_temp.ok((select count(*) from public.access_logs where acao = 'fechamento_assinado') = 1, 'assinatura registrada na auditoria');
select pg_temp.ok((select count(*) from public.access_logs where acao = 'fechamento_gerado') = 1, 'geração registrada na auditoria');

-- Contestação, cancelamento e novo fechamento
set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select public.agendar_atendimento('c1000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-0000000000c1', null, '2026-10-23 13:00+00', 'Manicure', 40, 60);
update public.appointments set status = 'completed', payment_method = 'pix' where professional_id = 'cc000000-0000-0000-0000-0000000000c1';
select public.gerar_fechamento('cc000000-0000-0000-0000-0000000000c1', '2026-10-01', '2026-10-31');
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.espera_erro($$select public.contestar_fechamento((select id from public.fechamentos limit 1), 'x')$$, 'motivo');
select public.contestar_fechamento((select id from public.fechamentos limit 1), 'Faltou um atendimento');
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select public.cancelar_fechamento((select id from public.fechamentos where status = 'contestado'), 'Refazer com o atendimento que faltou');
select pg_temp.ok(public.gerar_fechamento('cc000000-0000-0000-0000-0000000000c1', '2026-10-01', '2026-10-31') is not null, 'após cancelar, o período pode ser fechado de novo');

-- 6) Kanban: tarefa visível ao responsável/envolvidos; comentários em thread
select public.kanban_garantir_padrao();
insert into public.internal_tasks (titulo, responsible_id, coluna_id)
  select 'Repor estoque de tinta', 'bb000000-0000-0000-0000-0000000000b1', id from public.kanban_colunas order by posicao limit 1;
insert into public.tarefa_comentarios (task_id, texto) select id, 'Conferir a marca' from public.internal_tasks;
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) from public.internal_tasks) = 1, 'responsável vê a tarefa');
insert into public.tarefa_comentarios (task_id, texto) select id, 'Feito, faltou só o 7.1' from public.internal_tasks;
select pg_temp.ok((select string_agg(texto, ' / ' order by created_at, texto) from public.tarefa_comentarios) is not null
   and (select count(*) from public.tarefa_comentarios) = 2, 'thread com comentários dos dois lados');
select pg_temp.ok((select count(*) from public.tarefa_comentarios where autor_id = 'bb000000-0000-0000-0000-0000000000b1') = 1, 'autor do comentário vem da sessão');
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
select pg_temp.ok((select count(*) from public.internal_tasks) = 0, 'outra profissional não vê a tarefa');
select pg_temp.ok((select count(*) from public.tarefa_comentarios) = 0, 'nem os comentários');
update public.tarefa_comentarios set texto = 'invasão';
reset role;
select pg_temp.ok((select count(*) from public.tarefa_comentarios where texto = 'invasão') = 0, 'não altera comentário alheio');

-- 7) Permissões: nada executável por visitante; funções internas fechadas
select pg_temp.ok((select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')
  and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')) = 0, 'anon não executa função do app');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.fechamento_resumo_itens(uuid)', 'execute'), 'resumo de itens é interno');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.agenda_conflito(uuid,timestamptz,timestamptz,uuid)', 'execute'), 'consulta de conflito é interna');
select pg_temp.ok((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0, 'toda tabela com RLS');
select pg_temp.ok((select count(*) from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')) = 0, 'nenhuma política aberta');

-- 9) Apelido (nome na agenda) e catálogo inicial
set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
update public.users set apelido = 'Jake' where id = 'bb000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select apelido from public.users where id = 'bb000000-0000-0000-0000-0000000000b1') = 'Jake', 'administradora define o apelido');
select pg_temp.espera_erro($$update public.users set apelido = repeat('x', 41) where id = 'bb000000-0000-0000-0000-0000000000b1'$$, 'users_apelido_check');
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
update public.users set apelido = 'Outro' where id = 'bb000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select apelido from public.users where id = 'bb000000-0000-0000-0000-0000000000b1') = 'Jake', 'profissional não altera o próprio apelido');
select pg_temp.ok((select count(*) from public.servicos s join public.categorias_servico c on c.id = s.categoria_id
   where s.nome = 'Design de sobrancelha' and c.nome = 'Sobrancelhas e Cílios' and s.preco_base = 0) = 1, 'catálogo inicial na categoria certa, sem preço');
reset role;
