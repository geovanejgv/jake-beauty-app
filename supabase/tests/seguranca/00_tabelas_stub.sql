-- Completa o stub do Supabase (../kanban/00_supabase_stub.sql) com as demais tabelas do app,
-- no formato mínimo que as migrações e os testes de segurança usam.
do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; end $$;
grant usage on schema public, auth to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on functions to service_role;
create table public.services (id uuid primary key default gen_random_uuid(), name varchar not null, price numeric);
create table public.products (id uuid primary key default gen_random_uuid(), name varchar not null);
create table public.service_products (service_id uuid, product_id uuid, quantity_used numeric);
create table public.appointments (id uuid primary key default gen_random_uuid(), client_id uuid, start_time timestamptz);
create table public.transactions (id uuid primary key default gen_random_uuid(), total_amount numeric);
create table public.commissions (id uuid primary key default gen_random_uuid(), amount numeric);
create table public.expenses (id uuid primary key default gen_random_uuid(), amount numeric);
create table public.manual_incomes (id uuid primary key default gen_random_uuid(), amount numeric);
create table public.personal_finances (id uuid primary key default gen_random_uuid(), description text, amount numeric, finance_date date);
-- Supabase concede as tabelas a anon/authenticated/service_role por padrão; o RLS é que barra.
grant all on all tables in schema public to anon, authenticated, service_role;
