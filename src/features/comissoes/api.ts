// Atendimentos para relatórios, fechamentos de comissão e assinatura digital.
import { supabase } from '../../lib/supabase';
import { intervaloLocal } from '../../lib/formatos';
import type { FormaPagamento, Regras, StatusAgendamento, StatusFechamento } from './logic';

export type LinhaAtendimento = {
  id: string;
  start_time: string;
  end_time: string;
  status: StatusAgendamento;
  valor_cobrado: number | null;
  comissao_percentual: number | null;
  gorjeta: number | null;
  payment_method: string | null;
  professional_id: string | null;
  client_id: string | null;
  servico_id: string | null;
  service_id: string | null;
  cliente_nome: string;
  servico_nome: string;
  custo_material: number;
  profissional_nome: string;
  /** Fechamento ativo (não cancelado) que já inclui o atendimento. */
  fechamento: { id: string; status: StatusFechamento; valor_liquido: number; valor_comissao: number } | null;
};

export type Fechamento = {
  id: string; profissional_id: string; profissional_nome: string; periodo_inicio: string; periodo_fim: string; status: StatusFechamento;
  qtd_atendimentos: number; total_bruto: number; total_taxas: number; total_materiais: number; total_comissao: number;
  total_gorjetas: number; total_a_pagar: number; descontou_taxa: boolean; descontou_material: boolean; observacao: string | null;
  created_at: string; contestacao: string | null; contestado_em: string | null; cancelado_em: string | null; cancelamento_motivo: string | null;
  assinado_em: string | null; assinado_ip: string | null; assinado_user_agent: string | null; assinatura_hash: string | null;
};

export type ItemFechamento = {
  id: string; agendamento_id: string; data_atendimento: string; cliente_nome: string; servico_nome: string; forma_pagamento: string | null;
  valor_bruto: number; taxa_percentual: number; valor_taxa: number; custo_material: number; base_calculo: number;
  comissao_percentual: number; valor_comissao: number; gorjeta: number; valor_liquido: number;
};

export const comissoesKeys = {
  base: ['comissoes'] as const,
  atendimentos: (f: object) => ['comissoes', 'atendimentos', f] as const,
  fechamentos: (f: object) => ['comissoes', 'fechamentos', f] as const,
  itens: (id: string) => ['comissoes', 'itens', id] as const,
  regras: ['comissoes', 'regras'] as const,
};

async function rodar<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

const LIMITE = 2000;
const LOTE = 150; // evita URL longa demais em filtros "in" grandes

