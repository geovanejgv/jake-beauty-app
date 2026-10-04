-- =============================================================================
-- Módulo Kanban de tarefas (adaptado da especificação "especificacao-kanban.md")
--
-- Adaptações para este projeto (Studio Labeli / Jake Beauty):
--   * Um único estúdio: não há multiempresa, então não existe escritorio_id.
--     O acesso fica restrito a usuários autenticados (role "authenticated").
--   * A tabela public.users (id, auth_id, name, role, active) faz o papel de
--     "profiles": responsável, envolvidos e "quem criou" apontam para ela.
--   * Sem processos, agenda jurídica e prazos: case_id, agenda_event_id e as
--     partes de evento/prazo foram removidas. client_id foi mantido para ligar
--     uma tarefa a uma cliente do estúdio.
--   * O app não tem servidor próprio (Vite + Supabase). As operações com mais
--     de um passo (quadros, colunas e reordenação) são funções no banco, com as
--     mesmas validações da API descrita na especificação. Quadros e colunas só
--     mudam por essas funções; cartões e sub-itens são gravados direto, com RLS
--     e restrições (check) garantindo os limites.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Pessoas: liga cada login (auth.users) a uma linha de public.users
-- -----------------------------------------------------------------------------
create unique index if not exists users_auth_id_key on public.users (auth_id) where auth_id is not null;

