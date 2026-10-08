-- =============================================================================
-- Kanban pessoal e do negócio, com compartilhamento (visualizar ou editar).
--
-- NÃO APLICADA. Só aplicar em produção com aprovação explícita (DEV-02).
--
-- Regras (no banco, a tela só mostra):
--  - todo quadro tem escopo: 'negocio' (do salão) ou 'pessoal' (de uma pessoa, dono_id);
--  - quadro do negócio: a administradora edita; a equipe edita como antes, salvo se um
--    compartilhamento com a pessoa disser 'ver'; cada profissional segue vendo só as
--    tarefas em que é responsável, envolvida ou criadora (tarefa_visivel);
--  - quadro pessoal: só o dono vê e edita; outras pessoas só com compartilhamento,
--    inclusive a administradora;
--  - compartilhar: quadro pessoal com o negócio (toda a equipe) ou com uma pessoa;
--    quadro do negócio com o espaço pessoal de uma pessoa. Permissão 'ver' ou 'editar';
--    quem recebe por compartilhamento vê todas as tarefas daquele quadro;
--  - quem compartilha: o dono (pessoal) ou a administradora (negócio).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Escopo, dono e compartilhamentos
-- -----------------------------------------------------------------------------

alter table public.kanban_quadros
  add column if not exists escopo text not null default 'negocio' check (escopo in ('negocio', 'pessoal')),
  add column if not exists dono_id uuid references public.users(id) on delete cascade;
alter table public.kanban_quadros
  add constraint kanban_quadros_dono_check check (escopo = 'negocio' or dono_id is not null);
create index if not exists kanban_quadros_dono_idx on public.kanban_quadros (dono_id) where dono_id is not null;

create table public.kanban_compartilhamentos (
  id uuid primary key default gen_random_uuid(),
  quadro_id uuid not null references public.kanban_quadros(id) on delete cascade,
  destino text not null check (destino in ('negocio', 'pessoa')),
  user_id uuid references public.users(id) on delete cascade,
  permissao text not null check (permissao in ('ver', 'editar')),
  criado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((destino = 'negocio' and user_id is null) or (destino = 'pessoa' and user_id is not null))
);
create unique index kanban_compart_negocio_uk on public.kanban_compartilhamentos (quadro_id) where destino = 'negocio';
create unique index kanban_compart_pessoa_uk on public.kanban_compartilhamentos (quadro_id, user_id) where destino = 'pessoa';
create index kanban_compart_user_idx on public.kanban_compartilhamentos (user_id) where user_id is not null;

alter table public.kanban_compartilhamentos enable row level security;
revoke all on public.kanban_compartilhamentos from anon;
revoke insert, update, delete, truncate on public.kanban_compartilhamentos from authenticated;

-- -----------------------------------------------------------------------------
-- 2. Permissão por quadro e visibilidade das tarefas
-- -----------------------------------------------------------------------------

-- 'editar', 'ver' ou null (sem acesso) para a pessoa da sessão.
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
  select permissao into v_pessoa from public.kanban_compartilhamentos
   where quadro_id = p_quadro and destino = 'pessoa' and user_id = v_eu;
  if v_escopo = 'negocio' then
    if public.usuario_admin() then
      return 'editar';
    end if;
    return coalesce(v_pessoa, 'editar');
  end if;
  if v_dono = v_eu then
    return 'editar';
  end if;
  select permissao into v_negocio from public.kanban_compartilhamentos
   where quadro_id = p_quadro and destino = 'negocio';
  if v_pessoa = 'editar' or v_negocio = 'editar' then
    return 'editar';
  end if;
  return coalesce(v_pessoa, v_negocio);
end;
$$;

-- Quem gerencia (renomeia, exclui, compartilha): dono do pessoal; administradora no negócio.
create or replace function public.kanban_gerencia(p_quadro uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select case when q.escopo = 'pessoal' then q.dono_id = public.usuario_atual_id()
                else public.usuario_admin() end
      from public.kanban_quadros q where q.id = p_quadro), false);
$$;

