-- Só nos testes: as inserções feitas sem sessão (montagem dos cenários, como superusuário)
-- caem no Studio Labeli. Em produção o padrão é só o estabelecimento da sessão; sem
-- sessão o servidor precisa informar o estabelecimento (a coluna é obrigatória).
do $$
declare
  t text;
begin
  for t in select c.table_name from information_schema.columns c
            where c.table_schema = 'public' and c.column_name = 'estabelecimento_id'
              and c.table_name in (select tablename from pg_tables where schemaname = 'public')
  loop
    execute format(
      'alter table public.%I alter column estabelecimento_id set default '
      'coalesce(public.estabelecimento_atual(), %L::uuid)', t, '5a1ab0e1-0000-4000-8000-000000000001');
  end loop;
end;
$$;