-- Devolve o id em public.users do usuário logado, criando a linha no primeiro acesso.
create or replace function public.kanban_usuario_atual()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;

  select id into v_id from public.users where auth_id = auth.uid();
  if v_id is not null then
    return v_id;
  end if;

  select email into v_email from auth.users where id = auth.uid();
  insert into public.users (auth_id, name, role, active)
  values (
    auth.uid(),
    coalesce(nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Usuário'),
    case when exists (select 1 from public.users where role = 'admin') then 'professional'::user_role else 'admin'::user_role end,
    true
  )
  on conflict (auth_id) where auth_id is not null do nothing;

  select id into v_id from public.users where auth_id = auth.uid();
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table public.kanban_quadros (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 30),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index kanban_quadros_created_idx on public.kanban_quadros (created_at);

-- Colunas de cada quadro (posição 1..n; primeira e última são fixas)
create table public.kanban_colunas (
  id uuid primary key default gen_random_uuid(),
  quadro_id uuid not null references public.kanban_quadros(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 25),
  posicao integer not null check (posicao between 1 and 20),
  created_at timestamptz not null default now()
);
create index kanban_colunas_quadro_idx on public.kanban_colunas (quadro_id, posicao);

-- Cartões (tarefas). O status é derivado da coluna por gatilho.
create table public.internal_tasks (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(titulo) between 1 and 200),
  responsible_id uuid not null references public.users(id),
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluida')),
  data_limite date,
  client_id uuid references public.clients(id) on delete set null,
  descricao text check (descricao is null or char_length(descricao) <= 4000), -- "Observação"
  criticidade text not null default 'normal' check (criticidade in ('normal', 'urgente', 'critico')),
  ordem integer not null default 0,
  coluna_id uuid not null references public.kanban_colunas(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  envolvidos uuid[] not null default '{}' check (cardinality(envolvidos) <= 20),
  concluida_em timestamptz,
  cancelada_em timestamptz,
  created_at timestamptz not null default now()
);
create index internal_tasks_coluna_idx on public.internal_tasks (coluna_id, ordem);
create index internal_tasks_envolvidos_idx on public.internal_tasks using gin (envolvidos);
create index internal_tasks_responsible_idx on public.internal_tasks (responsible_id);

-- Sub-itens (checklist) de cada cartão
create table public.tarefa_itens (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.internal_tasks(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 200),
  concluido boolean not null default false,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index tarefa_itens_task_idx on public.tarefa_itens (task_id, ordem, created_at);

-- -----------------------------------------------------------------------------
-- RLS: só usuários autenticados. Quadros e colunas são somente leitura direta;
-- alterações passam pelas funções kanban_* abaixo.
-- -----------------------------------------------------------------------------
alter table public.kanban_quadros enable row level security;
alter table public.kanban_colunas enable row level security;
alter table public.internal_tasks enable row level security;
alter table public.tarefa_itens enable row level security;

revoke all on public.kanban_quadros, public.kanban_colunas, public.internal_tasks, public.tarefa_itens from anon;

create policy "kanban_quadros: select" on public.kanban_quadros for select to authenticated using (true);
create policy "kanban_colunas: select" on public.kanban_colunas for select to authenticated using (true);

create policy "internal_tasks: select" on public.internal_tasks for select to authenticated using (true);
create policy "internal_tasks: insert" on public.internal_tasks for insert to authenticated with check (true);
create policy "internal_tasks: update" on public.internal_tasks for update to authenticated using (true) with check (true);
create policy "internal_tasks: delete" on public.internal_tasks for delete to authenticated using (true);

create policy "tarefa_itens: select" on public.tarefa_itens for select to authenticated using (true);
create policy "tarefa_itens: insert" on public.tarefa_itens for insert to authenticated with check (true);
create policy "tarefa_itens: update" on public.tarefa_itens for update to authenticated using (true) with check (true);
create policy "tarefa_itens: delete" on public.tarefa_itens for delete to authenticated using (true);

-- -----------------------------------------------------------------------------
-- Gatilhos dos cartões
-- -----------------------------------------------------------------------------

-- Inserção: cartão novo vai para o fim da coluna e grava quem criou.
-- Atualização: "quem criou" e a data de criação não mudam.
create or replace function public.internal_tasks_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('kanban_coluna:' || new.coluna_id::text));
    select coalesce(max(ordem), -1) + 1 into new.ordem from public.internal_tasks where coluna_id = new.coluna_id;
    new.created_by := (select id from public.users where auth_id = auth.uid());
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger internal_tasks_a_defaults
  before insert or update on public.internal_tasks
  for each row execute function public.internal_tasks_defaults();

-- Envolvidos: sem repetição e só pessoas cadastradas.
create or replace function public.internal_tasks_envolvidos_validos()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.envolvidos := coalesce((select array_agg(distinct e) from unnest(new.envolvidos) e), '{}');
  if exists (
    select 1 from unnest(new.envolvidos) e
    where not exists (select 1 from public.users u where u.id = e)
  ) then
    raise exception 'Envolvido inválido.';
  end if;
  return new;
end;
$$;

create trigger internal_tasks_b_envolvidos
  before insert or update of envolvidos on public.internal_tasks
  for each row execute function public.internal_tasks_envolvidos_validos();

-- Status pela posição da coluna e data de conclusão automática.
create or replace function public.internal_tasks_status_da_coluna()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pos integer;
  v_min integer;
  v_max integer;
begin
  select c.posicao,
         (select min(posicao) from public.kanban_colunas where quadro_id = c.quadro_id),
         (select max(posicao) from public.kanban_colunas where quadro_id = c.quadro_id)
    into v_pos, v_min, v_max
    from public.kanban_colunas c
   where c.id = new.coluna_id;
  if v_pos is null then
    raise exception 'Coluna do kanban inválida.';
  end if;
  new.status := case when v_pos = v_max then 'concluida' when v_pos = v_min then 'pendente' else 'em_andamento' end;

  if new.status = 'concluida' then
    if new.concluida_em is null then new.concluida_em := now(); end if;
  else
    new.concluida_em := null;
  end if;
  return new;
end;
$$;

create trigger internal_tasks_c_status_da_coluna
  before insert or update of coluna_id, status, concluida_em on public.internal_tasks
  for each row execute function public.internal_tasks_status_da_coluna();

-- O único quadro não pode ser excluído.
create or replace function public.kanban_quadros_protege_unico()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.kanban_quadros) <= 1 then
    raise exception 'Este é o único quadro. Crie outro antes de excluí-lo.';
  end if;
  return old;
end;
$$;