create or replace function public.kanban_pode_editar_coluna(p_coluna uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select public.kanban_permissao(c.quadro_id) = 'editar'
                     from public.kanban_colunas c where c.id = p_coluna), false);
$$;

-- Pessoal ou recebido por compartilhamento: todas as tarefas; negócio: regra tarefa_visivel.
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
             when q.escopo = 'pessoal' then true
             when exists (select 1 from public.kanban_compartilhamentos s
                           where s.quadro_id = q.id and s.destino = 'pessoa' and s.user_id = public.usuario_atual_id()) then true
             else public.tarefa_visivel(p_responsavel, p_envolvidos, p_criador)
           end
      from public.kanban_colunas c join public.kanban_quadros q on q.id = c.quadro_id
     where c.id = p_coluna), false);
$$;

-- -----------------------------------------------------------------------------
-- 3. Políticas (uma por operação)
-- -----------------------------------------------------------------------------

alter policy "kanban_quadros: select" on public.kanban_quadros
  using (public.kanban_permissao(id) is not null);
alter policy "kanban_colunas: select" on public.kanban_colunas
  using (public.kanban_permissao(quadro_id) is not null);

alter policy "internal_tasks: select" on public.internal_tasks
  using (public.kanban_tarefa_visivel(coluna_id, responsible_id, envolvidos, created_by));
alter policy "internal_tasks: insert" on public.internal_tasks
  with check (public.usuario_ativo() and public.kanban_pode_editar_coluna(coluna_id));
alter policy "internal_tasks: update" on public.internal_tasks
  using (public.kanban_tarefa_visivel(coluna_id, responsible_id, envolvidos, created_by) and public.kanban_pode_editar_coluna(coluna_id))
  with check (public.kanban_pode_editar_coluna(coluna_id));
alter policy "internal_tasks: delete" on public.internal_tasks
  using (public.kanban_pode_editar_coluna(coluna_id)
         and (public.usuario_admin() or created_by = public.usuario_atual_id()
              or exists (select 1 from public.kanban_colunas c join public.kanban_quadros q on q.id = c.quadro_id
                          where c.id = coluna_id and q.dono_id = public.usuario_atual_id())));

alter policy "tarefa_itens: insert" on public.tarefa_itens
  with check (exists (select 1 from public.internal_tasks t where t.id = task_id and public.kanban_pode_editar_coluna(t.coluna_id)));
alter policy "tarefa_itens: update" on public.tarefa_itens
  using (exists (select 1 from public.internal_tasks t where t.id = task_id and public.kanban_pode_editar_coluna(t.coluna_id)))
  with check (exists (select 1 from public.internal_tasks t where t.id = task_id and public.kanban_pode_editar_coluna(t.coluna_id)));
alter policy "tarefa_itens: delete" on public.tarefa_itens
  using (exists (select 1 from public.internal_tasks t where t.id = task_id and public.kanban_pode_editar_coluna(t.coluna_id)));

alter policy "tarefa_comentarios: insert" on public.tarefa_comentarios
  with check (public.usuario_ativo()
              and exists (select 1 from public.internal_tasks t where t.id = task_id and public.kanban_pode_editar_coluna(t.coluna_id)));

create policy "kanban_compartilhamentos: select" on public.kanban_compartilhamentos
  for select to authenticated using (public.kanban_gerencia(quadro_id) or user_id = public.usuario_atual_id());

-- -----------------------------------------------------------------------------
-- 4. Funções de quadro
-- -----------------------------------------------------------------------------

-- Versão anterior renomeada e sem execução (o conector segura remoções para confirmação).
alter function public.kanban_criar_quadro(text, jsonb) rename to kanban_criar_quadro_v1;
revoke execute on function public.kanban_criar_quadro_v1(text, jsonb) from anon, authenticated, public;

