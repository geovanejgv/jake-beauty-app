-- =============================================================================
-- Segurança: liga o RLS nas tabelas que estavam abertas para a chave pública
--
-- Antes: as 11 tabelas abaixo não tinham RLS. A chave "publishable" do Supabase
-- fica no código do site (é pública por natureza), então qualquer pessoa podia
-- ler, alterar e apagar clientes, agenda e finanças sem fazer login.
--
-- Depois: só usuários logados (role "authenticated") acessam essas tabelas; quem
-- não está logado (role "anon") não lê nem grava nada. O app continua igual,
-- porque todas as telas que usam essas tabelas já exigem login.
-- =============================================================================

begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'appointments', 'clients', 'commissions', 'expenses', 'manual_incomes', 'personal_finances',
    'products', 'service_products', 'services', 'transactions', 'users'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || ': acesso de usuários logados') then
      execute format(
        'create policy %I on public.%I for all to authenticated using (true) with check (true)',
        t || ': acesso de usuários logados', t
      );
    end if;
  end loop;
end;
$$;

commit;
