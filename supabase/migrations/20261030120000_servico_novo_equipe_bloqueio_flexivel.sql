-- Pedido do salão:
-- 1) Serviço novo do catálogo já aparece para a equipe escolher: nasce habilitado para
--    todas as pessoas ativas do estabelecimento (a administradora desabilita depois, por
--    profissional, em Serviços > Por profissional). Serviço que nunca foi habilitado para
--    ninguém (cadastrado antes desta regra) recebe o mesmo tratamento.
-- 2) Horário bloqueado não impede mais o atendimento: a tela avisa e pede confirmação.
--    Bloqueio sobre atendimento também passa a ser permitido (mesma regra nos dois sentidos).

-- -----------------------------------------------------------------------------
-- 1. Serviço novo habilitado para a equipe
-- -----------------------------------------------------------------------------
create or replace function public.servico_novo_habilita_equipe()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Só o mesmo estabelecimento do serviço; o vínculo guarda só "ativo" (preço, tempo e
  -- comissão continuam vindo do serviço até a administradora ajustar).
  insert into public.usuario_servico (user_id, servico_id, ativo, estabelecimento_id)
  select u.id, new.id, true, new.estabelecimento_id
    from public.users u
   where u.estabelecimento_id = new.estabelecimento_id
     and u.active is true
  on conflict (user_id, servico_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.servico_novo_habilita_equipe() from public, anon, authenticated;

drop trigger if exists servico_novo_habilita_equipe on public.servicos;
create trigger servico_novo_habilita_equipe
  after insert on public.servicos
  for each row execute function public.servico_novo_habilita_equipe();

-- Serviços já cadastrados sem nenhum vínculo (ninguém conseguia escolher).
insert into public.usuario_servico (user_id, servico_id, ativo, estabelecimento_id)
select u.id, s.id, true, s.estabelecimento_id
  from public.servicos s
  join public.users u on u.estabelecimento_id = s.estabelecimento_id and u.active is true
 where not exists (select 1 from public.usuario_servico us where us.servico_id = s.id)
on conflict (user_id, servico_id) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Bloqueio de horário deixa de impedir atendimento
-- -----------------------------------------------------------------------------
-- Mantida (agendar_atendimento e remarcar_atendimento a consultam), sem conflito a apontar.
create or replace function public.agenda_conflito(p_profissional uuid, p_inicio timestamptz, p_fim timestamptz, p_ignorar uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select null::text;
$$;

drop trigger if exists appointments_bloqueio_guarda on public.appointments;
drop function if exists public.appointments_bloqueio_guarda();