create or replace function public.kanban_criar_quadro(p_nome text, p_colunas jsonb, p_escopo text default 'negocio')
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
  if p_escopo is null or p_escopo not in ('negocio', 'pessoal') then
    raise exception 'Tipo de quadro inválido.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_colunas) c where c ? 'id') then
    raise exception 'Coluna inválida.';
  end if;
  insert into public.kanban_quadros (nome, created_by, escopo, dono_id)
  values (v_nome, v_user, p_escopo, case when p_escopo = 'pessoal' then v_user end)
  returning id into v_quadro;
  insert into public.kanban_colunas (quadro_id, nome, posicao)
  select v_quadro, btrim(c.value->>'nome'), c.ordinality::int
    from jsonb_array_elements(p_colunas) with ordinality c;
  return v_quadro;
end;
$$;

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
  if not found or coalesce(public.kanban_permissao(p_quadro), '') <> 'editar' then
    raise exception 'Quadro não encontrado ou sem permissão para editar.';
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

  for v_col in select c.value, c.ordinality::int as pos from jsonb_array_elements(p_colunas) with ordinality c loop
    if v_col.value ? 'id' then
      update public.kanban_colunas set nome = btrim(v_col.value->>'nome'), posicao = v_col.pos where id = (v_col.value->>'id')::uuid;
    else
      insert into public.kanban_colunas (quadro_id, nome, posicao) values (p_quadro, btrim(v_col.value->>'nome'), v_col.pos);
    end if;
  end loop;

  update public.kanban_quadros set nome = v_nome where id = p_quadro;

  update public.internal_tasks set coluna_id = coluna_id
   where coluna_id in (select id from public.kanban_colunas where quadro_id = p_quadro);
end;
$$;

-- Excluir: dono do pessoal; no negócio, a administradora ou quem criou o quadro.
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
  if (v_escopo = 'pessoal' and v_dono is distinct from v_eu)
     or (v_escopo = 'negocio' and not public.usuario_admin() and v_criador is distinct from v_eu) then
    raise exception 'Só quem é dono do quadro pode excluí-lo.';
  end if;
  delete from public.kanban_quadros where id = p_quadro;
end;
$$;

-- O último quadro do negócio não pode ser excluído; pessoais podem.
create or replace function public.kanban_quadros_protege_unico()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.escopo = 'negocio' and (select count(*) from public.kanban_quadros where escopo = 'negocio') <= 1 then
    raise exception 'Este é o único quadro do negócio. Crie outro antes de excluí-lo.';
  end if;
  return old;
end;
$$;

create or replace function public.kanban_garantir_padrao()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.kanban_usuario_atual();
  perform pg_advisory_xact_lock(hashtext('kanban_garantir_padrao'));
  if not exists (select 1 from public.kanban_quadros where escopo = 'negocio') then
    perform public.kanban_criar_quadro(
      'Kanban Padrão',
      '[{"nome":"A Fazer"},{"nome":"Fazendo"},{"nome":"Concluído"}]'::jsonb,
      'negocio'
    );
  end if;
end;
$$;

-- Quadros que a pessoa vê, com a permissão e em qual visão aparecem.
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
         (q.escopo = 'pessoal' and q.dono_id = public.usuario_atual_id())
           or exists (select 1 from public.kanban_compartilhamentos s
                       where s.quadro_id = q.id and s.destino = 'pessoa' and s.user_id = public.usuario_atual_id()),
         exists (select 1 from public.kanban_compartilhamentos s where s.quadro_id = q.id)
    from public.kanban_quadros q
    left join public.users u on u.id = q.dono_id
   where public.usuario_ativo() and public.kanban_permissao(q.id) is not null
   order by q.created_at;
$$;

