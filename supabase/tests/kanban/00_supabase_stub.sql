-- Simula o mínimo do Supabase (roles anon/authenticated, auth.uid() e tabelas users/clients) para testar a migração localmente.
do $$ begin if not exists (select 1 from pg_roles where rolname=$q$anon$q$) then create role anon nologin; create role authenticated nologin; end if; end $$;
create extension if not exists "uuid-ossp"; create extension if not exists pgcrypto;
create schema auth;
create table auth.users (id uuid primary key, email text);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
create type public.user_role as enum ('admin','professional');
create table public.users (id uuid primary key default uuid_generate_v4(), auth_id uuid, name varchar not null, role user_role not null, active boolean default true, created_at timestamptz default now());
create table public.clients (id uuid primary key default uuid_generate_v4(), name varchar not null, phone varchar not null, created_at timestamptz default now());
insert into auth.users values ('11111111-1111-1111-1111-111111111111','geovanedejesus.ti@gmail.com'),('22222222-2222-2222-2222-222222222222','jake@studio.com');
insert into public.clients(id,name,phone) values ('c0000000-0000-0000-0000-000000000001','Carla','1');
