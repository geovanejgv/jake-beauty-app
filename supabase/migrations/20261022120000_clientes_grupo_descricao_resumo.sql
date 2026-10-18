-- Tela de Clientes: descrição do grupo e último/próximo atendimento por cliente.
-- 1. grupos_cliente.descricao: texto livre (opcional), editado pela administradora.
--    As políticas da tabela (só administradora, mesmo estabelecimento) já cobrem a coluna.
-- 2. resumo_atendimentos_clientes(): um registro por cliente com o último atendimento
--    passado e o próximo agendado. Roda como quem chama (security invoker): o RLS de
--    appointments decide o que entra (a profissional só conta os atendimentos dela).

alter table public.grupos_cliente
  add column descricao text check (descricao is null or char_length(descricao) <= 500);

create function public.resumo_atendimentos_clientes()
returns table (cliente_id uuid, ultimo timestamptz, proximo timestamptz)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select a.client_id,
         max(a.start_time) filter (where a.start_time < now() and a.status in ('scheduled', 'confirmed', 'completed')),
         min(a.start_time) filter (where a.start_time >= now() and a.status in ('scheduled', 'confirmed'))
    from public.appointments a
   where a.client_id is not null
     and coalesce(a.is_block, false) = false
     and coalesce(a.is_manual_reminder, false) = false
   group by a.client_id;
$$;

revoke all on function public.resumo_atendimentos_clientes() from public, anon;
grant execute on function public.resumo_atendimentos_clientes() to authenticated;
