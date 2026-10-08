// Pacotes de sessões: leitura do saldo e chamadas às funções do banco (venda, renovação,
// anulação). As tabelas só aceitam escrita pelas funções; a administradora lê o extrato.
import { supabase } from '../../lib/supabase';
import type { FormaVenda, LinhaSaldo, PagamentoVenda } from './logic';

export const pacotesKeys = {
  base: ['pacotes'] as const,
  saldos: (clienteId: string | null, encerrados: boolean) => ['pacotes', 'saldos', clienteId ?? 'todos', encerrados] as const,
  detalhe: (pacoteId: string) => ['pacotes', 'detalhe', pacoteId] as const,
  vendas: ['pacotes', 'vendas'] as const,
};

async function rodar<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Saldo por serviço. Sem cliente: todos (só administradora). Profissional recebe sem valores. */
export async function listarSaldos(clienteId: string | null, incluirEncerrados = false): Promise<LinhaSaldo[]> {
  const dados = (await rodar(supabase.rpc('pacote_saldos', { p_cliente: clienteId, p_incluir_encerrados: incluirEncerrados }))) as LinhaSaldo[] | null;
  return (dados ?? []).map((l) => ({
    ...l,
    sessoes: Number(l.sessoes), usadas: Number(l.usadas), faltas: Number(l.faltas), reservadas: Number(l.reservadas),
    disponiveis: Number(l.disponiveis), valor_sessao: numero(l.valor_sessao), valor_restante: numero(l.valor_restante),
    comissao_percentual: numero(l.comissao_percentual),
  }));
}

export type Pacote = {
  id: string; cliente_id: string; nome: string; valor_total: number; taxa_percentual: number; validade: string;
  status: 'ativo' | 'anulado'; vendido_em: string; vendido_por: string | null; observacao: string | null;
  anulado_em: string | null; anulacao_motivo: string | null;
};
export type Pagamento = { id: string; forma: FormaVenda; parcelas: number; valor: number; taxa_percentual: number };
export type Movimento = {
  id: string; item_id: string | null; agendamento_id: string | null; tipo: 'uso' | 'falta' | 'renovacao';
  valor: number; detalhe: string | null; autor_id: string | null; created_at: string;
  appointments: { start_time: string; professional_id: string | null } | null;
};

export async function lerPacote(id: string) {
  const [pacote, pagamentos, movimentos] = await Promise.all([
    rodar(supabase.from('pacotes').select('id, cliente_id, nome, valor_total, taxa_percentual, validade, status, vendido_em, vendido_por, observacao, anulado_em, anulacao_motivo').eq('id', id).single()),
    rodar(supabase.from('pacote_pagamentos').select('id, forma, parcelas, valor, taxa_percentual').eq('pacote_id', id).order('created_at')),
    rodar(supabase.from('pacote_movimentos').select('id, item_id, agendamento_id, tipo, valor, detalhe, autor_id, created_at, appointments(start_time, professional_id)').eq('pacote_id', id).order('created_at', { ascending: false })),
  ]);
  return { pacote: pacote as unknown as Pacote, pagamentos: pagamentos as unknown as Pagamento[], movimentos: movimentos as unknown as Movimento[] };
}

/** Vendas ativas para o Resumo (faturamento entra na data da venda; nota fiscal na venda). */
export type Venda = { id: string; cliente_id: string; nome: string; valor_total: number; vendido_em: string; cliente_nome: string };
export async function listarVendas(): Promise<Venda[]> {
  const dados = await rodar(supabase.from('pacotes').select('id, cliente_id, nome, valor_total, vendido_em, clients(name)').eq('status', 'ativo').order('vendido_em', { ascending: false }));
  return (dados as unknown as (Omit<Venda, 'cliente_nome'> & { clients: { name: string } | null })[]).map((v) => ({
    id: v.id, cliente_id: v.cliente_id, nome: v.nome, valor_total: Number(v.valor_total), vendido_em: v.vendido_em, cliente_nome: v.clients?.name ?? 'Cliente',
  }));
}

export type NovaVenda = {
  clienteId: string; nome: string; validade: string; valorTotal: number; observacao: string;
  itens: { servico_id: string; sessoes: number; comissao_percentual: number }[];
  pagamentos: PagamentoVenda[];
};

export async function venderPacote(v: NovaVenda): Promise<string> {
  return (await rodar(supabase.rpc('vender_pacote', {
    p_cliente: v.clienteId, p_nome: v.nome, p_validade: v.validade, p_valor_total: v.valorTotal,
    p_itens: v.itens, p_pagamentos: v.pagamentos, p_observacao: v.observacao || null,
  }))) as string;
}

export async function renovarPacote(id: string, validade: string, motivo: string) {
  await rodar(supabase.rpc('renovar_pacote', { p_id: id, p_validade: validade, p_motivo: motivo }));
}

export async function anularPacote(id: string, motivo: string) {
  await rodar(supabase.rpc('anular_pacote', { p_id: id, p_motivo: motivo }));
}
