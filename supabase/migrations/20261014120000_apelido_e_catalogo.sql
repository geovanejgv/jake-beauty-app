-- =============================================================================
-- Apelido da profissional (nome mostrado na agenda) e catálogo inicial de serviços.
--
-- APLICADA em produção em 2026-10-08 com autorização explícita do usuário (DEV-02).
--
-- Catálogo: nomes lidos dos atendimentos já registrados (tabela antiga public.services),
-- sem testes ("teste", "fefe"...), com grafias unificadas ("Desing" -> Design, "lase" ->
-- laser) e combinações separadas ("Drenagem +laser" -> Drenagem linfática e Depilação a
-- laser). Só o nome e a categoria: preço, duração, comissão e custo ficam com os valores
-- padrão (0 e 60 min) para a administradora preencher em Serviços.
-- =============================================================================

begin;

alter table public.users
  add column if not exists apelido text
  check (apelido is null or char_length(btrim(apelido)) between 1 and 40);

insert into public.servicos (categoria_id, nome)
select c.id, v.nome
  from (values
    ('Depilação a laser', 'Depilação'),
    ('Depilação a laser - axila', 'Depilação'),
    ('Depilação a laser - corpo', 'Depilação'),
    ('Depilação a laser - perna', 'Depilação'),
    ('Depilação a laser - rosto', 'Depilação'),
    ('Depilação a laser - testa', 'Depilação'),
    ('Depilação', 'Depilação'),
    ('Design de sobrancelha', 'Sobrancelhas e Cílios'),
    ('Design de sobrancelha com henna', 'Sobrancelhas e Cílios'),
    ('Limpeza de pele', 'Estética Facial'),
    ('Drenagem linfática', 'Estética Corporal'),
    ('Massagem', 'Estética Corporal'),
    ('Cabelo', 'Cabelo')
  ) as v(nome, categoria)
  join public.categorias_servico c on c.nome = v.categoria
on conflict (categoria_id, nome) do nothing;

commit;
