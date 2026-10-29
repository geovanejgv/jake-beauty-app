-- =============================================================================
-- Fase 3 da reativação (docs/especificacoes/reativacao-clientes.md): lembretes de
-- contato. Ficam numa faixa própria da agenda, sem ocupar horário de profissional
-- (não são appointments).
--  - Só a administradora lê e grava (rotina de contato com a cliente).
--  - Autor e datas de conclusão vêm do banco.
--  - Registrar um convite para a cliente conclui sozinho os lembretes pendentes dela.
--  - Vários estabelecimentos: coluna, política restritiva e gatilho de guarda.
--  - Sem DROP, DELETE ou UPDATE de dados existentes.
-- =============================================================================

begin;

create table public.lembretes_contato (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete cascade,
  data date not null,
  hora time,
  responsavel_id uuid references public.users(id) on delete set null,
  modelo_id uuid references public.mensagem_modelos(id) on delete set null,
  observacao text check (observacao is null or char_length(observacao) <= 500),
  status text not null default 'pendente' check (status in ('pendente', 'concluido', 'cancelado')),
  concluido_em timestamptz,
  contato_id uuid references public.contatos_reativacao(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lembretes_contato_dia_idx on public.lembretes_contato (estabelecimento_id, status, data);
create index lembretes_contato_cliente_idx on public.lembretes_contato (client_id, status);

alter table public.lembretes_contato enable row level security;
revoke all on public.lembretes_contato from anon;
revoke truncate, references, trigger on public.lembretes_contato from authenticated;
create policy "lembretes_contato: select" on public.lembretes_contato for select to authenticated using (public.usuario_admin());
create policy "lembretes_contato: insert" on public.lembretes_contato for insert to authenticated with check (public.usuario_admin());
create policy "lembretes_contato: update" on public.lembretes_contato for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "lembretes_contato: delete" on public.lembretes_contato for delete to authenticated using (public.usuario_admin());
create policy "lembretes_contato: mesmo estabelecimento" on public.lembretes_contato as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));
create trigger a0_estabelecimento_guarda before insert or update or delete on public.lembretes_contato
  for each row execute function public.estabelecimento_guarda();

create or replace function public.lembretes_contato_regras()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := public.usuario_atual_id();
    new.created_at := now();
    new.status := 'pendente';
    new.concluido_em := null;
    new.contato_id := null;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.client_id := old.client_id;
    if old.status <> 'pendente' and new.status is distinct from old.status then
      raise exception 'Lembrete já concluído ou cancelado.' using errcode = 'P0001';
    end if;
    if new.status = 'concluido' and old.status = 'pendente' then
      new.concluido_em := now();
    elsif new.status <> 'concluido' then
      new.concluido_em := null;
      new.contato_id := null;
    end if;
  end if;
  new.observacao := nullif(btrim(new.observacao), '');
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.lembretes_contato_regras() from public, anon, authenticated;
create trigger a1_lembretes_contato_regras before insert or update on public.lembretes_contato
  for each row execute function public.lembretes_contato_regras();

create trigger lembretes_contato_auditoria_alteracao after insert or update on public.lembretes_contato
  for each row execute function public.auditar_alteracao_generica();
create trigger lembretes_contato_auditoria_exclusao after delete on public.lembretes_contato
  for each row execute function public.auditar_alteracao_generica();

-- Convite registrado conclui os lembretes pendentes da cliente.
create or replace function public.lembretes_contato_concluir_por_convite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.lembretes_contato
     set status = 'concluido', contato_id = new.id
   where client_id = new.client_id
     and estabelecimento_id = new.estabelecimento_id
     and status = 'pendente';
  return null;
end;
$$;
revoke execute on function public.lembretes_contato_concluir_por_convite() from public, anon, authenticated;
create trigger contatos_reativacao_conclui_lembretes after insert on public.contatos_reativacao
  for each row execute function public.lembretes_contato_concluir_por_convite();

commit;
