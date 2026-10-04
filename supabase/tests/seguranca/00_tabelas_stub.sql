-- Completa o stub do Supabase (../kanban/00_supabase_stub.sql) com as demais tabelas do app,
-- com as mesmas colunas de produção que as migrações e os testes usam.
do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; end $$;
create schema if not exists extensions;
grant usage on schema public, auth, extensions to service_role;
grant usage on schema extensions to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on functions to service_role;

alter table public.clients
  add column if not exists lgpd_consent boolean not null default false,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists email text,
  add column if not exists birth_date date,
  add column if not exists birthday date;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  price numeric(10,2) not null,
  commission_rate numeric(5,2) not null default 0,
  duration_minutes integer not null default 45
);
create table public.products (id uuid primary key default gen_random_uuid(), name varchar not null);
create table public.service_products (service_id uuid references public.services(id), product_id uuid references public.products(id), quantity_used numeric);
create table public.appointments (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references public.clients(id),
  professional_id uuid references public.users(id),
  service_id uuid references public.services(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  status varchar(50) default 'scheduled',
  updated_at timestamptz default now(),
  payment_method text,
  installments integer,
  notes text,
  is_block boolean default false,
  block_reason text,
  whatsapp_sent_at timestamptz,
  return_reminder_date date,
  return_reminder_sent boolean default false,
  return_reminder_sent_at timestamptz,
  is_manual_reminder boolean default false,
  is_recurring boolean default false,
  recurring_group_id text
);
create table public.transactions (id uuid primary key default gen_random_uuid(), appointment_id uuid references public.appointments(id), total_amount numeric(10,2) not null);
create table public.commissions (id uuid primary key default gen_random_uuid(), transaction_id uuid references public.transactions(id), professional_id uuid references public.users(id), amount numeric(10,2) not null);
create table public.expenses (id uuid primary key default gen_random_uuid(), amount numeric);
create table public.manual_incomes (id uuid primary key default gen_random_uuid(), amount numeric);
create table public.personal_finances (id uuid primary key default gen_random_uuid(), description text, amount numeric, finance_date date);
-- Supabase concede as tabelas a anon/authenticated/service_role por padrão; o RLS é que barra.
grant all on all tables in schema public to anon, authenticated, service_role;
