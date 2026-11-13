-- Agenda: lembrete por grupo com repetição flexível (no mês seguinte, por 2 meses, todo mês ou
-- personalizado). Antes só aceitava 1 (sem repetir) ou 24 meses; agora de 1 a 24 lembretes por cliente.
-- Só muda a validação de p_meses; o resto da função é igual à de 20261020120000.

create or replace function public.agendar_lembrete_grupo(
  p_grupo uuid,
  p_inicio timestamptz,
  p_profissional uuid default null,
  p_servico uuid default null,
  p_texto text default null,
  p_meses integer default 1
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_membro record;
  v_grupo_rec uuid;
  v_qtd integer := 0;
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  if not public.usuario_admin() then
    raise exception 'Só a administração agenda lembrete por grupo.' using errcode = '42501';
  end if;
  if p_inicio is null then
    raise exception 'Informe a data do lembrete.';
  end if;
  if p_meses is null or p_meses < 1 or p_meses > 24 then
    raise exception 'Repetição inválida.';
  end if;
  if char_length(coalesce(v_texto, '')) > 255 then
    raise exception 'Procedimento muito longo.';
  end if;
  if not exists (select 1 from public.grupos_cliente where id = p_grupo) then
    raise exception 'Grupo não encontrado.';
  end if;
  if v_texto is null and p_servico is not null then
    select nome into v_texto from public.servicos where id = p_servico;
  end if;
  for v_membro in select cliente_id from public.grupo_cliente_membros where grupo_id = p_grupo loop
    v_grupo_rec := case when p_meses > 1 then gen_random_uuid() end;
    insert into public.appointments (client_id, professional_id, servico_id, notes, start_time, end_time,
                                     status, is_block, is_manual_reminder, is_recurring, recurring_group_id)
    select v_membro.cliente_id, p_profissional, p_servico, v_texto,
           p_inicio + make_interval(months => i), p_inicio + make_interval(months => i) + interval '45 minutes',
           'scheduled', false, true, p_meses > 1, v_grupo_rec
      from generate_series(0, p_meses - 1) i;
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;
revoke all on function public.agendar_lembrete_grupo(uuid, timestamptz, uuid, uuid, text, integer) from public, anon;
grant execute on function public.agendar_lembrete_grupo(uuid, timestamptz, uuid, uuid, text, integer) to authenticated;
