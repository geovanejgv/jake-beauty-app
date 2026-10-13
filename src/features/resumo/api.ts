// Leituras do painel do dia (Resumo Diário). Só select; o RLS restringe ao estabelecimento
// e ao que o papel pode ver.
import { supabase } from '../../lib/supabase';
import { intervaloLocal } from '../../lib/formatos';
import type { EventoDoDia, LancamentoPendente, TarefaComPrazo } from './logic';

export const resumoKeys = {
  agenda: (dia: string) => ['resumo', 'agenda', dia] as const,
  tarefas: (dia: string) => ['resumo', 'tarefas', dia] as const,
  pagamentos: (ate: string) => ['resumo', 'pagamentos', ate] as const,
};

/** Eventos da agenda que começam no dia local (atendimentos, bloqueios e lembretes). */
export async function listarAgendaDoDia(dia: string): Promise<EventoDoDia[]> {
  const { de, ate } = intervaloLocal(dia, dia);
  const { data, error } = await supabase
    .from('appointments')
    .select('id, start_time, end_time, status, is_block, is_manual_reminder, block_reason, professional_id, notes, clients ( name ), servicos ( nome ), services ( name )')
    .gte('start_time', de)
    .lt('start_time', ate)
    .order('start_time', { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as EventoDoDia[];
}

/** Tarefas abertas (não canceladas nem concluídas) com prazo até o dia. */
export async function listarTarefasComPrazo(dia: string): Promise<TarefaComPrazo[]> {
  const { data, error } = await supabase
    .from('internal_tasks')
    .select('id, titulo, data_limite, status, criticidade, responsible_id')
    .is('cancelada_em', null)
    .neq('status', 'concluida')
    .not('data_limite', 'is', null)
    .lte('data_limite', dia)
    .order('data_limite', { ascending: true });
  if (error) throw error;
  return (data || []) as TarefaComPrazo[];
}

/** Saídas ainda não pagas até a data: lançamentos das Finanças e despesas do painel. */
export async function listarPagamentosPendentes(ate: string): Promise<LancamentoPendente[]> {
  const [financas, despesas] = await Promise.all([
    supabase
      .from('personal_finances')
      .select('id, description, amount, finance_date, escopo')
      .eq('type', 'expense')
      .eq('is_completed', false)
      .lte('finance_date', ate),
    supabase
      .from('expenses')
      .select('id, description, amount, expense_date')
      .eq('is_paid', false)
      .lte('expense_date', ate),
  ]);
  if (financas.error) throw financas.error;
  if (despesas.error) throw despesas.error;
  return [
    ...(financas.data || []).map((r: any): LancamentoPendente => ({
      id: `financas-${r.id}`, origem: 'financas', descricao: r.description || 'Sem descrição', valor: Number(r.amount) || 0,
      data: r.finance_date, escopo: r.escopo === 'pessoal' ? 'pessoal' : 'negocio',
    })),
    ...(despesas.data || []).map((r: any): LancamentoPendente => ({
      id: `despesas-${r.id}`, origem: 'despesas', descricao: r.description || 'Sem descrição', valor: Number(r.amount) || 0,
      data: r.expense_date, escopo: 'negocio',
    })),
  ];
}
