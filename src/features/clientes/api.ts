// Origens e grupos de clientes. Origens: a equipe lê, a administradora cria.
// Grupos e membros: só a administradora (RLS). Lembrete por grupo: função do banco.
import { supabase } from '../../lib/supabase';
import { diferencaMembros } from './logic';

export type Origem = { id: string; nome: string };
export type Grupo = { id: string; nome: string; descricao: string | null };
export type ResumoAtendimento = { cliente_id: string; ultimo: string | null; proximo: string | null };
export type Membro = { grupo_id: string; cliente_id: string };

export const clientesKeys = {
  origens: ['clientes', 'origens'] as const,
  grupos: ['clientes', 'grupos'] as const,
  membros: ['clientes', 'grupos', 'membros'] as const,
  resumo: ['clientes', 'resumo-atendimentos'] as const,
};

async function rodar<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export async function listarOrigens(): Promise<Origem[]> {
  return ((await rodar(supabase.from('origens_cliente').select('id, nome').order('nome'))) ?? []) as Origem[];
}

export async function criarOrigem(nome: string): Promise<Origem> {
  return (await rodar(supabase.from('origens_cliente').insert([{ nome }]).select('id, nome').single())) as Origem;
}

export async function listarGrupos(): Promise<Grupo[]> {
  return ((await rodar(supabase.from('grupos_cliente').select('id, nome, descricao').order('nome'))) ?? []) as Grupo[];
}

export async function listarMembros(): Promise<Membro[]> {
  return ((await rodar(supabase.from('grupo_cliente_membros').select('grupo_id, cliente_id'))) ?? []) as Membro[];
}

export async function salvarGrupo(id: string | null, nome: string, descricao: string | null, atuais: string[], marcadas: string[]): Promise<string> {
  let grupoId = id;
  if (grupoId) {
    await rodar(supabase.from('grupos_cliente').update({ nome, descricao }).eq('id', grupoId));
  } else {
    const novo = (await rodar(supabase.from('grupos_cliente').insert([{ nome, descricao }]).select('id').single())) as { id: string };
    grupoId = novo.id;
  }
  const { incluir, remover } = diferencaMembros(atuais, marcadas);
  if (remover.length) await rodar(supabase.from('grupo_cliente_membros').delete().eq('grupo_id', grupoId).in('cliente_id', remover));
  if (incluir.length) await rodar(supabase.from('grupo_cliente_membros').insert(incluir.map((cliente_id) => ({ grupo_id: grupoId, cliente_id }))));
  return grupoId;
}

export async function salvarDescricaoGrupo(id: string, descricao: string | null) {
  await rodar(supabase.from('grupos_cliente').update({ descricao }).eq('id', id));
}

/** Último atendimento e próximo agendado por cliente (o RLS da agenda decide o que entra). */
export async function listarResumoAtendimentos(): Promise<ResumoAtendimento[]> {
  return ((await rodar(supabase.rpc('resumo_atendimentos_clientes'))) ?? []) as ResumoAtendimento[];
}

export async function excluirGrupo(id: string) {
  await rodar(supabase.from('grupos_cliente').delete().eq('id', id));
}

/** Um lembrete por cliente do grupo; devolve quantas clientes receberam. */
export async function agendarLembreteGrupo(p: { grupo: string; inicio: string; profissional: string | null; servico: string | null; texto: string | null; recorrente: boolean }): Promise<number> {
  const qtd = await rodar(supabase.rpc('agendar_lembrete_grupo', {
    p_grupo: p.grupo, p_inicio: p.inicio, p_profissional: p.profissional, p_servico: p.servico, p_texto: p.texto, p_meses: p.recorrente ? 24 : 1,
  }));
  return Number(qtd);
}
