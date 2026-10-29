-- =============================================================================
-- Fichas de anamnese, fotodepilação e termos de consentimento, preenchidas e
-- assinadas pela cliente na tela do celular.
--  - Os campos de cada documento ficam em JSON (fichas.campos), copiados do modelo
--    no momento da criação: mudar o modelo depois não altera ficha já assinada.
--  - A cliente não tem login: recebe um link com token aleatório de 244 bits, de uso
--    único e com validade de 72 horas. O banco guarda só o SHA-256 do token.
--  - As respostas são validadas aqui contra os campos (VAL-01, VAL-02): tipo, opção,
--    tamanho, obrigatoriedade, campo não previsto e menor de idade com responsável.
--  - Ficha assinada não muda nem é excluída (prova): só pode ser cancelada pela
--    administradora, com motivo. Hash SHA-256 do conteúdo, data, IP e dispositivo
--    ficam gravados como evidência da assinatura eletrônica simples.
--  - Dado de saúde (LGPD, art. 11): a profissional vê só as fichas dela; a
--    administradora vê as do estabelecimento. Cifra em campo segue pendente (CRI-04).
--  - Vários estabelecimentos: coluna, política restritiva e gatilho de guarda.
--  - Sem DROP, DELETE ou UPDATE de dados existentes: só cria (e amplia a lista de
--    ações da trilha de auditoria).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Modelo visual escolhido para cada documento
-- -----------------------------------------------------------------------------
create table public.ficha_preferencias (
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  tipo text not null check (tipo in ('anamnese', 'fotodepilacao', 'termo')),
  modelo_visual text not null check (modelo_visual in ('classico', 'rose', 'minimal', 'noir', 'spa')),
  updated_at timestamptz not null default now(),
  primary key (estabelecimento_id, tipo)
);

alter table public.ficha_preferencias enable row level security;
revoke all on public.ficha_preferencias from anon;

create policy "ficha_preferencias: select" on public.ficha_preferencias for select to authenticated using (public.usuario_ativo());
create policy "ficha_preferencias: insert" on public.ficha_preferencias for insert to authenticated with check (public.usuario_admin());
create policy "ficha_preferencias: update" on public.ficha_preferencias for update to authenticated using (public.usuario_admin()) with check (public.usuario_admin());
create policy "ficha_preferencias: delete" on public.ficha_preferencias for delete to authenticated using (public.usuario_admin());
create policy "ficha_preferencias: mesmo estabelecimento" on public.ficha_preferencias as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));

create trigger a0_estabelecimento_guarda before insert or update or delete on public.ficha_preferencias
  for each row execute function public.estabelecimento_guarda();

