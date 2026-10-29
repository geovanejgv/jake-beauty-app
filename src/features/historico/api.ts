// Histórico e reativação: leitura apenas. O RLS decide o que cada pessoa vê
// (clientes_reativacao é security invoker; a tela é da administradora).
import { supabase } from '../../lib/supabase';
import type { ClienteReativacao } from './logic';

export const historicoKeys = {
  reativacao: ['historico', 'reativacao'] as const,
  catalogo: ['historico', 'catalogo'] as const,
  telefones: ['historico', 'telefones'] as const,
};

async function rodar<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export async function listarClientesReativacao(): Promise<ClienteReativacao[]> {
  const linhas = ((await rodar(supabase.rpc('clientes_reativacao'))) ?? []) as ClienteReativacao[];
  return linhas.map((c) => ({
    ...c,
    total_12m: Number(c.total_12m ?? 0),
    ticket_medio_12m: c.ticket_medio_12m === null ? null : Number(c.ticket_medio_12m),
    intervalo_medio_dias: c.intervalo_medio_dias === null ? null : Number(c.intervalo_medio_dias),
  }));
}

export type CatalogoHistorico = {
  servicos: { id: string; nome: string; categoria_id: string }[];
  categorias: { id: string; nome: string }[];
};

export async function listarCatalogoHistorico(): Promise<CatalogoHistorico> {
  const [servicos, categorias] = await Promise.all([
    rodar(supabase.from('servicos').select('id, nome, categoria_id').order('nome')),
    rodar(supabase.from('categorias_servico').select('id, nome').order('nome')),
  ]);
  return { servicos: (servicos ?? []) as CatalogoHistorico['servicos'], categorias: (categorias ?? []) as CatalogoHistorico['categorias'] };
}

/** Telefone das clientes para a busca (vem mascarado para quem não tem permissão). */
export async function listarTelefones(): Promise<Map<string, string | null>> {
  const linhas = ((await rodar(supabase.from('clientes_visiveis').select('id, phone').limit(10000))) ?? []) as { id: string; phone: string | null }[];
  return new Map(linhas.map((l) => [l.id, l.phone]));
}
