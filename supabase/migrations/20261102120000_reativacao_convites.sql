-- =============================================================================
-- Fase 2 da reativação (docs/especificacoes/reativacao-clientes.md): convite
-- assistido por WhatsApp (link wa.me), registro do envio e do resultado.
--  - clients.nao_quer_contato: a cliente que pediu para sair não recebe convite
--    (o banco recusa o registro; a tela nem abre o envio).
--  - mensagem_modelos: textos editáveis pela administradora, um padrão por salão.
--  - contatos_reativacao: prova do contato (quem, quando, texto). Pela tela só se
--    cria o envio e se muda o resultado; autor, data e canal vêm do banco.
--  - Agendamento criado até 30 dias depois do convite marca "agendou" sozinho.
--  - Só a administradora lê e grava (contato de cliente, como em clients).
--  - Vários estabelecimentos: coluna, política restritiva e gatilho de guarda.
--  - Sem DROP, DELETE ou UPDATE de dados existentes.
-- =============================================================================

begin;

-- 1. Cliente que não quer contato
alter table public.clients
  add column if not exists nao_quer_contato boolean not null default false,
  add column if not exists nao_quer_contato_em timestamptz;

-- 2. Modelos de mensagem
create table public.mensagem_modelos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 2 and 60),
  texto text not null check (char_length(btrim(texto)) between 5 and 1000),
  padrao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index mensagem_modelos_um_padrao on public.mensagem_modelos (estabelecimento_id) where padrao;
create index mensagem_modelos_estabelecimento_idx on public.mensagem_modelos (estabelecimento_id);

alter table public.mensagem_modelos enable row level security;
revoke all on public.mensagem_modelos from anon;
create policy "mensagem_modelos: select" on public.mensagem_modelos for select to authenticated using (public.usuario_admin());
create policy "mensagem_modelos: insert" on public.mensagem_modelos for insert to authenticated with check (public.usuario_admin());
create policy "mensagem_modelos: update" on public.mensagem_modelos for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "mensagem_modelos: delete" on public.mensagem_modelos for delete to authenticated using (public.usuario_admin());
create policy "mensagem_modelos: mesmo estabelecimento" on public.mensagem_modelos as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));
create trigger a0_estabelecimento_guarda before insert or update or delete on public.mensagem_modelos
  for each row execute function public.estabelecimento_guarda();

create or replace function public.mensagem_modelos_regras()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.nome := btrim(new.nome);
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := now(); else new.created_at := old.created_at; end if;
  -- Um padrão por salão: marcar este desmarca o anterior.
  if new.padrao then
    update public.mensagem_modelos set padrao = false
     where estabelecimento_id = new.estabelecimento_id and padrao and id <> new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.mensagem_modelos_regras() from public, anon, authenticated;
create trigger a1_mensagem_modelos_regras before insert or update on public.mensagem_modelos
  for each row execute function public.mensagem_modelos_regras();

-- 3. Contatos de reativação
create table public.contatos_reativacao (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete cascade,
  enviado_em timestamptz not null default now(),
  enviado_por uuid references public.users(id) on delete set null,
  canal text not null default 'whatsapp_link' check (canal in ('whatsapp_link', 'whatsapp_api')),
  modelo_id uuid references public.mensagem_modelos(id) on delete set null,
  texto_enviado text not null check (char_length(btrim(texto_enviado)) between 5 and 2000),
  resultado text not null default 'enviado'
    check (resultado in ('enviado', 'respondeu', 'agendou', 'sem_resposta', 'nao_quer', 'numero_errado')),
  resultado_em timestamptz,
  agendamento_id uuid references public.appointments(id) on delete set null
);
create index contatos_reativacao_cliente_idx on public.contatos_reativacao (client_id, enviado_em desc);
create index contatos_reativacao_estabelecimento_idx on public.contatos_reativacao (estabelecimento_id, enviado_em desc);

