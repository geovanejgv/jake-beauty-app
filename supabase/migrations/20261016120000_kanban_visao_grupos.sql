-- =============================================================================
-- Kanban: onde o quadro aparece (negócio, pessoal ou ambos) e grupos de quadros.
--
-- NÃO APLICADA. Só aplicar em produção com aprovação explícita (DEV-02).
--
-- Visão do quadro (um único quadro; alterar em uma visão altera na outra):
--  - 'negocio': escopo 'negocio', sem dono;
--  - 'pessoal': escopo 'pessoal', com dono (só o dono vê, salvo compartilhamento);
--  - 'ambos'  : escopo 'negocio' com dono: segue as regras do negócio e também aparece
--               na visão pessoal do dono, que o edita e vê todas as tarefas dele.
-- Quem muda: quem gerencia o quadro; deixar só no negócio (sem dono) é da administradora.
--
-- Grupos: organização pessoal da tela inicial. Cada pessoa cria os próprios grupos e
-- coloca nele os quadros que vê; ninguém mais vê os grupos dela.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Dono também em quadro do negócio ('ambos')
-- -----------------------------------------------------------------------------

create or replace function public.kanban_permissao(p_quadro uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_eu uuid := public.usuario_atual_id();
  v_escopo text;
  v_dono uuid;
  v_pessoa text;
  v_negocio text;
begin
  if v_eu is null then
    return null;
  end if;
  select escopo, dono_id into v_escopo, v_dono from public.kanban_quadros where id = p_quadro;
  if not found then
    return null;
  end if;
  if v_dono = v_eu then
    return 'editar';
  end if;
  select permissao into v_pessoa from public.kanban_compartilhamentos
   where quadro_id = p_quadro and destino = 'pessoa' and user_id = v_eu;
  if v_escopo = 'negocio' then
    if public.usuario_admin() then
      return 'editar';
    end if;
    return coalesce(v_pessoa, 'editar');
  end if;
  select permissao into v_negocio from public.kanban_compartilhamentos
   where quadro_id = p_quadro and destino = 'negocio';
  if v_pessoa = 'editar' or v_negocio = 'editar' then
    return 'editar';
  end if;
  return coalesce(v_pessoa, v_negocio);
end;
$$;

-- Quem gerencia: o dono (pessoal ou ambos); no negócio, também a administradora.
create or replace function public.kanban_gerencia(p_quadro uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select q.dono_id = public.usuario_atual_id()
           or (q.escopo = 'negocio' and public.usuario_admin())
      from public.kanban_quadros q where q.id = p_quadro), false);
$$;

-- Dono, pessoal ou recebido por compartilhamento: todas as tarefas; negócio: tarefa_visivel.
create or replace function public.kanban_tarefa_visivel(p_coluna uuid, p_responsavel uuid, p_envolvidos uuid[], p_criador uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select case
             when public.kanban_permissao(q.id) is null then false
             when q.escopo = 'pessoal' or q.dono_id = public.usuario_atual_id() then true
             when exists (select 1 from public.kanban_compartilhamentos s
                           where s.quadro_id = q.id and s.destino = 'pessoa' and s.user_id = public.usuario_atual_id()) then true
             else public.tarefa_visivel(p_responsavel, p_envolvidos, p_criador)
           end
      from public.kanban_colunas c join public.kanban_quadros q on q.id = c.quadro_id
     where c.id = p_coluna), false);
$$;

