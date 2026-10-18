// Leads: só a administradora lê e grava (RLS). Autor, responsável padrão, data do
// fechamento e limpeza do motivo da perda são gravados pelo gatilho do banco.
import { supabase } from '../../lib/supabase';
import type { DadosLead, EtapaLead, Lead } from './logic';

export const leadsKeys = {
  lista: ['leads'] as const,
  equipe: ['leads', 'equipe'] as const,
  interesses: ['leads', 'interesses'] as const,
};

const CAMPOS = 'id, nome, telefone, email, origem, interesse, resumo, etapa, valor_estimado, proxima_acao, proxima_acao_em, motivo_perda, responsavel_id, client_id, fechado_em, created_at, updated_at';

async function rodar<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export async function listarLeads(): Promise<Lead[]> {
  const linhas = (await rodar(supabase.from('leads').select(CAMPOS).order('updated_at', { ascending: false }).limit(500))) ?? [];
  return (linhas as Lead[]).map((l) => ({ ...l, valor_estimado: l.valor_estimado === null ? null : Number(l.valor_estimado) }));
}

export async function buscarLead(id: string): Promise<Pick<Lead, 'id' | 'nome' | 'telefone' | 'email'> | null> {
  return (await rodar(supabase.from('leads').select('id, nome, telefone, email').eq('id', id).maybeSingle())) as Pick<Lead, 'id' | 'nome' | 'telefone' | 'email'> | null;
}

export async function criarLead(d: DadosLead) {
  await rodar(supabase.from('leads').insert([d]));
}

export async function atualizarLead(id: string, d: Partial<DadosLead>) {
  await rodar(supabase.from('leads').update(d).eq('id', id));
}

export async function moverLead(id: string, etapa: EtapaLead) {
  await rodar(supabase.from('leads').update({ etapa }).eq('id', id));
}

export async function vincularCliente(id: string, clientId: string) {
  await rodar(supabase.from('leads').update({ client_id: clientId }).eq('id', id));
}

export async function excluirLead(id: string) {
  await rodar(supabase.from('leads').delete().eq('id', id));
}

/** Equipe ativa para o campo Responsável. */
export async function listarEquipe(): Promise<{ id: string; name: string }[]> {
  return ((await rodar(supabase.from('users').select('id, name').eq('active', true).order('name'))) ?? []) as { id: string; name: string }[];
}

/** Nomes dos serviços do catálogo, para sugerir no campo Interesse. */
export async function listarNomesServicos(): Promise<string[]> {
  const linhas = ((await rodar(supabase.from('servicos').select('nome').eq('ativo', true).limit(1000))) ?? []) as { nome: string }[];
  return linhas.map((s) => s.nome);
}
