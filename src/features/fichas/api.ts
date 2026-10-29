// Fichas: a administradora vê as do estabelecimento; a profissional, só as dela (RLS).
// Criar só pendente, cancelar com motivo, gerar link e assinar: regras no banco
// (gatilho fichas_regras e funções ficha_*), não na tela.
import { supabase } from '../../lib/supabase';
import type { EsquemaFicha, IdTema, Respostas, Responsavel, TipoFicha } from './tipos';

export type StatusFicha = 'pendente' | 'assinada' | 'cancelada';

export type FichaResumo = {
  id: string;
  client_id: string;
  profissional_id: string | null;
  tipo: TipoFicha;
  titulo: string;
  status: StatusFicha;
  token_expira_em: string | null;
  assinado_em: string | null;
  created_at: string;
};

export type Ficha = FichaResumo & {
  modelo_visual: IdTema;
  versao: string;
  campos: EsquemaFicha;
  dados_salao: Respostas;
  respostas: Respostas | null;
  assinatura_cliente: string | null;
  assinatura_responsavel: string | null;
  responsavel_nome: string | null;
  responsavel_cpf: string | null;
  responsavel_parentesco: string | null;
  assinatura_ip: string | null;
  assinatura_dispositivo: string | null;
  hash_documento: string | null;
  cancelado_motivo: string | null;
};

export type FichaPublica = {
  tipo: TipoFicha;
  titulo: string;
  modelo_visual: IdTema;
  campos: EsquemaFicha;
  dados_salao: Respostas;
  expira_em: string;
  estabelecimento: string;
  primeiro_nome: string;
  profissional: string | null;
};

export const fichasKeys = {
  lista: ['fichas'] as const,
  uma: (id: string) => ['fichas', id] as const,
  preferencias: ['fichas', 'preferencias'] as const,
  clientes: ['fichas', 'clientes'] as const,
};

const RESUMO = 'id, client_id, profissional_id, tipo, titulo, status, token_expira_em, assinado_em, created_at';

async function rodar<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export async function listarFichas(): Promise<FichaResumo[]> {
  return ((await rodar(supabase.from('fichas').select(RESUMO).order('created_at', { ascending: false }).limit(300))) ?? []) as FichaResumo[];
}

export async function buscarFicha(id: string): Promise<Ficha | null> {
  return (await rodar(supabase.from('fichas').select(`${RESUMO}, modelo_visual, versao, campos, dados_salao, respostas, assinatura_cliente, assinatura_responsavel, responsavel_nome, responsavel_cpf, responsavel_parentesco, assinatura_ip, assinatura_dispositivo, hash_documento, cancelado_motivo`).eq('id', id).maybeSingle())) as Ficha | null;
}

/** Cria a ficha pendente; autor, profissional (para a profissional) e modelo visual vêm do banco. */
export async function criarFicha(d: { client_id: string; profissional_id: string | null; esquema: EsquemaFicha; dados_salao: Respostas }): Promise<string> {
  const linha = await rodar(supabase.from('fichas').insert([{
    client_id: d.client_id,
    profissional_id: d.profissional_id,
    tipo: d.esquema.tipo,
    titulo: d.esquema.titulo,
    versao: d.esquema.versao,
    campos: d.esquema,
    dados_salao: d.dados_salao,
  }]).select('id').single());
  return (linha as { id: string }).id;
}

export async function cancelarFicha(id: string, motivo: string) {
  await rodar(supabase.from('fichas').update({ status: 'cancelada', cancelado_motivo: motivo }).eq('id', id));
}

export async function excluirFicha(id: string) {
  await rodar(supabase.from('fichas').delete().eq('id', id));
}

/** Novo link (o anterior deixa de valer). O token só existe nesta resposta. */
export async function gerarLink(id: string): Promise<{ token: string; expira_em: string }> {
  return (await rodar(supabase.rpc('ficha_gerar_link', { p_ficha: id }))) as { token: string; expira_em: string };
}

export async function listarPreferencias(): Promise<Partial<Record<TipoFicha, IdTema>>> {
  const linhas = ((await rodar(supabase.from('ficha_preferencias').select('tipo, modelo_visual'))) ?? []) as { tipo: TipoFicha; modelo_visual: IdTema }[];
  return Object.fromEntries(linhas.map((l) => [l.tipo, l.modelo_visual]));
}

export async function salvarPreferencia(tipo: TipoFicha, modelo_visual: IdTema) {
  await rodar(supabase.from('ficha_preferencias').upsert([{ tipo, modelo_visual, updated_at: new Date().toISOString() }], { onConflict: 'estabelecimento_id,tipo' }));
}

/** Clientes visíveis para quem está logado (a profissional vê o nome; contato conforme permissão). */
export async function listarClientes(): Promise<{ id: string; name: string; phone: string | null; contato_visivel: boolean }[]> {
  return ((await rodar(supabase.from('clientes_visiveis').select('id, name, phone, contato_visivel').order('name').limit(5000))) ?? []) as
    { id: string; name: string; phone: string | null; contato_visivel: boolean }[];
}

// ----- Link da cliente (sem login) -----

export async function abrirFichaPublica(token: string): Promise<FichaPublica> {
  return (await rodar(supabase.rpc('ficha_publica_abrir', { p_token: token }))) as FichaPublica;
}

export async function assinarFichaPublica(d: {
  token: string; respostas: Respostas; assinatura: string; responsavel: Responsavel | null; assinaturaResponsavel: string | null;
}): Promise<{ assinado_em: string; hash: string }> {
  return (await rodar(supabase.rpc('ficha_publica_assinar', {
    p_token: d.token,
    p_respostas: d.respostas,
    p_assinatura: d.assinatura,
    p_responsavel: d.responsavel ? { nome: d.responsavel.nome.trim(), cpf: d.responsavel.cpf.replace(/\D/g, ''), parentesco: d.responsavel.parentesco.trim() } : null,
    p_assinatura_responsavel: d.assinaturaResponsavel,
    p_dispositivo: navigator.userAgent.slice(0, 300),
  }))) as { assinado_em: string; hash: string };
}
