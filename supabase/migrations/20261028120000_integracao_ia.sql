-- =============================================================================
-- Integração opcional com IA (por pessoa, vários provedores).
-- Adaptação de docs/especificacoes/integracao-ia.md a este projeto:
--  - SPA sem servidor: a chamada ao provedor fica na Edge Function "ia", única que
--    conhece o segredo de cifra (IA_ENCRYPTION_KEY) e a chave de serviço.
--  - Recurso 100% opt-in: nenhuma tabela existente é alterada e nenhuma função
--    existente passa a depender destas. Ausência de linha em user_ai_settings é o
--    estado normal "não usa IA".
--  - Dono = perfil do estabelecimento (public.users.id, via usuario_atual_id()):
--    pessoa desativada perde o acesso na hora, como no resto do portal.
--  - Vários estabelecimentos: coluna, política restritiva e gatilho de guarda.
--
-- 1. user_ai_settings: uma linha por pessoa e provedor; no máximo uma ativa
--    (índice único parcial). A chave fica cifrada pela Edge Function (AES-256-GCM)
--    e NUNCA é legível pelo navegador: authenticated não tem select na coluna
--    api_key_encrypted (privilégio por coluna).
-- 2. ai_generations: resultado de cada uso, vinculado a cliente ou lead, com o
--    provedor e o modelo. Inclusão só pela Edge Function (chave de serviço), para a
--    marca "gerado por IA" não ser forjada; o autor lê, edita só o texto revisado e
--    a marca de revisão, e exclui.
-- 3. ai_usage_logs: data, pessoa, provedor, ação e sucesso/falha (cota e ritmo).
--    Nunca o conteúdo nem a chave. Só a Edge Function inclui; o autor lê os próprios;
--    ninguém altera nem exclui pela API (LOG-06).
--
-- Sem acesso de anon. Auditoria (só o id, nunca valores) em alteração e exclusão.
-- Sem DROP, DELETE ou UPDATE de dados existentes: só cria.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Configuração por pessoa
-- -----------------------------------------------------------------------------
create table public.user_ai_settings (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  user_id uuid not null default public.usuario_atual_id() references public.users(id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai', 'google')),
  -- v1.<iv>.<tag>.<cifra> em base64url; nunca texto puro.
  api_key_encrypted text not null
    check (api_key_encrypted ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' and char_length(api_key_encrypted) <= 2000),
  model_preference text not null check (model_preference ~ '^[A-Za-z0-9._:/-]{1,120}$'),
  is_active boolean not null default false,
  status_chave text not null default 'valida' check (status_chave in ('valida', 'invalida')),
  validada_em timestamptz,
  -- LGPD: aceite do envio de dados a este provedor (exigido na primeira ativação).
  consentimento_em timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
-- No máximo uma integração ativa por pessoa.
create unique index user_ai_settings_uma_ativa on public.user_ai_settings (user_id) where is_active;
create index user_ai_settings_estabelecimento_idx on public.user_ai_settings (estabelecimento_id);

alter table public.user_ai_settings enable row level security;

-- Uma política por operação (AUZ-04): só a própria pessoa, ativa.
create policy "user_ai_settings: select" on public.user_ai_settings for select to authenticated
  using (user_id = public.usuario_atual_id());
create policy "user_ai_settings: insert" on public.user_ai_settings for insert to authenticated
  with check (user_id = public.usuario_atual_id());
create policy "user_ai_settings: update" on public.user_ai_settings for update to authenticated
  using (user_id = public.usuario_atual_id()) with check (user_id = public.usuario_atual_id());
create policy "user_ai_settings: delete" on public.user_ai_settings for delete to authenticated
  using (user_id = public.usuario_atual_id());
create policy "user_ai_settings: mesmo estabelecimento" on public.user_ai_settings as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));

revoke all on public.user_ai_settings from anon;
revoke truncate, references, trigger on public.user_ai_settings from authenticated;
-- A coluna da chave cifrada não é lida pelo papel do navegador.
revoke select on public.user_ai_settings from authenticated;
grant select (id, estabelecimento_id, user_id, provider, model_preference, is_active, status_chave, validada_em, consentimento_em, created_at, updated_at)
  on public.user_ai_settings to authenticated;
grant insert, update, delete on public.user_ai_settings to authenticated;

create trigger a0_estabelecimento_guarda before insert or update or delete on public.user_ai_settings
  for each row execute function public.estabelecimento_guarda();

-- Dono, provedor e data do consentimento não mudam depois de gravados; updated_at sempre atualizado.
create or replace function public.user_ai_settings_regras()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.user_id := public.usuario_atual_id();
    end if;
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.provider := old.provider;
    new.consentimento_em := old.consentimento_em;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.user_ai_settings_regras() from public, anon, authenticated;
create trigger a1_user_ai_settings_regras before insert or update on public.user_ai_settings
  for each row execute function public.user_ai_settings_regras();

create trigger user_ai_settings_auditoria_alteracao after update on public.user_ai_settings
  for each row execute function public.auditar_alteracao_generica();
create trigger user_ai_settings_auditoria_exclusao after delete on public.user_ai_settings
  for each row execute function public.auditar_alteracao_generica();

-- -----------------------------------------------------------------------------
-- 2. Resultados gerados por IA
-- -----------------------------------------------------------------------------
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  funcionalidade text not null check (funcionalidade in ('triagem_lead', 'resumo_cliente')),
  provider text not null check (provider in ('anthropic', 'openai', 'google')),
  modelo text not null check (char_length(modelo) between 1 and 120),
  client_id uuid references public.clients(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  -- Parâmetros curtos do pedido, nunca o registro inteiro.
  parametros jsonb not null default '{}'::jsonb check (jsonb_typeof(parametros) = 'object' and pg_column_size(parametros) <= 16384),
  conteudo text not null check (char_length(conteudo) <= 200000),
  conteudo_editado text check (char_length(conteudo_editado) <= 200000),
  revisado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_generations_usuario_idx on public.ai_generations (user_id, created_at desc);
create index ai_generations_client_idx on public.ai_generations (client_id) where client_id is not null;
create index ai_generations_lead_idx on public.ai_generations (lead_id) where lead_id is not null;
create index ai_generations_estabelecimento_idx on public.ai_generations (estabelecimento_id);

alter table public.ai_generations enable row level security;

-- Sem política de insert: só a Edge Function (chave de serviço) inclui.
create policy "ai_generations: select" on public.ai_generations for select to authenticated
  using (user_id = public.usuario_atual_id());
create policy "ai_generations: update" on public.ai_generations for update to authenticated
  using (user_id = public.usuario_atual_id()) with check (user_id = public.usuario_atual_id());
create policy "ai_generations: delete" on public.ai_generations for delete to authenticated
  using (user_id = public.usuario_atual_id());
create policy "ai_generations: mesmo estabelecimento" on public.ai_generations as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));