alter table public.contatos_reativacao enable row level security;
revoke all on public.contatos_reativacao from anon;
revoke truncate, references, trigger on public.contatos_reativacao from authenticated;
create policy "contatos_reativacao: select" on public.contatos_reativacao for select to authenticated using (public.usuario_admin());
create policy "contatos_reativacao: insert" on public.contatos_reativacao for insert to authenticated with check (public.usuario_admin());
create policy "contatos_reativacao: update" on public.contatos_reativacao for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "contatos_reativacao: delete" on public.contatos_reativacao for delete to authenticated using (public.usuario_admin());
create policy "contatos_reativacao: mesmo estabelecimento" on public.contatos_reativacao as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));
create trigger a0_estabelecimento_guarda before insert or update or delete on public.contatos_reativacao
  for each row execute function public.estabelecimento_guarda();

-- Regras: autor, data e canal vêm do banco; depois de enviado só muda o resultado.
-- "nao_quer" marca a cliente; "numero_errado" e os demais só registram.
create or replace function public.contatos_reativacao_regras()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.clients c where c.id = new.client_id and c.nao_quer_contato) then
      raise exception 'Esta cliente pediu para não receber contato.' using errcode = 'P0001';
    end if;
    new.enviado_por := public.usuario_atual_id();
    new.enviado_em := now();
    new.canal := 'whatsapp_link';
    new.texto_enviado := btrim(new.texto_enviado);
    new.resultado := 'enviado';
    new.resultado_em := null;
    new.agendamento_id := null;
  else
    if (new.estabelecimento_id, new.client_id, new.enviado_em, new.enviado_por, new.canal, new.modelo_id, new.texto_enviado)
       is distinct from
       (old.estabelecimento_id, old.client_id, old.enviado_em, old.enviado_por, old.canal, old.modelo_id, old.texto_enviado) then
      raise exception 'O convite enviado não pode ser alterado; só o resultado.' using errcode = 'P0001';
    end if;
    if new.resultado is distinct from old.resultado then
      new.resultado_em := now();
      if new.resultado <> 'agendou' then new.agendamento_id := null; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.contatos_reativacao_regras() from public, anon, authenticated;
create trigger a1_contatos_reativacao_regras before insert or update on public.contatos_reativacao
  for each row execute function public.contatos_reativacao_regras();

create or replace function public.contatos_reativacao_nao_quer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.resultado = 'nao_quer' and old.resultado is distinct from 'nao_quer' then
    update public.clients set nao_quer_contato = true, nao_quer_contato_em = now()
     where id = new.client_id and not nao_quer_contato;
  end if;
  return null;
end;
$$;
revoke execute on function public.contatos_reativacao_nao_quer() from public, anon, authenticated;
create trigger contatos_reativacao_nao_quer after update on public.contatos_reativacao
  for each row execute function public.contatos_reativacao_nao_quer();

create trigger contatos_reativacao_auditoria_alteracao after insert or update on public.contatos_reativacao
  for each row execute function public.auditar_alteracao_generica();
create trigger contatos_reativacao_auditoria_exclusao after delete on public.contatos_reativacao
  for each row execute function public.auditar_alteracao_generica();

-- 4. Reativação automática: atendimento criado até 30 dias depois do convite vira "agendou".
create or replace function public.contatos_reativacao_agendou()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.client_id is null or coalesce(new.is_block, false) or coalesce(new.is_manual_reminder, false)
     or new.status not in ('scheduled', 'confirmed', 'completed') then
    return null;
  end if;
  update public.contatos_reativacao c
     set resultado = 'agendou', agendamento_id = new.id, resultado_em = now()
   where c.id = (
     select x.id from public.contatos_reativacao x
      where x.client_id = new.client_id
        and x.estabelecimento_id = new.estabelecimento_id
        and x.resultado in ('enviado', 'respondeu', 'sem_resposta')
        and x.enviado_em >= now() - interval '30 days'
      order by x.enviado_em desc
      limit 1);
  return null;
end;
$$;
revoke execute on function public.contatos_reativacao_agendou() from public, anon, authenticated;
create trigger appointments_reativacao_agendou after insert on public.appointments
  for each row execute function public.contatos_reativacao_agendou();

commit;
