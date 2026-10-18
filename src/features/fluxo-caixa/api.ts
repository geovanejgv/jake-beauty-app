// Consultas do fluxo de caixa, compartilhadas pelo Resumo Diário e por Finanças (mesmas chaves de cache).
import { supabase } from '../../lib/supabase';
import type { Venda } from '../pacotes/api';

export const fluxoKeys = {
  atendimentos: ['dashboard-financials'] as const,
  despesas: ['dashboard-expenses'] as const,
};

/** Atendimentos concluídos com o valor do atendimento (o cobrado; nos antigos, o do registro avulso). */
export async function listarAtendimentosConcluidos(): Promise<any[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select(`id, start_time, status, payment_method, installments, notes, valor_cobrado, gorjeta, servico_id, professional_id, clients ( name ), services ( id, name, price ), servicos ( nome )`)
    .eq('status', 'completed')
    .order('start_time', { ascending: false });
  if (error) throw error;
  return (data || []).map((a: any) => ({ ...a, services: { id: a.services?.id, name: a.servicos?.nome ?? a.services?.name ?? a.notes ?? 'Atendimento', price: a.valor_cobrado ?? a.services?.price ?? 0 } }));
}

export async function listarDespesas(): Promise<any[]> {
  const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Receitas do fluxo: atendimentos (menos sessões de pacote, já faturadas na venda) + vendas de pacote. */
export function receitasDoFluxo(atendimentos: any[], vendasPacote: Venda[]): any[] {
  return [
    ...atendimentos.filter((a: any) => a.payment_method !== 'pacote'),
    ...vendasPacote.map((v) => ({
      id: `pacote-${v.id}`, ehPacote: true, start_time: v.vendido_em, payment_method: 'pacote_venda', clients: { name: v.cliente_nome },
      services: { name: `Pacote: ${v.nome}`, price: v.valor_total },
    })),
  ];
}

/** Dia local (YYYY-MM-DD) de um instante; atendimentos após 21h não caem no dia seguinte. */
export const diaLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};