/** Executa a consulta em lotes de IDs e junta os resultados. */
async function emLotes<T>(ids: string[], consulta: (lote: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const partes: T[] = [];
  for (let i = 0; i < ids.length; i += LOTE) partes.push(...((await rodar(consulta(ids.slice(i, i + LOTE)))) as T[]));
  return partes;
}

/** Atendimentos (sem bloqueios e lembretes) de um período local; RLS limita o profissional aos próprios. */
export async function listarAtendimentos(f: { de: string; ate: string; profissionalId?: string | null; status?: StatusAgendamento[] }): Promise<LinhaAtendimento[]> {
  const { de, ate } = intervaloLocal(f.de, f.ate);
  let q = supabase
    .from('appointments')
    .select('id, start_time, end_time, status, valor_cobrado, comissao_percentual, gorjeta, payment_method, professional_id, client_id, servico_id, service_id, is_block, is_manual_reminder')
    .gte('start_time', de)
    .lt('start_time', ate)
    .order('start_time')
    .limit(LIMITE);
  if (f.profissionalId) q = q.eq('professional_id', f.profissionalId);
  if (f.status?.length) q = q.in('status', f.status);
  const brutos = ((await rodar(q)) as (Omit<LinhaAtendimento, 'cliente_nome' | 'servico_nome' | 'custo_material' | 'profissional_nome' | 'fechamento'> & { is_block: boolean | null; is_manual_reminder: boolean | null })[])
    .filter((a) => !a.is_block && !a.is_manual_reminder);
  if (!brutos.length) return [];

  const ids = (campo: 'client_id' | 'servico_id' | 'service_id' | 'professional_id') => [...new Set(brutos.map((a) => a[campo]).filter(Boolean))] as string[];
  const [clientes, servicos, legados, pessoas, itens] = await Promise.all([
    emLotes(ids('client_id'), (l) => supabase.from('clientes_visiveis').select('id, name').in('id', l)),
    emLotes(ids('servico_id'), (l) => supabase.from('servicos').select('id, nome, custo_material').in('id', l)),
    emLotes(ids('service_id'), (l) => supabase.from('services').select('id, name').in('id', l)),
    emLotes(ids('professional_id'), (l) => supabase.from('users').select('id, name').in('id', l)),
    emLotes(brutos.map((a) => a.id), (l) => supabase.from('fechamento_itens').select('agendamento_id, valor_liquido, valor_comissao, fechamentos!inner(id, status)').in('agendamento_id', l).neq('fechamentos.status', 'cancelado')),
  ]);
  const mapa = <T extends { id: string }>(l: T[]) => new Map(l.map((x) => [x.id, x]));
  const mc = mapa(clientes as { id: string; name: string }[]);
  const ms = mapa(servicos as { id: string; nome: string; custo_material: number }[]);
  const ml = mapa(legados as { id: string; name: string }[]);
  const mp = mapa(pessoas as { id: string; name: string }[]);
  const mf = new Map((itens as unknown as { agendamento_id: string; valor_liquido: number; valor_comissao: number; fechamentos: { id: string; status: StatusFechamento } }[])
    .map((i) => [i.agendamento_id, { id: i.fechamentos.id, status: i.fechamentos.status, valor_liquido: Number(i.valor_liquido), valor_comissao: Number(i.valor_comissao) }]));

  return brutos.map((a) => ({
    ...a,
    cliente_nome: (a.client_id && mc.get(a.client_id)?.name) || 'Cliente',
    servico_nome: (a.servico_id && ms.get(a.servico_id)?.nome) || (a.service_id && ml.get(a.service_id)?.name) || 'Atendimento',
    custo_material: Number((a.servico_id && ms.get(a.servico_id)?.custo_material) ?? 0),
    profissional_nome: (a.professional_id && mp.get(a.professional_id)?.name) || 'Sem profissional',
    fechamento: mf.get(a.id) ?? null,
  }));
}

export async function lerRegras(): Promise<Regras> {
  const [cfg, taxas] = await Promise.all([
    rodar(supabase.from('configuracoes_comissao').select('descontar_taxa_pagamento, descontar_custo_material').maybeSingle()),
    rodar(supabase.from('taxas_pagamento').select('forma, percentual')),
  ]);
  const c = cfg as { descontar_taxa_pagamento: boolean; descontar_custo_material: boolean } | null;
  return {
    descontarTaxa: c?.descontar_taxa_pagamento ?? true,
    descontarMaterial: c?.descontar_custo_material ?? false,
    taxas: Object.fromEntries((taxas as { forma: FormaPagamento; percentual: number }[]).map((t) => [t.forma, Number(t.percentual)])),
  };
}

const CAMPOS_FECHAMENTO = 'id, profissional_id, periodo_inicio, periodo_fim, status, qtd_atendimentos, total_bruto, total_taxas, total_materiais, total_comissao, total_gorjetas, total_a_pagar, descontou_taxa, descontou_material, observacao, created_at, contestacao, contestado_em, cancelado_em, cancelamento_motivo, assinado_em, assinado_ip, assinado_user_agent, assinatura_hash';

export async function listarFechamentos(f: { profissionalId?: string | null; status?: StatusFechamento[] } = {}): Promise<Fechamento[]> {
  let q = supabase.from('fechamentos').select(CAMPOS_FECHAMENTO).order('created_at', { ascending: false }).limit(500);
  if (f.profissionalId) q = q.eq('profissional_id', f.profissionalId);
  if (f.status?.length) q = q.in('status', f.status);
  const lista = (await rodar(q)) as Omit<Fechamento, 'profissional_nome'>[];
  const ids = [...new Set(lista.map((x) => x.profissional_id))];
  const pessoas = ids.length ? ((await rodar(supabase.from('users').select('id, name').in('id', ids))) as { id: string; name: string }[]) : [];
  const nomes = new Map(pessoas.map((p) => [p.id, p.name]));
  return lista.map((x) => ({ ...x, profissional_nome: nomes.get(x.profissional_id) ?? 'Profissional' }));
}

export const listarItens = async (fechamentoId: string) =>
  (await rodar(supabase.from('fechamento_itens').select('id, agendamento_id, data_atendimento, cliente_nome, servico_nome, forma_pagamento, valor_bruto, taxa_percentual, valor_taxa, custo_material, base_calculo, comissao_percentual, valor_comissao, gorjeta, valor_liquido').eq('fechamento_id', fechamentoId).order('data_atendimento'))) as ItemFechamento[];

export const gerarFechamento = async (profissionalId: string, inicio: string, fim: string, observacao?: string) =>
  (await rodar(supabase.rpc('gerar_fechamento', { p_profissional: profissionalId, p_inicio: inicio, p_fim: fim, p_observacao: observacao || null }))) as string;

export const assinarFechamento = async (id: string) => (await rodar(supabase.rpc('assinar_fechamento', { p_id: id }))) as string;
export const contestarFechamento = async (id: string, motivo: string) => { await rodar(supabase.rpc('contestar_fechamento', { p_id: id, p_motivo: motivo })); };
export const cancelarFechamento = async (id: string, motivo: string) => { await rodar(supabase.rpc('cancelar_fechamento', { p_id: id, p_motivo: motivo })); };
export const verificarFechamento = async (id: string) => (await rodar(supabase.rpc('verificar_fechamento', { p_id: id }))) as boolean;

/** Gorjeta registrada pela administradora (bloqueado pelo banco se já estiver em fechamento). */
export async function salvarGorjeta(agendamentoId: string, valor: number) {
  await rodar(supabase.from('appointments').update({ gorjeta: valor }).eq('id', agendamentoId));
}