-- -----------------------------------------------------------------------------
-- 2. Fichas
-- -----------------------------------------------------------------------------
create table public.fichas (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  -- Documento assinado é prova: a cliente com ficha não é excluída sem antes tratar as fichas.
  client_id uuid not null references public.clients(id) on delete restrict,
  profissional_id uuid references public.users(id) on delete set null,
  tipo text not null check (tipo in ('anamnese', 'fotodepilacao', 'termo')),
  titulo text not null check (char_length(btrim(titulo)) between 3 and 120),
  modelo_visual text not null default 'classico' check (modelo_visual in ('classico', 'rose', 'minimal', 'noir', 'spa')),
  versao text not null check (versao ~ '^[a-z0-9_.-]{1,40}$'),
  campos jsonb not null check (jsonb_typeof(campos) = 'object' and jsonb_typeof(campos -> 'secoes') = 'array'
                               and octet_length(campos::text) <= 200000),
  -- Preenchido pelo salão ao criar (procedimento, valor, forma de pagamento...): a cliente só lê.
  dados_salao jsonb not null default '{}'::jsonb check (jsonb_typeof(dados_salao) = 'object' and octet_length(dados_salao::text) <= 20000),
  respostas jsonb check (respostas is null or (jsonb_typeof(respostas) = 'object' and octet_length(respostas::text) <= 100000)),
  status text not null default 'pendente' check (status in ('pendente', 'assinada', 'cancelada')),
  token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_expira_em timestamptz,
  assinatura_cliente text check (assinatura_cliente ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' and char_length(assinatura_cliente) <= 400000),
  assinatura_responsavel text check (assinatura_responsavel ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' and char_length(assinatura_responsavel) <= 400000),
  responsavel_nome text check (char_length(btrim(responsavel_nome)) between 3 and 200),
  responsavel_cpf text check (responsavel_cpf ~ '^[0-9]{11}$'),
  responsavel_parentesco text check (char_length(btrim(responsavel_parentesco)) between 2 and 60),
  assinado_em timestamptz,
  assinatura_ip text check (char_length(assinatura_ip) <= 64),
  assinatura_dispositivo text check (char_length(assinatura_dispositivo) <= 300),
  hash_documento text check (hash_documento ~ '^[0-9a-f]{64}$'),
  cancelado_motivo text check (char_length(btrim(cancelado_motivo)) between 3 and 500),
  cancelado_em timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fichas_assinada_completa check (
    status <> 'assinada' or (respostas is not null and assinatura_cliente is not null and assinado_em is not null and hash_documento is not null)
  ),
  constraint fichas_cancelada_motivo check (status <> 'cancelada' or cancelado_motivo is not null)
);

create index fichas_estabelecimento_status_idx on public.fichas (estabelecimento_id, status, created_at desc);
create index fichas_client_idx on public.fichas (client_id);
create index fichas_profissional_idx on public.fichas (profissional_id);

alter table public.fichas enable row level security;
revoke all on public.fichas from anon;
revoke truncate, references, trigger on public.fichas from authenticated;

-- Dado de saúde: a administradora vê as do estabelecimento; a profissional, só as dela (AUZ-07).
create policy "fichas: select" on public.fichas for select to authenticated
  using (public.usuario_admin() or (public.usuario_ativo() and profissional_id = public.usuario_atual_id()));
create policy "fichas: insert" on public.fichas for insert to authenticated
  with check (public.usuario_admin() or (public.usuario_ativo() and profissional_id = public.usuario_atual_id()));
create policy "fichas: update" on public.fichas for update to authenticated
  using (public.usuario_admin() or (public.usuario_ativo() and profissional_id = public.usuario_atual_id()))
  with check (public.usuario_admin() or (public.usuario_ativo() and profissional_id = public.usuario_atual_id()));
create policy "fichas: delete" on public.fichas for delete to authenticated
  using (public.usuario_admin());
create policy "fichas: mesmo estabelecimento" on public.fichas as restrictive for all to authenticated
  using (estabelecimento_id = (select public.estabelecimento_atual()))
  with check (estabelecimento_id = (select public.estabelecimento_atual()));

create trigger a0_estabelecimento_guarda before insert or update or delete on public.fichas
  for each row execute function public.estabelecimento_guarda();

-- -----------------------------------------------------------------------------
-- 3. Validação das respostas contra os campos (mesmas regras de src/features/fichas/logic.ts)
-- -----------------------------------------------------------------------------
create or replace function public.ficha_cpf_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  d int[];
  s int;
  r int;
  i int;
begin
  if p is null or p !~ '^[0-9]{11}$' or p ~ '^(.)\1{10}$' then
    return false;
  end if;
  d := array(select substr(p, g, 1)::int from generate_series(1, 11) g);
  s := 0;
  for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> d[10] then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = d[11];
end;
$$;

-- Devolve null quando está tudo certo, ou a mensagem para a tela.
-- p_origem: 'cliente' valida o que a cliente preenche; 'salao', o que o salão preenche ao criar.
create or replace function public.ficha_validar_respostas(p_campos jsonb, p_respostas jsonb, p_origem text)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_campo jsonb;
  v_id text;
  v_tipo text;
  v_rotulo text;
  v_val jsonb;
  v_txt text;
  v_obrig boolean;
  v_cond jsonb;
  v_permitidas text[] := array[]::text[];
  v_k text;
  v_max int;
  v_num numeric;
  v_data date;
  v_opcoes text[];
  v_vazio boolean;
begin
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    return 'Respostas inválidas.';
  end if;
  if octet_length(p_respostas::text) > 100000 then
    return 'Respostas grandes demais.';
  end if;
  for v_campo in
    select c from jsonb_array_elements(p_campos -> 'secoes') s, jsonb_array_elements(s -> 'campos') c
  loop
    v_id := v_campo ->> 'id';
    v_tipo := v_campo ->> 'tipo';
    v_rotulo := coalesce(v_campo ->> 'rotulo', v_id);
    continue when v_tipo = 'informativo' or coalesce(v_campo ->> 'origem', 'cliente') <> p_origem;
    if v_id is null or v_id !~ '^[a-z][a-z0-9_]{0,59}$' then
      return 'Modelo de ficha inválido.';
    end if;
    v_permitidas := v_permitidas || v_id;
    if v_tipo = 'sim_nao' and v_campo ? 'detalhe' then
      v_permitidas := v_permitidas || (v_id || '__detalhe');
    end if;
    v_val := p_respostas -> v_id;
    v_cond := v_campo -> 'mostrarSe';
    -- Campo escondido pela condição não pode vir preenchido.
    if v_cond is not null and (p_respostas -> (v_cond ->> 'campo')) is distinct from (v_cond -> 'igual') then
      if v_val is not null and v_val <> 'null'::jsonb then
        return 'Campo não esperado: ' || v_rotulo;
      end if;
      continue;
    end if;
    v_obrig := coalesce((v_campo ->> 'obrigatorio')::boolean, false);
    v_vazio := v_val is null or v_val = 'null'::jsonb
               or (jsonb_typeof(v_val) = 'string' and btrim(v_val #>> '{}') = '')
               or (jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) = 0)
               or (v_tipo = 'aceite' and v_val = 'false'::jsonb);
    if v_vazio then
      if v_obrig then
        return case when v_tipo = 'aceite' then 'Confirme: ' else 'Preencha: ' end || v_rotulo;
      end if;
      if p_respostas ? (v_id || '__detalhe') then
        return 'Campo não esperado: ' || v_rotulo;
      end if;
      continue;
    end if;
    case v_tipo
      when 'texto', 'texto_longo', 'telefone', 'cpf', 'email', 'data' then
        if jsonb_typeof(v_val) <> 'string' then return 'Resposta inválida: ' || v_rotulo; end if;
        v_txt := v_val #>> '{}';
        v_max := coalesce((v_campo ->> 'max')::int, case when v_tipo = 'texto_longo' then 2000 else 200 end);
        if char_length(v_txt) > least(v_max, 4000) then return 'Texto longo demais: ' || v_rotulo; end if;
        if v_tipo = 'cpf' and not public.ficha_cpf_valido(v_txt) then return 'CPF inválido.'; end if;
        if v_tipo = 'telefone' and v_txt !~ '^[0-9]{10,13}$' then return 'Telefone inválido: ' || v_rotulo; end if;
        if v_tipo = 'email' and v_txt !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return 'E-mail inválido.'; end if;
        if v_tipo = 'data' then
          if v_txt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return 'Data inválida: ' || v_rotulo; end if;
          begin
            v_data := v_txt::date;
          exception when others then
            return 'Data inválida: ' || v_rotulo;
          end;
          if v_data < date '1900-01-01' or v_data > current_date then return 'Data inválida: ' || v_rotulo; end if;
        end if;
      when 'numero' then
        if jsonb_typeof(v_val) <> 'number' then return 'Número inválido: ' || v_rotulo; end if;
        v_num := (v_val #>> '{}')::numeric;
        if v_num < coalesce((v_campo ->> 'min')::numeric, 0) or v_num > coalesce((v_campo ->> 'max')::numeric, 1000000) then
          return 'Número fora do limite: ' || v_rotulo;
        end if;
      when 'sim_nao' then
        if v_val not in ('"sim"'::jsonb, '"nao"'::jsonb) then return 'Resposta inválida: ' || v_rotulo; end if;
        if v_campo ? 'detalhe' then
          v_txt := btrim(coalesce(p_respostas ->> (v_id || '__detalhe'), ''));
          if v_val = '"sim"'::jsonb then
            if p_respostas ? (v_id || '__detalhe') and jsonb_typeof(p_respostas -> (v_id || '__detalhe')) <> 'string' then
              return 'Resposta inválida: ' || v_rotulo;
            end if;
            if v_txt = '' and coalesce((v_campo #>> '{detalhe,obrigatorio}')::boolean, false) then
              return 'Preencha: ' || coalesce(v_campo #>> '{detalhe,rotulo}', v_rotulo);
            end if;
            if char_length(v_txt) > 500 then return 'Texto longo demais: ' || v_rotulo; end if;
          elsif p_respostas ? (v_id || '__detalhe') then
            return 'Campo não esperado: ' || v_rotulo;
          end if;
        end if;
      when 'escolha_unica', 'escolha_multipla' then
        v_opcoes := array(select o ->> 'valor' from jsonb_array_elements(v_campo -> 'opcoes') o);
        if v_tipo = 'escolha_unica' then
          if jsonb_typeof(v_val) <> 'string' or not ((v_val #>> '{}') = any(v_opcoes)) then
            return 'Opção inválida: ' || v_rotulo;
          end if;
        else
          if jsonb_typeof(v_val) <> 'array'
             or exists (select 1 from jsonb_array_elements(v_val) e where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any(v_opcoes)))
             or (select count(*) <> count(distinct e) from jsonb_array_elements(v_val) e) then
            return 'Opção inválida: ' || v_rotulo;
          end if;
        end if;
      when 'aceite' then
        if v_val <> 'true'::jsonb then return 'Resposta inválida: ' || v_rotulo; end if;
      else
        return 'Modelo de ficha inválido.';
    end case;
  end loop;
  for v_k in select jsonb_object_keys(p_respostas) loop
    if not (v_k = any(v_permitidas)) then
      return 'Campo não previsto na ficha.';
    end if;
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Regras gravadas pelo banco (não dependem da tela)
-- -----------------------------------------------------------------------------
-- Pela API (sessão de usuário) só se cria ficha pendente e só se cancela. Gerar link e
-- assinar passam pelas funções abaixo, que ligam a marca "app.ficha_interna".
create or replace function public.fichas_regras()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_interna boolean := coalesce(current_setting('app.ficha_interna', true), '') = '1';
  v_erro text;
begin
  if tg_op = 'DELETE' then
    if old.status = 'assinada' then
      raise exception 'Ficha assinada não pode ser excluída. Cancele-a informando o motivo.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := public.usuario_atual_id();
    if not public.usuario_admin() then
      new.profissional_id := public.usuario_atual_id();
    end if;
    new.status := 'pendente';
    new.titulo := btrim(new.titulo);
    new.respostas := null;
    new.token_hash := null;
    new.token_expira_em := null;
    new.assinatura_cliente := null;
    new.assinatura_responsavel := null;
    new.responsavel_nome := null;
    new.responsavel_cpf := null;
    new.responsavel_parentesco := null;
    new.assinado_em := null;
    new.assinatura_ip := null;
    new.assinatura_dispositivo := null;
    new.hash_documento := null;
    new.cancelado_motivo := null;
    new.cancelado_em := null;
    new.created_at := now();
    -- O modelo visual vem da preferência do estabelecimento, não da tela.
    new.modelo_visual := coalesce(
      (select p.modelo_visual from public.ficha_preferencias p where p.estabelecimento_id = new.estabelecimento_id and p.tipo = new.tipo),
      'classico');
    if new.campos ->> 'tipo' is distinct from new.tipo or new.campos ->> 'versao' is distinct from new.versao then
      raise exception 'Modelo de ficha inválido.' using errcode = 'P0001';
    end if;
    v_erro := public.ficha_validar_respostas(new.campos, new.dados_salao, 'salao');
    if v_erro is not null then
      raise exception '%', v_erro using errcode = 'P0001';
    end if;
  elsif not v_interna then
    -- Alteração pela tela: só cancelar (com motivo). Assinada só a administradora cancela.
    if new.status is distinct from 'cancelada' or old.status = 'cancelada'
       or (new.estabelecimento_id, new.client_id, new.profissional_id, new.tipo, new.titulo, new.modelo_visual, new.versao,
           new.campos, new.dados_salao, new.respostas, new.token_hash, new.token_expira_em, new.assinatura_cliente,
           new.assinatura_responsavel, new.responsavel_nome, new.responsavel_cpf, new.responsavel_parentesco,
           new.assinado_em, new.assinatura_ip, new.assinatura_dispositivo, new.hash_documento, new.created_by, new.created_at)
          is distinct from
          (old.estabelecimento_id, old.client_id, old.profissional_id, old.tipo, old.titulo, old.modelo_visual, old.versao,
           old.campos, old.dados_salao, old.respostas, old.token_hash, old.token_expira_em, old.assinatura_cliente,
           old.assinatura_responsavel, old.responsavel_nome, old.responsavel_cpf, old.responsavel_parentesco,
           old.assinado_em, old.assinatura_ip, old.assinatura_dispositivo, old.hash_documento, old.created_by, old.created_at) then
      raise exception 'A ficha não pode ser alterada. Cancele e crie outra, se precisar.' using errcode = 'P0001';
    end if;
    if old.status = 'assinada' and not public.usuario_admin() then
      raise exception 'Só a administradora cancela ficha assinada.' using errcode = 'P0001';
    end if;
    if new.cancelado_motivo is null or char_length(btrim(new.cancelado_motivo)) < 3 then
      raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
    end if;
    new.cancelado_motivo := btrim(new.cancelado_motivo);
    new.cancelado_em := now();
    -- Link deixa de valer.
    new.token_hash := null;
    new.token_expira_em := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.fichas_regras() from public, anon, authenticated;

create trigger a1_fichas_regras before insert or update or delete on public.fichas
  for each row execute function public.fichas_regras();

-- -----------------------------------------------------------------------------
-- 5. Trilha de auditoria (LOG-05), só com o id (LOG-04). Grava o estabelecimento da
--    própria ficha porque a assinatura chega sem sessão (link da cliente).
-- -----------------------------------------------------------------------------
alter table public.access_logs drop constraint if exists access_logs_acao_check;
alter table public.access_logs add constraint access_logs_acao_check check (acao in (
  'login', 'login_negado', 'logout', 'usuario_criado', 'permissao_alterada', 'alterou', 'excluiu',
  'fechamento_gerado', 'fechamento_assinado', 'fechamento_contestado', 'fechamento_cancelado',
  'pacote_vendido', 'pacote_renovado', 'pacote_anulado', 'estabelecimento_criado',
  'mfa_ativado', 'mfa_verificado', 'mfa_falhou', 'mfa_removido',
  'exportou',
  'ficha_criada', 'ficha_link_gerado', 'ficha_assinada', 'ficha_cancelada'
));

create or replace function public.fichas_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_linha public.fichas := case when tg_op = 'DELETE' then old else new end;
  v_acao text;
  v_cab jsonb;
begin
  v_acao := case
    when tg_op = 'INSERT' then 'ficha_criada'
    when tg_op = 'DELETE' then 'excluiu'
    when new.status = 'assinada' and old.status <> 'assinada' then 'ficha_assinada'
    when new.status = 'cancelada' and old.status <> 'cancelada' then 'ficha_cancelada'
    when new.token_hash is distinct from old.token_hash and new.token_hash is not null then 'ficha_link_gerado'
    else 'alterou' end;
  begin
    v_cab := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_cab := null;
  end;
  insert into public.access_logs (auth_id, user_id, acao, entidade, entidade_id, detalhes, ip, user_agent, estabelecimento_id)
  values (
    auth.uid(),
    (select id from public.users where auth_id = auth.uid() limit 1),
    v_acao, 'fichas', v_linha.id::text, null,
    left(nullif(coalesce(v_cab ->> 'cf-connecting-ip', btrim(split_part(v_cab ->> 'x-forwarded-for', ',', 1)), v_cab ->> 'x-real-ip'), ''), 64),
    left(v_cab ->> 'user-agent', 300),
    v_linha.estabelecimento_id);
  return null;
end;
$$;
revoke execute on function public.fichas_auditoria() from public, anon, authenticated;

create trigger fichas_auditoria after insert or update or delete on public.fichas
  for each row execute function public.fichas_auditoria();

-- -----------------------------------------------------------------------------
-- 6. Link da cliente (token de uso único; só o hash fica no banco)
-- -----------------------------------------------------------------------------
create or replace function public.ficha_gerar_link(p_ficha uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ficha public.fichas;
  v_token text;
  v_expira timestamptz := now() + interval '72 hours';
begin
  if not public.usuario_ativo() then
    raise exception 'Você não tem permissão para esta ação.' using errcode = 'P0001';
  end if;
  select * into v_ficha from public.fichas f
   where f.id = p_ficha
     and f.estabelecimento_id = public.estabelecimento_atual()
     and (public.usuario_admin() or f.profissional_id = public.usuario_atual_id());
  if not found then
    raise exception 'Ficha não encontrada.' using errcode = 'P0001';
  end if;
  if v_ficha.status <> 'pendente' then
    raise exception 'Só ficha pendente recebe link.' using errcode = 'P0001';
  end if;
  -- gen_random_uuid() usa o gerador criptográfico do Postgres (CRI-06): 2 x 122 bits.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  perform set_config('app.ficha_interna', '1', true);
  update public.fichas
     set token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), token_expira_em = v_expira
   where id = v_ficha.id;
  perform set_config('app.ficha_interna', '', true);
  return jsonb_build_object('token', v_token, 'expira_em', v_expira);
end;
$$;
revoke execute on function public.ficha_gerar_link(uuid) from public, anon;
grant execute on function public.ficha_gerar_link(uuid) to authenticated;

-- Ficha pendente pelo token (sem login). Devolve só o necessário para preencher.
create or replace function public.ficha_publica_abrir(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Link inválido ou vencido. Peça um novo link ao salão.' using errcode = 'P0001';
  end if;
  select f.tipo, f.titulo, f.modelo_visual, f.campos, f.dados_salao, f.token_expira_em,
         e.nome as estabelecimento, split_part(btrim(c.name), ' ', 1) as primeiro_nome, u.name as profissional
    into v
    from public.fichas f
    join public.estabelecimentos e on e.id = f.estabelecimento_id and e.status = 'ativo'
    join public.clients c on c.id = f.client_id
    left join public.users u on u.id = f.profissional_id
   where f.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and f.status = 'pendente' and f.token_expira_em > now();
  if not found then
    raise exception 'Link inválido ou vencido. Peça um novo link ao salão.' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'tipo', v.tipo, 'titulo', v.titulo, 'modelo_visual', v.modelo_visual, 'campos', v.campos,
    'dados_salao', v.dados_salao, 'expira_em', v.token_expira_em, 'estabelecimento', v.estabelecimento,
    'primeiro_nome', v.primeiro_nome, 'profissional', v.profissional);
end;
$$;
revoke execute on function public.ficha_publica_abrir(text) from public;
grant execute on function public.ficha_publica_abrir(text) to anon, authenticated;

-- Assinatura de imagem PNG (assinatura do arquivo conferida pelo conteúdo, UPL-01).
create or replace function public.ficha_png_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p is null or char_length(p) < 200 or char_length(p) > 400000 or p !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then
    return false;
  end if;
  return substr(decode(substr(p, 23), 'base64'), 1, 8) = '\x89504e470d0a1a0a'::bytea;
exception when others then
  return false;
end;
$$;

create or replace function public.ficha_publica_assinar(
  p_token text,
  p_respostas jsonb,
  p_assinatura text,
  p_responsavel jsonb default null,
  p_assinatura_responsavel text default null,
  p_dispositivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ficha public.fichas;
  v_erro text;
  v_campo_nasc text;
  v_nasc date;
  v_menor boolean := false;
  v_agora timestamptz := now();
  v_hash text;
  v_cab jsonb;
  v_ip text;
  v_resp_nome text;
  v_resp_cpf text;
  v_resp_parentesco text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Link inválido ou vencido. Peça um novo link ao salão.' using errcode = 'P0001';
  end if;
  -- Trava a linha: duas assinaturas simultâneas não passam (VAL-09).
  select f.* into v_ficha
    from public.fichas f
    join public.estabelecimentos e on e.id = f.estabelecimento_id and e.status = 'ativo'
   where f.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and f.status = 'pendente' and f.token_expira_em > v_agora
   for update of f;
  if not found then
    raise exception 'Link inválido ou vencido. Peça um novo link ao salão.' using errcode = 'P0001';
  end if;

  v_erro := public.ficha_validar_respostas(v_ficha.campos, p_respostas, 'cliente');
  if v_erro is not null then
    raise exception '%', v_erro using errcode = 'P0001';
  end if;
  if not public.ficha_png_valido(p_assinatura) then
    raise exception 'Faça a sua assinatura no quadro.' using errcode = 'P0001';
  end if;

  -- Menor de idade (CC, arts. 3º a 5º): assina junto o responsável legal.
  v_campo_nasc := v_ficha.campos ->> 'campoNascimento';
  if v_campo_nasc is not null and (p_respostas ->> v_campo_nasc) is not null then
    v_nasc := (p_respostas ->> v_campo_nasc)::date;
    v_menor := v_nasc > (current_date - interval '18 years')::date;
  end if;
  if v_menor then
    if p_responsavel is null or jsonb_typeof(p_responsavel) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_responsavel) k where k not in ('nome', 'cpf', 'parentesco')) then
      raise exception 'Menor de idade: informe os dados do responsável legal.' using errcode = 'P0001';
    end if;
    v_resp_nome := btrim(coalesce(p_responsavel ->> 'nome', ''));
    v_resp_cpf := coalesce(p_responsavel ->> 'cpf', '');
    v_resp_parentesco := btrim(coalesce(p_responsavel ->> 'parentesco', ''));
    if char_length(v_resp_nome) not between 3 and 200 or char_length(v_resp_parentesco) not between 2 and 60 then
      raise exception 'Menor de idade: informe nome e parentesco do responsável legal.' using errcode = 'P0001';
    end if;
    if not public.ficha_cpf_valido(v_resp_cpf) then
      raise exception 'CPF do responsável inválido.' using errcode = 'P0001';
    end if;
    if not public.ficha_png_valido(p_assinatura_responsavel) then
      raise exception 'Menor de idade: o responsável legal também precisa assinar.' using errcode = 'P0001';
    end if;
  elsif p_responsavel is not null or p_assinatura_responsavel is not null then
    raise exception 'Responsável legal só é pedido para menor de idade.' using errcode = 'P0001';
  end if;

  begin
    v_cab := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_cab := null;
  end;
  v_ip := left(nullif(coalesce(v_cab ->> 'cf-connecting-ip', btrim(split_part(v_cab ->> 'x-forwarded-for', ',', 1)), v_cab ->> 'x-real-ip'), ''), 64);

  -- Evidência de integridade: qualquer alteração no conteúdo muda o hash.
  v_hash := encode(sha256(convert_to(concat_ws('|',
    v_ficha.id::text, v_ficha.versao, v_ficha.campos::text, v_ficha.dados_salao::text, p_respostas::text,
    p_assinatura, coalesce(p_assinatura_responsavel, ''), coalesce(v_resp_nome, ''), coalesce(v_resp_cpf, ''),
    to_char(v_agora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')), 'UTF8')), 'hex');

  perform set_config('app.ficha_interna', '1', true);
  update public.fichas set
    respostas = p_respostas,
    assinatura_cliente = p_assinatura,
    assinatura_responsavel = case when v_menor then p_assinatura_responsavel end,
    responsavel_nome = v_resp_nome,
    responsavel_cpf = nullif(v_resp_cpf, ''),
    responsavel_parentesco = v_resp_parentesco,
    assinado_em = v_agora,
    assinatura_ip = v_ip,
    assinatura_dispositivo = left(coalesce(nullif(btrim(p_dispositivo), ''), v_cab ->> 'user-agent'), 300),
    hash_documento = v_hash,
    status = 'assinada',
    token_hash = null,
    token_expira_em = null
  where id = v_ficha.id;
  perform set_config('app.ficha_interna', '', true);

  return jsonb_build_object('assinado_em', v_agora, 'hash', v_hash);
end;
$$;
revoke execute on function public.ficha_publica_assinar(text, jsonb, text, jsonb, text, text) from public;
grant execute on function public.ficha_publica_assinar(text, jsonb, text, jsonb, text, text) to anon, authenticated;

-- Funções internas: ninguém chama direto.
revoke execute on function public.ficha_cpf_valido(text) from public, anon, authenticated;
revoke execute on function public.ficha_validar_respostas(jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.ficha_png_valido(text) from public, anon, authenticated;

commit;

-- Conferência depois de aplicar:
--   select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('fichas', 'ficha_preferencias');
--   select has_table_privilege('anon', 'public.fichas', 'select');                                   -- false
--   select has_function_privilege('anon', 'public.ficha_publica_assinar(text, jsonb, text, jsonb, text, text)', 'execute'); -- true
--   select has_function_privilege('anon', 'public.ficha_gerar_link(uuid)', 'execute');               -- false
