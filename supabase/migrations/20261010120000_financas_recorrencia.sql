-- Finanças: lançamentos mensais recorrentes.
-- Ao salvar um lançamento recorrente, o app cria os próximos meses de uma vez (cada mês pode ser
-- baixado separadamente). recurring_group_id liga os meses da mesma série, para editar ou excluir
-- "este e os próximos".
alter table public.personal_finances add column if not exists recurring_group_id uuid;

create index if not exists personal_finances_recurring_group_idx
  on public.personal_finances (recurring_group_id, finance_date)
  where recurring_group_id is not null;
