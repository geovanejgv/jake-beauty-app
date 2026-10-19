-- Comissão vigente nos atendimentos em aberto.
--
-- Antes, o percentual era copiado para o atendimento só no agendamento: mudar a comissão
-- do profissional (taxa fixa do perfil, comissão do vínculo ou base do serviço) não valia
-- para atendimentos já marcados ou concluídos, que seguiam com o valor antigo (muitas vezes 0%).
--
-- Agora, enquanto o atendimento não entra em fechamento ativo, ele segue a regra atual:
-- 1. ao concluir (ou trocar profissional/serviço), o banco grava a comissão vigente;
-- 2. ao mudar a configuração, os atendimentos em aberto daquele profissional/serviço são
--    recalculados. Fechados, cancelados e sessões de pacote (comissão do pacote) não mudam.
-- Regra igual à de servico_condicoes: vínculo; senão taxa fixa do perfil; senão base do serviço; senão 0.

create or replace function public.comissao_vigente(p_profissional uuid, p_servico uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select us.comissao_percentual from public.usuario_servico us where us.user_id = p_profissional and us.servico_id = p_servico),
    (select pp.comissao_padrao_percentual from public.perfis_profissionais pp where pp.user_id = p_profissional),
    (select s.comissao_base_percentual from public.servicos s where s.id = p_servico),
    0);
$$;
revoke execute on function public.comissao_vigente(uuid, uuid) from public, anon, authenticated;

-- Recalcula os atendimentos em aberto (sem fechamento ativo, fora de pacote, não cancelados).
create or replace function public.recalcular_comissoes_abertas(p_profissional uuid, p_servico uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qtd integer;
begin
  perform set_config('app.agenda_rpc', 'on', true);
  update public.appointments a
     set comissao_percentual = public.comissao_vigente(a.professional_id, a.servico_id)
   where a.professional_id is not null
     and (p_profissional is null or a.professional_id = p_profissional)
     and (p_servico is null or a.servico_id = p_servico)
     and a.pacote_item_id is null
     and a.status <> 'cancelled'
     and coalesce(a.is_block, false) = false
     and coalesce(a.is_manual_reminder, false) = false
     and a.comissao_percentual is distinct from public.comissao_vigente(a.professional_id, a.servico_id)
     and not exists (select 1 from public.fechamento_itens i join public.fechamentos f on f.id = i.fechamento_id
                      where i.agendamento_id = a.id and f.status <> 'cancelado');
  get diagnostics v_qtd = row_count;
  perform set_config('app.agenda_rpc', 'off', true);
  return v_qtd;
end;
$$;
revoke execute on function public.recalcular_comissoes_abertas(uuid, uuid) from public, anon, authenticated;

-- 1. Atendimento: ao concluir ou trocar profissional/serviço, grava a comissão vigente.
-- Roda depois de appointments_a_protecao (ordem alfabética), que já barrou o profissional
-- de mexer em valores, e de appointments_b_pacote, que cuida das sessões de pacote.
create or replace function public.appointments_comissao_vigente()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.pacote_item_id is not null or new.professional_id is null
     or coalesce(new.is_block, false) or coalesce(new.is_manual_reminder, false) then
    return new;
  end if;
  if (new.status = 'completed' and old.status is distinct from 'completed')
     or new.professional_id is distinct from old.professional_id
     or new.servico_id is distinct from old.servico_id then
    new.comissao_percentual := public.comissao_vigente(new.professional_id, new.servico_id);
  end if;
  return new;
end;
$$;
revoke execute on function public.appointments_comissao_vigente() from public, anon, authenticated;

drop trigger if exists appointments_c_comissao on public.appointments;
create trigger appointments_c_comissao
  before update on public.appointments
  for each row execute function public.appointments_comissao_vigente();

-- 2. Configuração: mudar a comissão recalcula os atendimentos em aberto.
create or replace function public.comissao_config_alterada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'perfis_profissionais' then
    if tg_op = 'INSERT' or new.comissao_padrao_percentual is distinct from old.comissao_padrao_percentual then
      perform public.recalcular_comissoes_abertas(new.user_id, null);
    end if;
  elsif tg_table_name = 'usuario_servico' then
    if tg_op = 'DELETE' then
      perform public.recalcular_comissoes_abertas(old.user_id, old.servico_id);
      return old;
    end if;
    if tg_op = 'INSERT' or new.comissao_percentual is distinct from old.comissao_percentual then
      perform public.recalcular_comissoes_abertas(new.user_id, new.servico_id);
    end if;
  elsif tg_table_name = 'servicos' then
    if new.comissao_base_percentual is distinct from old.comissao_base_percentual then
      perform public.recalcular_comissoes_abertas(null, new.id);
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.comissao_config_alterada() from public, anon, authenticated;

drop trigger if exists perfis_profissionais_comissao on public.perfis_profissionais;
create trigger perfis_profissionais_comissao
  after insert or update of comissao_padrao_percentual on public.perfis_profissionais
  for each row execute function public.comissao_config_alterada();

drop trigger if exists usuario_servico_comissao on public.usuario_servico;
create trigger usuario_servico_comissao
  after insert or update of comissao_percentual or delete on public.usuario_servico
  for each row execute function public.comissao_config_alterada();

drop trigger if exists servicos_comissao on public.servicos;
create trigger servicos_comissao
  after update of comissao_base_percentual on public.servicos
  for each row execute function public.comissao_config_alterada();

-- 3. Acerta os atendimentos em aberto já gravados com a comissão antiga.
select public.recalcular_comissoes_abertas(null, null);