-- Excluir: dono; no negócio, também a administradora ou quem criou o quadro.
create or replace function public.kanban_excluir_quadro(p_quadro uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eu uuid := public.kanban_usuario_atual();
  v_escopo text;
  v_dono uuid;
  v_criador uuid;
begin
  select escopo, dono_id, created_by into v_escopo, v_dono, v_criador from public.kanban_quadros where id = p_quadro;
  if not found or public.kanban_permissao(p_quadro) is null then
    raise exception 'Quadro não encontrado.';
  end if;
  if v_dono is distinct from v_eu
     and (v_escopo = 'pessoal' or (not public.usuario_admin() and v_criador is distinct from v_eu)) then
    raise exception 'Só quem é dono do quadro pode excluí-lo.';
  end if;
  perform public.kanban_excluir_quadro_base(p_quadro);
end;
$$;

-- Visão pessoal: quadros de que sou dono (pessoais ou 'ambos') e os compartilhados comigo.
create or replace function public.kanban_quadros_visiveis()
returns table (
  id uuid, nome text, escopo text, dono_id uuid, dono_nome text, created_at timestamptz,
  permissao text, gerencia boolean, no_negocio boolean, no_pessoal boolean, compartilhado boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select q.id, q.nome, q.escopo, q.dono_id, coalesce(u.apelido, u.name), q.created_at,
         public.kanban_permissao(q.id),
         public.kanban_gerencia(q.id),
         q.escopo = 'negocio'
           or exists (select 1 from public.kanban_compartilhamentos s where s.quadro_id = q.id and s.destino = 'negocio'),
         q.dono_id = public.usuario_atual_id()
           or exists (select 1 from public.kanban_compartilhamentos s
                       where s.quadro_id = q.id and s.destino = 'pessoa' and s.user_id = public.usuario_atual_id()),
         exists (select 1 from public.kanban_compartilhamentos s where s.quadro_id = q.id)
    from public.kanban_quadros q
    left join public.users u on u.id = q.dono_id
   where public.usuario_ativo() and public.kanban_permissao(q.id) is not null
   order by q.created_at;
$$;

-- Muda onde o quadro aparece: 'negocio', 'pessoal' ou 'ambos'.
create or replace function public.kanban_definir_visao(p_quadro uuid, p_visao text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eu uuid := public.kanban_usuario_atual();
  v_escopo text;
  v_dono uuid;
  v_novo_escopo text;
  v_novo_dono uuid;
begin
  select escopo, dono_id into v_escopo, v_dono from public.kanban_quadros where id = p_quadro for update;
  if not found or not public.kanban_gerencia(p_quadro) then
    raise exception 'Só quem é dono do quadro pode mudar onde ele aparece.';
  end if;
  if p_visao is null or p_visao not in ('negocio', 'pessoal', 'ambos') then
    raise exception 'Visualização inválida.';
  end if;
  if p_visao = 'negocio' and not public.usuario_admin() then
    raise exception 'Só a administradora pode deixar um quadro apenas no negócio.';
  end if;

  v_novo_escopo := case when p_visao = 'pessoal' then 'pessoal' else 'negocio' end;
  v_novo_dono := case when p_visao = 'negocio' then null else coalesce(v_dono, v_eu) end;

  if v_escopo = 'negocio' and v_novo_escopo = 'pessoal'
     and (select count(*) from public.kanban_quadros where escopo = 'negocio') <= 1 then
    raise exception 'Este é o único quadro do negócio. Crie outro antes de tirá-lo do negócio.';
  end if;
  if v_novo_escopo = 'negocio'
     and exists (select 1 from public.kanban_compartilhamentos where quadro_id = p_quadro and destino = 'negocio') then
    raise exception 'Remova o compartilhamento com o negócio antes de mudar a visualização.';
  end if;

  update public.kanban_quadros set escopo = v_novo_escopo, dono_id = v_novo_dono where id = p_quadro;
end;
$$;

revoke execute on function public.kanban_definir_visao(uuid, text) from anon, public;
grant execute on function public.kanban_definir_visao(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Grupos de quadros (organização pessoal da tela inicial)
-- -----------------------------------------------------------------------------

create table public.kanban_grupos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.usuario_atual_id() references public.users(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, nome),
  unique (id, user_id)
);

-- Um quadro fica em no máximo um grupo por pessoa; o grupo tem de ser da mesma pessoa.
create table public.kanban_quadro_grupo (
  user_id uuid not null default public.usuario_atual_id() references public.users(id) on delete cascade,
  quadro_id uuid not null references public.kanban_quadros(id) on delete cascade,
  grupo_id uuid not null,
  primary key (user_id, quadro_id),
  foreign key (grupo_id, user_id) references public.kanban_grupos(id, user_id) on delete cascade
);
create index kanban_quadro_grupo_grupo_idx on public.kanban_quadro_grupo (grupo_id);

alter table public.kanban_grupos enable row level security;
alter table public.kanban_quadro_grupo enable row level security;
revoke all on public.kanban_grupos, public.kanban_quadro_grupo from anon;
revoke truncate, references, trigger on public.kanban_grupos, public.kanban_quadro_grupo from authenticated;
grant select, insert, update, delete on public.kanban_grupos, public.kanban_quadro_grupo to authenticated;

create policy "kanban_grupos: select" on public.kanban_grupos
  for select to authenticated using (public.usuario_ativo() and user_id = public.usuario_atual_id());
create policy "kanban_grupos: insert" on public.kanban_grupos
  for insert to authenticated with check (public.usuario_ativo() and user_id = public.usuario_atual_id());
create policy "kanban_grupos: update" on public.kanban_grupos
  for update to authenticated
  using (public.usuario_ativo() and user_id = public.usuario_atual_id())
  with check (public.usuario_ativo() and user_id = public.usuario_atual_id());
create policy "kanban_grupos: delete" on public.kanban_grupos
  for delete to authenticated using (public.usuario_ativo() and user_id = public.usuario_atual_id());

create policy "kanban_quadro_grupo: select" on public.kanban_quadro_grupo
  for select to authenticated using (public.usuario_ativo() and user_id = public.usuario_atual_id());
create policy "kanban_quadro_grupo: insert" on public.kanban_quadro_grupo
  for insert to authenticated
  with check (public.usuario_ativo() and user_id = public.usuario_atual_id() and public.kanban_permissao(quadro_id) is not null);
create policy "kanban_quadro_grupo: update" on public.kanban_quadro_grupo
  for update to authenticated
  using (public.usuario_ativo() and user_id = public.usuario_atual_id())
  with check (public.usuario_ativo() and user_id = public.usuario_atual_id() and public.kanban_permissao(quadro_id) is not null);
create policy "kanban_quadro_grupo: delete" on public.kanban_quadro_grupo
  for delete to authenticated using (public.usuario_ativo() and user_id = public.usuario_atual_id());

commit;