create trigger kanban_quadros_protege_unico
  before delete on public.kanban_quadros
  for each row execute function public.kanban_quadros_protege_unico();

-- -----------------------------------------------------------------------------
-- Funções (equivalentes às rotas da API da especificação)
-- -----------------------------------------------------------------------------

-- Valida nome do quadro e lista de colunas; devolve o nome do quadro sem espaços nas pontas.
create or replace function public.kanban_validar_quadro(p_nome text, p_colunas jsonb)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_col jsonb;
  v_col_nome text;
begin
  if char_length(v_nome) not between 1 and 30 then
    raise exception 'O nome do quadro deve ter de 1 a 30 caracteres.';
  end if;
  if p_colunas is null or jsonb_typeof(p_colunas) <> 'array' or jsonb_array_length(p_colunas) not between 2 and 10 then
    raise exception 'O quadro deve ter de 2 a 10 colunas.';
  end if;
  for v_col in select * from jsonb_array_elements(p_colunas) loop
    if jsonb_typeof(v_col) <> 'object' or exists (select 1 from jsonb_object_keys(v_col) k where k not in ('id', 'nome')) then
      raise exception 'Coluna inválida.';
    end if;
    v_col_nome := btrim(coalesce(v_col->>'nome', ''));
    if char_length(v_col_nome) not between 1 and 25 then
      raise exception 'O nome de cada coluna deve ter de 1 a 25 caracteres.';
    end if;
  end loop;
  return v_nome;
end;
$$;