-- Compartilha (ou muda a permissão). p_destino: 'negocio' (toda a equipe) ou 'pessoa'.
create or replace function public.kanban_compartilhar(p_quadro uuid, p_destino text, p_user uuid, p_permissao text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eu uuid := public.kanban_usuario_atual();
  v_escopo text;
  v_dono uuid;
  v_id uuid;
begin
  select escopo, dono_id into v_escopo, v_dono from public.kanban_quadros where id = p_quadro for update;
  if not found or not public.kanban_gerencia(p_quadro) then
    raise exception 'Só quem é dono do quadro pode compartilhá-lo.';
  end if;
  if p_permissao is null or p_permissao not in ('ver', 'editar') then
    raise exception 'Permissão inválida.';
  end if;
  if p_destino = 'negocio' then
    if v_escopo = 'negocio' then
      raise exception 'Este quadro já é do negócio.';
    end if;
    update public.kanban_compartilhamentos set permissao = p_permissao
     where quadro_id = p_quadro and destino = 'negocio' returning id into v_id;
    if v_id is null then
      insert into public.kanban_compartilhamentos (quadro_id, destino, permissao, criado_por)
      values (p_quadro, 'negocio', p_permissao, v_eu) returning id into v_id;
    end if;
  elsif p_destino = 'pessoa' then
    if p_user is null or not exists (select 1 from public.users where id = p_user and active is true) then
      raise exception 'Escolha uma pessoa ativa da equipe.';
    end if;
    if v_escopo = 'pessoal' and p_user = v_dono then
      raise exception 'O quadro já é dessa pessoa.';
    end if;
    update public.kanban_compartilhamentos set permissao = p_permissao
     where quadro_id = p_quadro and destino = 'pessoa' and user_id = p_user returning id into v_id;
    if v_id is null then
      insert into public.kanban_compartilhamentos (quadro_id, destino, user_id, permissao, criado_por)
      values (p_quadro, 'pessoa', p_user, p_permissao, v_eu) returning id into v_id;
    end if;
  else
    raise exception 'Destino inválido.';
  end if;
  return v_id;
end;
$$;

create or replace function public.kanban_remover_compartilhamento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quadro uuid;
begin
  perform public.kanban_usuario_atual();
  select quadro_id into v_quadro from public.kanban_compartilhamentos where id = p_id;
  if not found or not public.kanban_gerencia(v_quadro) then
    raise exception 'Compartilhamento não encontrado.';
  end if;
  delete from public.kanban_compartilhamentos where id = p_id;
end;
$$;

-- Trilha: mudança e remoção de compartilhamento.
create trigger kanban_compartilhamentos_auditoria_alteracao
  after update on public.kanban_compartilhamentos
  for each row execute function public.auditar_alteracao_generica();
create trigger kanban_compartilhamentos_auditoria_exclusao
  after delete on public.kanban_compartilhamentos
  for each row execute function public.auditar_alteracao_generica();

-- -----------------------------------------------------------------------------
-- 5. Permissões de execução
-- -----------------------------------------------------------------------------

revoke execute on function
  public.kanban_permissao(uuid),
  public.kanban_gerencia(uuid),
  public.kanban_pode_editar_coluna(uuid),
  public.kanban_tarefa_visivel(uuid, uuid, uuid[], uuid),
  public.kanban_criar_quadro(text, jsonb, text),
  public.kanban_salvar_quadro(uuid, text, jsonb),
  public.kanban_excluir_quadro(uuid),
  public.kanban_garantir_padrao(),
  public.kanban_quadros_visiveis(),
  public.kanban_compartilhar(uuid, text, uuid, text),
  public.kanban_remover_compartilhamento(uuid),
  public.kanban_quadros_protege_unico()
from anon, public;
revoke execute on function public.kanban_quadros_protege_unico() from authenticated;

-- As de permissão são usadas nas políticas (precisam rodar como a pessoa logada).
grant execute on function
  public.kanban_permissao(uuid),
  public.kanban_gerencia(uuid),
  public.kanban_pode_editar_coluna(uuid),
  public.kanban_tarefa_visivel(uuid, uuid, uuid[], uuid),
  public.kanban_criar_quadro(text, jsonb, text),
  public.kanban_salvar_quadro(uuid, text, jsonb),
  public.kanban_excluir_quadro(uuid),
  public.kanban_garantir_padrao(),
  public.kanban_quadros_visiveis(),
  public.kanban_compartilhar(uuid, text, uuid, text),
  public.kanban_remover_compartilhamento(uuid)
to authenticated;

commit;
