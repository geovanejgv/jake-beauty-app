-- =============================================================================
-- Leads: funil da possível cliente, do primeiro contato até virar cliente.
-- Adaptação de docs/especificacoes (aba Leads do Portallaw) a este projeto:
--  - SPA sem servidor: as regras ficam no banco (CHECK, gatilho e RLS), não em API.
--  - Só a administradora vê e mexe (contato de possível cliente é base do salão,
--    mesma cautela do contato de clientes); a profissional não acessa (AUZ-07).
--  - Telefone e e-mail em texto, protegidos pelo RLS, como em clients: cifrar exige
--    chave fora do banco e Edge Function (pendência CRI-04, decisão humana).
--  - Vários estabelecimentos: coluna, política restritiva e gatilho de guarda.
--  - Sem DROP, DELETE ou UPDATE de dados existentes: só cria.
-- =============================================================================

begin;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 2 and 200),
  telefone text check (char_length(telefone) <= 30 and telefone ~ '^[0-9 ()+.-]*$'),
  email text check (char_length(email) <= 200 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  origem text check (origem in ('indicacao', 'instagram', 'site', 'google', 'whatsapp', 'evento', 'outro')),
  interesse text check (char_length(interesse) <= 80),
  resumo text check (char_length(resumo) <= 4000),
  etapa text not null default 'novo'
    check (etapa in ('novo', 'contato', 'consulta', 'proposta', 'negociacao', 'fechado', 'perdido')),
  valor_estimado numeric(14,2) check (valor_estimado between 0 and 10000000000),
  proxima_acao text check (char_length(proxima_acao) <= 300),
  proxima_acao_em date,
  motivo_perda text check (char_length(motivo_perda) <= 500),
  responsavel_id uuid references public.users(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  fechado_em timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_estabelecimento_etapa_idx on public.leads (estabelecimento_id, etapa);
create index leads_client_idx on public.leads (client_id);

alter table public.leads enable row level security;
revoke all on public.leads from anon;

-- Uma política por operação (AUZ-04): só a administradora ativa.
create policy "leads: select" on public.leads for select to authenticated using (public.usuario_admin());
create policy "leads: insert" on public.leads for insert to authenticated with check (public.usuario_admin());
create policy "leads: update" on public.leads for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "leads: delete" on public.leads for delete to authenticated using (public.usuario_admin());
create policy "leads: mesmo estabelecimento" on public.leads as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));

-- Guarda do estabelecimento: responsável e cliente vinculados precisam ser do mesmo salão.
create trigger a0_estabelecimento_guarda before insert or update or delete on public.leads
  for each row execute function public.estabelecimento_guarda();

-- Regras do funil gravadas pelo banco (não dependem da tela):
--  - quem criou e, sem responsável informado, a própria pessoa como responsável;
--  - entrar em "fechado" grava a data; sair limpa;
--  - motivo da perda só existe na etapa "perdido";
--  - updated_at sempre atualizado.
create or replace function public.leads_regras()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := public.usuario_atual_id();
    new.responsavel_id := coalesce(new.responsavel_id, new.created_by);
    new.created_at := now();
    new.fechado_em := case when new.etapa = 'fechado' then now() end;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.etapa is distinct from old.etapa then
      new.fechado_em := case when new.etapa = 'fechado' then now() end;
    else
      new.fechado_em := old.fechado_em;
    end if;
  end if;
  if new.etapa <> 'perdido' then
    new.motivo_perda := null;
  end if;
  new.nome := btrim(new.nome);
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.leads_regras() from public, anon, authenticated;

create trigger a1_leads_regras before insert or update on public.leads
  for each row execute function public.leads_regras();

-- Trilha de auditoria (LOG-05): criação, alteração e exclusão, só com o id (LOG-04).
create trigger leads_auditoria_alteracao after insert or update on public.leads
  for each row execute function public.auditar_alteracao_generica();
create trigger leads_auditoria_exclusao after delete on public.leads
  for each row execute function public.auditar_alteracao_generica();

commit;
