// Cálculo de comissão espelhado do banco (public.gerar_fechamento) para a prévia na tela.
// O valor que vale para pagamento é o gravado no fechamento, calculado no banco (VAL-07).

export type StatusAgendamento = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type StatusFechamento = 'aguardando_conferencia' | 'contestado' | 'assinado_pago' | 'cancelado';
export type FormaPagamento = 'pix' | 'dinheiro' | 'debito' | 'credito' | 'cartao' | 'outro' | 'pacote';

export const ROTULO_STATUS_AGENDAMENTO: Record<StatusAgendamento, string> = {
  scheduled: 'Pendente', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado', no_show: 'Não compareceu',
};

export const ROTULO_STATUS_FECHAMENTO: Record<StatusFechamento, string> = {
  aguardando_conferencia: 'Aguardando conferência', contestado: 'Contestado', assinado_pago: 'Assinado e pago', cancelado: 'Cancelado',
};

export const COR_STATUS_FECHAMENTO: Record<StatusFechamento, string> = {
  aguardando_conferencia: 'bg-amber-100 text-amber-800',
  contestado: 'bg-orange-100 text-orange-800',
  assinado_pago: 'bg-emerald-100 text-emerald-800',
  cancelado: 'bg-slate-200 text-slate-600',
};

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', cartao: 'Cartão', outro: 'Outro', pacote: 'Pacote',
};

export type Regras = { descontarTaxa: boolean; descontarMaterial: boolean; taxas: Partial<Record<FormaPagamento, number>> };

export type EntradaCalculo = {
  valor_cobrado: number | null;
  comissao_percentual: number | null;
  gorjeta: number | null;
  payment_method: string | null;
  custo_material: number | null;
  /** Taxa congelada do pacote (sessão de pacote); nos demais, vale a taxa da forma de pagamento. */
  taxa_percentual?: number | null;
};

export type Calculo = {
  bruto: number; taxaPercentual: number; valorTaxa: number; material: number; base: number;
  comissaoPercentual: number; comissao: number; gorjeta: number; liquido: number;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Mesma conta do banco: base = bruto - taxa - material (mínimo 0); comissão = base x %; líquido = comissão + gorjeta. */
export function calcularComissao(e: EntradaCalculo, regras: Regras): Calculo {
  const bruto = r2(Number(e.valor_cobrado ?? 0));
  const taxaPercentual = regras.descontarTaxa ? Number(e.taxa_percentual ?? regras.taxas[(e.payment_method ?? '') as FormaPagamento] ?? 0) : 0;
  const valorTaxa = r2((bruto * taxaPercentual) / 100);
  const material = regras.descontarMaterial ? r2(Number(e.custo_material ?? 0)) : 0;
  const base = Math.max(r2(bruto - valorTaxa - material), 0);
  const comissaoPercentual = Number(e.comissao_percentual ?? 0);
  const comissao = r2((base * comissaoPercentual) / 100);
  const gorjeta = r2(Number(e.gorjeta ?? 0));
  return { bruto, taxaPercentual, valorTaxa, material, base, comissaoPercentual, comissao, gorjeta, liquido: r2(comissao + gorjeta) };
}

export type Totais = { qtd: number; bruto: number; taxas: number; materiais: number; comissao: number; gorjetas: number; liquido: number };

export function somar(linhas: Calculo[]): Totais {
  return linhas.reduce<Totais>((t, c) => ({
    qtd: t.qtd + 1, bruto: r2(t.bruto + c.bruto), taxas: r2(t.taxas + c.valorTaxa), materiais: r2(t.materiais + c.material),
    comissao: r2(t.comissao + c.comissao), gorjetas: r2(t.gorjetas + c.gorjeta), liquido: r2(t.liquido + c.liquido),
  }), { qtd: 0, bruto: 0, taxas: 0, materiais: 0, comissao: 0, gorjetas: 0, liquido: 0 });
}

/**
 * Painel do profissional.
 * - Faturamento do dia: soma dos atendimentos CONCLUÍDOS de hoje.
 * - Projeção de ganhos: atendimentos CONFIRMADOS ou PENDENTES do período (ignora cancelados e faltas).
 */
export type AtendimentoPainel = { start_time: string; status: StatusAgendamento; valor_cobrado: number | null; comissao_percentual: number | null; is_block?: boolean | null; is_manual_reminder?: boolean | null };

export function painelProfissional(lista: AtendimentoPainel[], hoje: string, diaLocal: (iso: string) => string) {
  const reais = lista.filter((a) => !a.is_block && !a.is_manual_reminder);
  const valor = (a: AtendimentoPainel) => Number(a.valor_cobrado ?? 0);
  const comissao = (a: AtendimentoPainel) => r2((valor(a) * Number(a.comissao_percentual ?? 0)) / 100);
  const concluidosHoje = reais.filter((a) => a.status === 'completed' && diaLocal(a.start_time) === hoje);
  const futuros = reais.filter((a) => a.status === 'confirmed' || a.status === 'scheduled');
  const concluidos = reais.filter((a) => a.status === 'completed');
  return {
    faturamentoDia: r2(concluidosHoje.reduce((s, a) => s + valor(a), 0)),
    comissaoDia: r2(concluidosHoje.reduce((s, a) => s + comissao(a), 0)),
    atendimentosHoje: reais.filter((a) => diaLocal(a.start_time) === hoje && a.status !== 'cancelled').length,
    projecaoValor: r2(futuros.reduce((s, a) => s + valor(a), 0)),
    projecaoComissao: r2(futuros.reduce((s, a) => s + comissao(a), 0)),
    qtdProjecao: futuros.length,
    realizadoValor: r2(concluidos.reduce((s, a) => s + valor(a), 0)),
    realizadoComissao: r2(concluidos.reduce((s, a) => s + comissao(a), 0)),
    faltas: reais.filter((a) => a.status === 'no_show').length,
  };
}
