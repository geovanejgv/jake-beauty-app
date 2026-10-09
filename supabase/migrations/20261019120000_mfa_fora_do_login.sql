-- =============================================================================
-- Verificação em duas etapas fora do login (decisão do usuário em 2026-10-09).
--
-- APLICADA em produção em 2026-10-09 (migração mfa_fora_do_login), com autorização
-- explícita do usuário (DEV-02), ANTES do merge da tela que não pede mais o código.
--
-- Antes: quem tinha autenticador ativo não via nenhum dado com a sessão aal1 (as
-- funções de sessão conferiam mfa_pendente()), e a tela pedia o código logo depois
-- do Google (M-06 da especificação de login).
-- Agora: o login é só pelo Google. O código do autenticador é pedido apenas nas ações
-- administrativas, que continuam exigindo aal2 no banco (AUT-04, sem mudança):
--   - papel, status, vínculo de login e nova administradora (gatilho users_b_exige_mfa);
--   - logs de acesso (política de access_logs);
--   - administração global (eh_admin_global) e exclusão de estabelecimento (mfa_recente);
--   - Edge Function admin-usuarios (confere sessao_aal2).
-- As funções de sessão voltam a ser as da migração 20261017120000.
-- mfa_pendente() fica no banco (sem uso nas funções de sessão), para a tela consultar.
-- =============================================================================

begin;

create or replace function public.estabelecimento_atual()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.estabelecimento_id
    from public.users u
    join public.estabelecimentos e on e.id = u.estabelecimento_id and e.status = 'ativo'
   where u.auth_id = auth.uid() and u.active is true
   limit 1;
$$;

create or replace function public.usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
      join public.estabelecimentos e on e.id = u.estabelecimento_id and e.status = 'ativo'
     where u.auth_id = auth.uid() and u.active is true);
$$;

create or replace function public.usuario_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
      join public.estabelecimentos e on e.id = u.estabelecimento_id and e.status = 'ativo'
     where u.auth_id = auth.uid() and u.active is true and u.role = 'admin');
$$;

create or replace function public.usuario_atual_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id from public.users u
    join public.estabelecimentos e on e.id = u.estabelecimento_id and e.status = 'ativo'
   where u.auth_id = auth.uid() and u.active is true
   limit 1;
$$;

commit;
