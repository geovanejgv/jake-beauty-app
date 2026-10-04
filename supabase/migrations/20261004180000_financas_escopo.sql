-- Finanças: separa o controle do negócio e o pessoal na mesma tabela.
-- Lançamentos que já existem ficam como "pessoal" (a tabela era usada assim); cada um pode ser trocado na edição.
-- O tipo de custo (fixo ou variável) continua na coluna category: 'Fixas' ou 'Variáveis'.
alter table public.personal_finances
  add column if not exists escopo text not null default 'pessoal'
  constraint personal_finances_escopo_check check (escopo in ('negocio', 'pessoal'));

create index if not exists personal_finances_escopo_data_idx on public.personal_finances (escopo, finance_date);
