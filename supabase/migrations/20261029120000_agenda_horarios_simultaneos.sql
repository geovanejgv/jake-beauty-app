-- Agenda: a mesma profissional pode ter atendimentos no mesmo horário (pedido do salão:
-- procedimentos em paralelo, como uma cliente na pausa da outra). O bloqueio de horário
-- continua valendo: atendimento não entra em horário bloqueado e bloqueio não entra
-- sobre atendimento ativo. Lembretes continuam fora da agenda.

alter table public.appointments drop constraint if exists appointments_sem_conflito;

-- Usada por agendar_atendimento e remarcar_atendimento: agora só o bloqueio impede.
create or replace function public.agenda_conflito(p_profissional uuid, p_inicio timestamptz, p_fim timestamptz, p_ignorar uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 'Horário bloqueado: ' || coalesce(a.block_reason, 'bloqueio')
    from public.appointments a
   where a.professional_id = p_profissional
     and (p_ignorar is null or a.id <> p_ignorar)
     and a.is_block is true
     and coalesce(a.is_manual_reminder, false) = false
     and a.status in ('scheduled', 'confirmed', 'completed')
     and tstzrange(a.start_time, a.end_time, '[)') && tstzrange(p_inicio, p_fim, '[)')
   order by a.start_time
   limit 1;
$$;

-- Garantia final no lugar da restrição: vale também para escrita direta na tabela.
-- Atendimento x bloqueio conflita; atendimento x atendimento e bloqueio x bloqueio, não.
create or replace function public.appointments_bloqueio_guarda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conflito text;
begin
  if new.professional_id is null
     or coalesce(new.is_manual_reminder, false)
     or coalesce(new.status, 'scheduled') not in ('scheduled', 'confirmed', 'completed') then
    return new;
  end if;
  -- Mesma trava das funções de agenda: escritas simultâneas na agenda da profissional esperam.
  perform pg_advisory_xact_lock(hashtextextended('agenda:' || new.professional_id::text, 0));
  select case when a.is_block then 'Horário bloqueado: ' || coalesce(a.block_reason, 'bloqueio')
              else 'Já existe atendimento das '
                   || to_char(a.start_time at time zone 'America/Sao_Paulo', 'HH24:MI')
                   || ' às ' || to_char(a.end_time at time zone 'America/Sao_Paulo', 'HH24:MI')
                   || ' em ' || to_char(a.start_time at time zone 'America/Sao_Paulo', 'DD/MM') end
    into v_conflito
    from public.appointments a
   where a.professional_id = new.professional_id
     and a.id <> new.id
     and coalesce(a.is_manual_reminder, false) = false
     and a.status in ('scheduled', 'confirmed', 'completed')
     and coalesce(a.is_block, false) <> coalesce(new.is_block, false)
     and tstzrange(a.start_time, a.end_time, '[)') && tstzrange(new.start_time, new.end_time, '[)')
   order by a.start_time
   limit 1;
  if v_conflito is not null then
    raise exception 'Conflito de horário. %', v_conflito;
  end if;
  return new;
end;
$$;

revoke execute on function public.appointments_bloqueio_guarda() from public, anon, authenticated;

drop trigger if exists appointments_bloqueio_guarda on public.appointments;
create trigger appointments_bloqueio_guarda
  before insert or update of start_time, end_time, professional_id, status, is_block, is_manual_reminder
  on public.appointments
  for each row execute function public.appointments_bloqueio_guarda();
