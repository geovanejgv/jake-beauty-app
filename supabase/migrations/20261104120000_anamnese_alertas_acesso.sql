-- =============================================================================
-- Fase 4 da especificação de reativação, fichas e termos
-- (docs/especificacoes/reativacao-clientes.md): anamnese com validade e alertas no
-- agendamento, e auditoria de visualização e download (LGPD, art. 11).
--  - alertas_anamnese(clientes): última anamnese e última fotodepilação assinadas de
--    cada cliente, com a validade (campos.validadeMeses, padrão 12) e só os rótulos
--    das respostas de risco. Para a administradora ou para a profissional que atende
--    a cliente (tem ou teve agendamento com ela), mesmo sem ser a dona da ficha.
--  - ficha_registrar_acesso: grava "ficha_visualizada" ou "ficha_baixada" na trilha,
--    só para quem pode ver a ficha.
--  - Sem DROP de tabela, DELETE ou UPDATE de dados: amplia a lista de ações da trilha.
-- =============================================================================

begin;

alter table public.access_logs drop constraint if exists access_logs_acao_check;
alter table public.access_logs add constraint access_logs_acao_check check (acao in (
  'login', 'login_negado', 'logout', 'usuario_criado', 'permissao_alterada', 'alterou', 'excluiu',
  'fechamento_gerado', 'fechamento_assinado', 'fechamento_contestado', 'fechamento_cancelado',
  'pacote_vendido', 'pacote_renovado', 'pacote_anulado', 'estabelecimento_criado',
  'mfa_ativado', 'mfa_verificado', 'mfa_falhou', 'mfa_removido',
  'exportou',
  'ficha_criada', 'ficha_link_gerado', 'ficha_assinada', 'ficha_cancelada',
  'ficha_visualizada', 'ficha_baixada'
));

create or replace function public.alertas_anamnese(p_clientes uuid[])
returns table (cliente_id uuid, ficha_id uuid, tipo text, assinado_em timestamptz, valida_ate timestamptz, alertas text[])
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ultima as (
    select distinct on (f.client_id, f.tipo) f.id, f.client_id, f.tipo, f.assinado_em, f.campos, f.respostas
      from public.fichas f
     where public.usuario_ativo()
       and cardinality(p_clientes) <= 500
       and f.client_id = any(p_clientes)
       and f.estabelecimento_id = public.estabelecimento_atual()
       and f.status = 'assinada'
       and f.tipo in ('anamnese', 'fotodepilacao')
       and (public.usuario_admin()
            or f.profissional_id = public.usuario_atual_id()
            or exists (select 1 from public.appointments a
                        where a.client_id = f.client_id and a.professional_id = public.usuario_atual_id()))
     order by f.client_id, f.tipo, f.assinado_em desc
  )
  select u.client_id, u.id, u.tipo, u.assinado_em,
         u.assinado_em + make_interval(months => coalesce(nullif(u.campos ->> 'validadeMeses', '')::int, 12)),
         array(
           select (c ->> 'rotulo') || case
               when c ->> 'tipo' = 'sim_nao' and u.respostas ? ((c ->> 'id') || '__detalhe')
                 then ' (' || left(u.respostas ->> ((c ->> 'id') || '__detalhe'), 120) || ')'
               when c ->> 'tipo' in ('escolha_unica', 'escolha_multipla')
                 then ': ' || (select string_agg(o ->> 'rotulo', ', ')
                                 from jsonb_array_elements(c -> 'opcoes') o
                                where coalesce((o ->> 'alerta')::boolean, false)
                                  and (u.respostas ->> (c ->> 'id') = o ->> 'valor'
                                       or (jsonb_typeof(u.respostas -> (c ->> 'id')) = 'array' and u.respostas -> (c ->> 'id') ? (o ->> 'valor'))))
               else '' end
             from jsonb_array_elements(u.campos -> 'secoes') s, jsonb_array_elements(s -> 'campos') c
            where (c ->> 'tipo' = 'sim_nao' and c ->> 'alertaSe' = u.respostas ->> (c ->> 'id'))
               or (c ->> 'tipo' in ('escolha_unica', 'escolha_multipla') and exists (
                     select 1 from jsonb_array_elements(c -> 'opcoes') o
                      where coalesce((o ->> 'alerta')::boolean, false)
                        and (u.respostas ->> (c ->> 'id') = o ->> 'valor'
                             or (jsonb_typeof(u.respostas -> (c ->> 'id')) = 'array' and u.respostas -> (c ->> 'id') ? (o ->> 'valor')))))
         )
    from ultima u;
$$;
revoke all on function public.alertas_anamnese(uuid[]) from public, anon;
grant execute on function public.alertas_anamnese(uuid[]) to authenticated;

create or replace function public.ficha_registrar_acesso(p_ficha uuid, p_baixou boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estab uuid;
begin
  select f.estabelecimento_id into v_estab
    from public.fichas f
   where f.id = p_ficha
     and public.usuario_ativo()
     and f.estabelecimento_id = public.estabelecimento_atual()
     and (public.usuario_admin() or f.profissional_id = public.usuario_atual_id());
  if not found then
    raise exception 'Ficha não encontrada.' using errcode = 'P0001';
  end if;
  perform public.auditoria_gravar(case when p_baixou then 'ficha_baixada' else 'ficha_visualizada' end, 'fichas', p_ficha::text, null);
end;
$$;
revoke all on function public.ficha_registrar_acesso(uuid, boolean) from public, anon;
grant execute on function public.ficha_registrar_acesso(uuid, boolean) to authenticated;

commit;
