// Visão integrada do dia no Resumo Diário: agenda (atendimentos, bloqueios e lembretes),
// tarefas do Kanban com prazo e próximos pagamentos das Finanças. Só leitura; o RLS do banco
// limita o que cada pessoa vê.

export type EventoDoDia = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string | null;
  is_block: boolean | null;
  is_manual_reminder: boolean | null;
  block_reason: string | null;
  professional_id: string | null;
  notes: string | null;
  clients?: { name: string | null } | null;
  servicos?: { nome: string | null } | null;
  services?: { name: string | null } | null;
};

export type TarefaComPrazo = {
  id: string;
  titulo: string;
  data_limite: string;
  status: string;
  criticidade: string;
  responsible_id: string | null;
};

export type LancamentoPendente = {
  id: string;
  origem: 'financas' | 'despesas';
  descricao: string;
  valor: number;
  data: string;
  escopo: 'negocio' | 'pessoal' | null;
};

const INATIVOS = new Set(['cancelled', 'canceled', 'no_show']);

const porHorario = (a: EventoDoDia, b: EventoDoDia) => a.start_time.localeCompare(b.start_time);

/** Separa os eventos do dia em atendimentos, bloqueios e lembretes (sem cancelados e faltas). */
export function separarAgenda(eventos: EventoDoDia[]): { atendimentos: EventoDoDia[]; bloqueios: EventoDoDia[]; lembretes: EventoDoDia[] } {
  const ativos = eventos.filter((e) => !INATIVOS.has(e.status ?? '')).sort(porHorario);
  return {
    atendimentos: ativos.filter((e) => !e.is_block && !e.is_manual_reminder),
    bloqueios: ativos.filter((e) => !!e.is_block),
    lembretes: ativos.filter((e) => !e.is_block && !!e.is_manual_reminder),
  };
}

/** Nome do serviço do atendimento: catálogo novo, registro avulso antigo ou observação. */
export function nomeDoServico(e: EventoDoDia): string {
  return e.servicos?.nome || e.services?.name || e.notes || 'Atendimento';
}

/** Tarefas abertas com prazo no dia e as já atrasadas (prazo antes do dia), cada grupo por criticidade. */
export function tarefasDoDia(tarefas: TarefaComPrazo[], dia: string): { doDia: TarefaComPrazo[]; atrasadas: TarefaComPrazo[] } {
  const peso: Record<string, number> = { critico: 0, urgente: 1, normal: 2 };
  const abertas = tarefas
    .filter((t) => t.status !== 'concluida' && !!t.data_limite)
    .sort((a, b) => (peso[a.criticidade] ?? 3) - (peso[b.criticidade] ?? 3) || a.data_limite.localeCompare(b.data_limite) || a.titulo.localeCompare(b.titulo));
  return {
    doDia: abertas.filter((t) => t.data_limite === dia),
    atrasadas: abertas.filter((t) => t.data_limite < dia),
  };
}

/** Soma dias a uma data YYYY-MM-DD sem passar por fuso. */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Pagamentos ainda não feitos até `ate` (inclusive), com os vencidos antes de `dia` marcados à parte. */
export function proximosPagamentos(lancamentos: LancamentoPendente[], dia: string, ate: string): { vencidos: LancamentoPendente[]; proximos: LancamentoPendente[]; total: number } {
  const lista = lancamentos
    .filter((l) => l.data <= ate)
    .sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor);
  const vencidos = lista.filter((l) => l.data < dia);
  const proximos = lista.filter((l) => l.data >= dia);
  return { vencidos, proximos, total: lista.reduce((t, l) => t + l.valor, 0) };
}
