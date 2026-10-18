-- =============================================================================
-- Backup em planilha (.xlsx): registro na auditoria e aviso mensal.
-- A planilha é montada no navegador com dados que a administradora já lê pelo RLS;
-- o banco é quem libera o arquivo: registrar_backup() exige administradora ativa
-- com o segundo fator confirmado na sessão (aal2) e grava a exportação na trilha
-- (access_logs, ação "exportou", entidade "backup_<tipo>"). A tela só entrega o
-- arquivo depois que esse registro é aceito.
-- ultimos_backups(): data do último backup de cada tipo no estabelecimento, para o
-- aviso "Backup mensal pendente" (não exige aal2: só datas, sem dado pessoal).
-- Envio automático por e-mail fica para depois (Edge Function + segredos: pendência
-- humana em docs/seguranca/pendencias-humanas.md).
-- Sem DROP de dados: a restrição de ações da auditoria é recriada com a ação nova.
-- =============================================================================

begin;

alter table public.access_logs drop constraint if exists access_logs_acao_check;
alter table public.access_logs add constraint access_logs_acao_check check (acao in (
  'login', 'login_negado', 'logout', 'usuario_criado', 'permissao_alterada', 'alterou', 'excluiu',
  'fechamento_gerado', 'fechamento_assinado', 'fechamento_contestado', 'fechamento_cancelado',
  'pacote_vendido', 'pacote_renovado', 'pacote_anulado', 'estabelecimento_criado',
  'mfa_ativado', 'mfa_verificado', 'mfa_falhou', 'mfa_removido',
  'exportou'
));

create or replace function public.registrar_backup(p_tipo text, p_linhas integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.usuario_admin() then
    raise exception 'Só a administração faz backup.' using errcode = '42501';
  end if;
  if not public.sessao_aal2() then
    raise exception 'Confirme o código do autenticador para fazer o backup.';
  end if;
  if p_tipo is null or p_tipo not in ('clientes', 'agenda', 'financeiro', 'leads') then
    raise exception 'Tipo de backup inválido.';
  end if;
  if p_linhas is null or p_linhas < 0 or p_linhas > 1000000 then
    raise exception 'Backup inválido.';
  end if;
  perform public.auditoria_gravar('exportou', 'backup_' || p_tipo, null, jsonb_build_object('linhas', p_linhas));
end;
$$;

create or replace function public.ultimos_backups()
returns table (tipo text, ultimo timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select substr(l.entidade, 8) as tipo, max(l.created_at) as ultimo
    from public.access_logs l
   where public.usuario_admin()
     and l.estabelecimento_id = public.estabelecimento_atual()
     and l.acao = 'exportou'
     and l.entidade like 'backup\_%'
   group by l.entidade;
$$;

revoke all on function public.registrar_backup(text, integer) from public, anon;
revoke all on function public.ultimos_backups() from public, anon;
grant execute on function public.registrar_backup(text, integer) to authenticated;
grant execute on function public.ultimos_backups() to authenticated;

commit;
