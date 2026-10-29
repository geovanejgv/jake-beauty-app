-- =============================================================================
-- Fase 1 da reativação de clientes (docs/especificacoes/reativacao-clientes.md):
-- clientes_reativacao() devolve, por cliente com atendimento concluído, o último
-- atendimento (serviço, profissional, ciclo de retorno), a frequência e o valor dos
-- últimos 12 meses e o próximo agendamento.
--  - security invoker: o RLS de appointments e clients decide o que entra (hoje só
--    a administradora lê clients inteiro; a profissional recebe zero linhas).
--  - O ciclo é o MENOR retorno_dias entre os serviços feitos no dia do último
--    atendimento (servicos.retorno_dias já existe no catálogo).
--  - Só cria uma função: sem DROP, DELETE ou UPDATE.
-- =============================================================================

begin;

create or replace function public.clientes_reativacao()
returns table (
  cliente_id uuid,
  nome text,
  telefone text,
  ultimo_atendimento timestamptz,
  ultimo_servico text,
  ultimo_profissional text,
  retorno_ciclo_dias integer,
  visitas_12m integer,
  intervalo_medio_dias numeric,
  total_12m numeric,
  ticket_medio_12m numeric,
  proximo_agendamento timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with feitos as (
    select a.client_id, a.start_time, a.servico_id, a.service_id, a.professional_id,
           coalesce(a.valor_cobrado, 0) as valor,
           (a.start_time at time zone 'America/Sao_Paulo')::date as dia
      from public.appointments a
     where a.client_id is not null
       and a.status = 'completed'
       and a.start_time < now()
       and coalesce(a.is_block, false) = false
       and coalesce(a.is_manual_reminder, false) = false
  ),
  ultimo as (
    select distinct on (f.client_id) f.client_id, f.start_time, f.dia, f.servico_id, f.service_id, f.professional_id
      from feitos f
     order by f.client_id, f.start_time desc
  ),
  ciclo as (
    select f.client_id, min(s.retorno_dias) as dias
      from feitos f
      join ultimo u on u.client_id = f.client_id and u.dia = f.dia
      join public.servicos s on s.id = f.servico_id
     group by f.client_id
  ),
  dias_12m as (
    select f.client_id, f.dia, sum(f.valor) as valor
      from feitos f
     where f.start_time >= now() - interval '12 months'
     group by f.client_id, f.dia
  ),
  freq as (
    select d.client_id,
           count(*)::integer as visitas,
           sum(d.valor) as total,
           case when count(*) > 1 then round((max(d.dia) - min(d.dia))::numeric / (count(*) - 1), 1) end as intervalo
      from dias_12m d
     group by d.client_id
  ),
  futuro as (
    select a.client_id, min(a.start_time) as proximo
      from public.appointments a
     where a.client_id is not null
       and a.start_time >= now()
       and a.status in ('scheduled', 'confirmed')
       and coalesce(a.is_block, false) = false
       and coalesce(a.is_manual_reminder, false) = false
     group by a.client_id
  )
  select c.id, c.name::text, c.phone::text,
         u.start_time,
         coalesce(s.nome, sv.name::text),
         p.name::text,
         ci.dias,
         coalesce(fr.visitas, 0),
         fr.intervalo,
         coalesce(fr.total, 0),
         case when coalesce(fr.visitas, 0) > 0 then round(fr.total / fr.visitas, 2) end,
         fu.proximo
    from ultimo u
    join public.clients c on c.id = u.client_id
    left join public.servicos s on s.id = u.servico_id
    left join public.services sv on sv.id = u.service_id
    left join public.users p on p.id = u.professional_id
    left join ciclo ci on ci.client_id = u.client_id
    left join freq fr on fr.client_id = u.client_id
    left join futuro fu on fu.client_id = u.client_id;
$$;

revoke all on function public.clientes_reativacao() from public, anon;
grant execute on function public.clientes_reativacao() to authenticated;

commit;