revoke all on public.ai_generations from anon;
revoke truncate, references, trigger on public.ai_generations from authenticated;
-- Inclusão só pelo servidor; o autor altera apenas o texto revisado e a marca de revisão.
revoke insert, update on public.ai_generations from authenticated;
grant update (conteudo_editado, revisado_em) on public.ai_generations to authenticated;

create trigger a0_estabelecimento_guarda before insert or update or delete on public.ai_generations
  for each row execute function public.estabelecimento_guarda();

create or replace function public.ai_generations_regras()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.ai_generations_regras() from public, anon, authenticated;
create trigger a1_ai_generations_regras before update on public.ai_generations
  for each row execute function public.ai_generations_regras();

create trigger ai_generations_auditoria_alteracao after update on public.ai_generations
  for each row execute function public.auditar_alteracao_generica();
create trigger ai_generations_auditoria_exclusao after delete on public.ai_generations
  for each row execute function public.auditar_alteracao_generica();

-- -----------------------------------------------------------------------------
-- 3. Log de uso (metadados apenas)
-- -----------------------------------------------------------------------------
create table public.ai_usage_logs (
  id bigint generated always as identity primary key,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai', 'google')),
  acao text not null check (acao ~ '^[a-z_]{3,40}$'),
  sucesso boolean not null,
  codigo_erro text check (codigo_erro ~ '^[a-z_]{3,40}$'),
  modelo text check (char_length(modelo) <= 120),
  duracao_ms integer check (duracao_ms between 0 and 3600000),
  tokens_entrada integer check (tokens_entrada >= 0),
  tokens_saida integer check (tokens_saida >= 0),
  created_at timestamptz not null default now()
);
create index ai_usage_logs_usuario_idx on public.ai_usage_logs (user_id, created_at desc);
create index ai_usage_logs_estabelecimento_idx on public.ai_usage_logs (estabelecimento_id);

alter table public.ai_usage_logs enable row level security;

-- Só leitura dos próprios; sem política de insert, update e delete (só a Edge Function inclui).
create policy "ai_usage_logs: select" on public.ai_usage_logs for select to authenticated
  using (user_id = public.usuario_atual_id());
create policy "ai_usage_logs: mesmo estabelecimento" on public.ai_usage_logs as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));

revoke all on public.ai_usage_logs from anon;
revoke truncate, references, trigger on public.ai_usage_logs from authenticated;
revoke insert, update, delete on public.ai_usage_logs from authenticated;

create trigger a0_estabelecimento_guarda before insert or update or delete on public.ai_usage_logs
  for each row execute function public.estabelecimento_guarda();

commit;

-- Conferência depois de aplicar:
--   select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('user_ai_settings', 'ai_generations', 'ai_usage_logs');
--   select has_column_privilege('authenticated', 'public.user_ai_settings', 'api_key_encrypted', 'select');  -- false
--   select has_table_privilege('authenticated', 'public.ai_generations', 'insert');                          -- false
