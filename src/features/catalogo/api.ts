// Catálogo de serviços (categorias, serviços) e vínculo por profissional (usuario_servico).
import { supabase } from '../../lib/supabase';

export type Categoria = { id: string; nome: string; cor: string; ordem: number; ativo: boolean };
export type Servico = {
  id: string; categoria_id: string; nome: string; descricao: string | null; preco_base: number;
  duracao_base_minutos: number; comissao_base_percentual: number | null; custo_material: number;
  retorno_dias: number | null; ativo: boolean;
};
export type Vinculo = {
  user_id: string; servico_id: string; valor_personalizado: number | null;
  tempo_execucao_minutos: number | null; comissao_percentual: number | null; ativo: boolean;
};

export const catalogoKeys = {
  categorias: ['catalogo', 'categorias'] as const,
  servicos: ['catalogo', 'servicos'] as const,
  vinculos: (userId?: string) => ['catalogo', 'vinculos', userId ?? 'todos'] as const,
};

async function rodar<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export const listarCategorias = async () =>
  (await rodar(supabase.from('categorias_servico').select('id, nome, cor, ordem, ativo').order('ordem').order('nome'))) as Categoria[];

export const listarServicos = async () =>
  (await rodar(supabase.from('servicos').select('id, categoria_id, nome, descricao, preco_base, duracao_base_minutos, comissao_base_percentual, custo_material, retorno_dias, ativo').order('nome'))) as Servico[];

/** RLS: a administradora lê todos; o profissional, só os próprios vínculos. */
export async function listarVinculos(userId?: string): Promise<Vinculo[]> {
  let q = supabase.from('usuario_servico').select('user_id, servico_id, valor_personalizado, tempo_execucao_minutos, comissao_percentual, ativo');
  if (userId) q = q.eq('user_id', userId);
  return (await rodar(q)) as Vinculo[];
}

export async function salvarCategoria(c: Partial<Categoria> & { nome: string }) {
  const dados = { nome: c.nome.trim(), cor: c.cor ?? '#e11d48', ordem: c.ordem ?? 0, ativo: c.ativo ?? true };
  if (c.id) await rodar(supabase.from('categorias_servico').update(dados).eq('id', c.id));
  else await rodar(supabase.from('categorias_servico').insert([dados]));
}

export const excluirCategoria = async (id: string) => { await rodar(supabase.from('categorias_servico').delete().eq('id', id)); };

export async function salvarServico(s: Omit<Servico, 'id'> & { id?: string }) {
  const { id, ...dados } = s;
  const limpo = { ...dados, nome: dados.nome.trim(), descricao: dados.descricao?.trim() || null };
  if (id) await rodar(supabase.from('servicos').update(limpo).eq('id', id));
  else await rodar(supabase.from('servicos').insert([limpo]));
}

export const excluirServico = async (id: string) => { await rodar(supabase.from('servicos').delete().eq('id', id)); };

/** Habilita/desabilita vários serviços de uma vez (mantém preço, tempo e comissão já ajustados). */
export const habilitarServicos = async (userId: string, servicos: string[], ativo: boolean) =>
  (await rodar(supabase.rpc('habilitar_servicos', { p_user: userId, p_servicos: servicos, p_ativo: ativo }))) as number;

export async function salvarVinculo(v: Vinculo) {
  await rodar(supabase.from('usuario_servico').upsert(v, { onConflict: 'user_id,servico_id' }));
}

/** Taxa fixa do profissional (perfil): vale para todo serviço sem comissão própria no vínculo. */
export async function salvarComissaoPadrao(userId: string, percentual: number | null) {
  await rodar(supabase.from('perfis_profissionais').upsert({ user_id: userId, comissao_padrao_percentual: percentual }, { onConflict: 'user_id' }));
}
