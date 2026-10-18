-- Cadastro rápido de cliente na Agenda: também aniversário e origem (opcionais, null).
-- Versão nova com 4 parâmetros; a de 2 continua e passa a chamar a nova (sem drop,
-- para a tela antiga seguir funcionando durante a publicação).
create function public.cadastrar_cliente_rapido(
  p_nome text,
  p_telefone text,
  p_aniversario date,
  p_origem uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_tel text := btrim(coalesce(p_telefone, ''));
begin
  if not public.usuario_ativo() then
    raise exception 'Acesso ainda não liberado.';
  end if;
  if char_length(v_nome) not between 2 and 255 then
    raise exception 'Informe o nome da cliente.';
  end if;
  if char_length(v_tel) > 20 then
    raise exception 'Telefone inválido.';
  end if;
  if p_aniversario is not null and (p_aniversario > current_date or p_aniversario < date '1900-01-01') then
    raise exception 'Data de aniversário inválida.';
  end if;
  if p_origem is not null and not exists (
    select 1 from public.origens_cliente where id = p_origem and estabelecimento_id = public.estabelecimento_atual()
  ) then
    raise exception 'Origem inválida.';
  end if;
  insert into public.clients (name, phone, birthday, origem_id)
  values (v_nome, v_tel, p_aniversario, p_origem)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.cadastrar_cliente_rapido(text, text, date, uuid) from public, anon;
grant execute on function public.cadastrar_cliente_rapido(text, text, date, uuid) to authenticated;

create or replace function public.cadastrar_cliente_rapido(p_nome text, p_telefone text)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.cadastrar_cliente_rapido(p_nome, p_telefone, null::date, null::uuid);
$$;