-- POST /api/kanban/quadros
create or replace function public.kanban_criar_quadro(p_nome text, p_colunas jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text;
  v_quadro uuid;
  v_user uuid;
begin
  v_user := public.kanban_usuario_atual();
  v_nome := public.kanban_validar_quadro(p_nome, p_colunas);
  if exists (select 1 from jsonb_array_elements(p_colunas) c where c ? 'id') then
    raise exception 'Coluna inválida.';
  end if;

  insert into public.kanban_quadros (nome, created_by) values (v_nome, v_user) returning id into v_quadro;
  insert into public.kanban_colunas (quadro_id, nome, posicao)
  select v_quadro, btrim(c.value->>'nome'), c.ordinality::int
    from jsonb_array_elements(p_colunas) with ordinality c;
  return v_quadro;
end;
$$;

-- PATCH /api/kanban/quadros/:id
-- p_colunas: [{ id?, nome }] na ordem final. A primeira e a última devem ser as atuais.
create or replace function public.kanban_salvar_quadro(p_quadro uuid, p_nome text, p_colunas jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text;
  v_atuais uuid[];
  v_novos uuid[];
  v_removidas uuid[];
  v_primeira uuid;
  v_base integer;
  v_col record;
begin
  perform public.kanban_usuario_atual();
  v_nome := public.kanban_validar_quadro(p_nome, p_colunas);

  perform 1 from public.kanban_quadros where id = p_quadro for update;
  if not found then
    raise exception 'Quadro não encontrado.';
  end if;

  select array_agg(id order by posicao) into v_atuais from public.kanban_colunas where quadro_id = p_quadro;

  select array_agg((c.value->>'id')::uuid order by c.ordinality) filter (where c.value ? 'id')
    into v_novos
    from jsonb_array_elements(p_colunas) with ordinality c;
  v_novos := coalesce(v_novos, '{}');

  if cardinality(v_novos) <> (select count(distinct x) from unnest(v_novos) x)
     or exists (select 1 from unnest(v_novos) x where x <> all (v_atuais)) then
    raise exception 'Coluna inválida.';
  end if;
  if (p_colunas->0->>'id')::uuid is distinct from v_atuais[1]
     or (p_colunas->-1->>'id')::uuid is distinct from v_atuais[cardinality(v_atuais)] then
    raise exception 'A primeira e a última coluna são fixas.';
  end if;

  v_primeira := v_atuais[1];
  select coalesce(array_agg(x), '{}') into v_removidas from unnest(v_atuais) x where x <> all (v_novos);

  -- Cartões das colunas removidas vão para o fim da primeira coluna
  if cardinality(v_removidas) > 0 then
    select coalesce(max(ordem), -1) + 1 into v_base from public.internal_tasks where coluna_id = v_primeira;
    update public.internal_tasks t
       set coluna_id = v_primeira, ordem = v_base + m.rn
      from (
        select it.id, row_number() over (order by c.posicao, it.ordem, it.created_at) - 1 as rn
          from public.internal_tasks it
          join public.kanban_colunas c on c.id = it.coluna_id
         where it.coluna_id = any (v_removidas)
      ) m
     where t.id = m.id;
    delete from public.kanban_colunas where id = any (v_removidas);
  end if;

  -- Posições, nomes e colunas novas
  for v_col in select c.value, c.ordinality::int as pos from jsonb_array_elements(p_colunas) with ordinality c loop
    if v_col.value ? 'id' then
      update public.kanban_colunas set nome = btrim(v_col.value->>'nome'), posicao = v_col.pos where id = (v_col.value->>'id')::uuid;
    else
      insert into public.kanban_colunas (quadro_id, nome, posicao) values (p_quadro, btrim(v_col.value->>'nome'), v_col.pos);
    end if;
  end loop;

  update public.kanban_quadros set nome = v_nome where id = p_quadro;

  -- Regrava coluna_id para o gatilho recalcular o status de todos os cartões
  update public.internal_tasks set coluna_id = coluna_id
   where coluna_id in (select id from public.kanban_colunas where quadro_id = p_quadro);
end;
$$;

-- DELETE /api/kanban/quadros/:id
create or replace function public.kanban_excluir_quadro(p_quadro uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.kanban_usuario_atual();
  delete from public.kanban_quadros where id = p_quadro;
  if not found then
    raise exception 'Quadro não encontrado.';
  end if;
end;
$$;

-- Cria o "Kanban Padrão" se ainda não existir nenhum quadro.
create or replace function public.kanban_garantir_padrao()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.kanban_usuario_atual();
  perform pg_advisory_xact_lock(hashtext('kanban_garantir_padrao'));
  if not exists (select 1 from public.kanban_quadros) then
    perform public.kanban_criar_quadro(
      'Kanban Padrão',
      '[{"nome":"A Fazer"},{"nome":"Fazendo"},{"nome":"Concluído"}]'::jsonb
    );
  end if;
end;
$$;

-- PUT /api/tasks/ordem: grava a ordem final da coluna (ordem = índice) e
-- move para esta coluna os cartões que vieram de outra.
create or replace function public.kanban_reordenar(p_coluna uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 500
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Lista de cartões inválida.';
  end if;
  if not exists (select 1 from public.kanban_colunas where id = p_coluna) then
    raise exception 'Coluna do kanban inválida.';
  end if;
  if (select count(*) from public.internal_tasks where id = any (p_ids)) <> cardinality(p_ids) then
    raise exception 'Tarefa inválida.';
  end if;

  update public.internal_tasks t
     set ordem = o.idx - 1,
         coluna_id = p_coluna
    from unnest(p_ids) with ordinality as o(id, idx)
   where t.id = o.id
     and (t.ordem is distinct from o.idx - 1 or t.coluna_id is distinct from p_coluna);
end;
$$;

-- Funções só para usuários autenticados
revoke all on function
  public.kanban_usuario_atual(),
  public.kanban_criar_quadro(text, jsonb),
  public.kanban_salvar_quadro(uuid, text, jsonb),
  public.kanban_excluir_quadro(uuid),
  public.kanban_garantir_padrao(),
  public.kanban_reordenar(uuid, uuid[]),
  public.kanban_validar_quadro(text, jsonb)
from public, anon;

grant execute on function
  public.kanban_usuario_atual(),
  public.kanban_criar_quadro(text, jsonb),
  public.kanban_salvar_quadro(uuid, text, jsonb),
  public.kanban_excluir_quadro(uuid),
  public.kanban_garantir_padrao(),
  public.kanban_reordenar(uuid, uuid[])
to authenticated;

commit;
