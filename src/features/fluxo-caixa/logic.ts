// Fluxo de caixa do mês (Resumo Diário): receitas (atendimentos concluídos + vendas de pacote)
// menos despesas pagas. O mesmo valor aparece em Finanças > Negócio como "Total Mês".

export type ReceitaFluxo = { data: string; valor: number };
export type DespesaFluxo = { data: string; valor: number; pago: boolean };

export type FluxoDoMes = { receitas: number; despesasPagas: number; despesasPendentes: number; lucroLiquido: number };

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Datas YYYY-MM-DD do primeiro e do último dia do mês de `hoje` (YYYY-MM-DD). */
export function limitesDoMes(hoje: string): { inicio: string; fim: string } {
  const [ano, mes] = hoje.split('-').map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  const mm = String(mes).padStart(2, '0');
  return { inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

/** Soma do mês (datas entre inicio e fim, inclusive). Lucro líquido real = receitas - despesas pagas. */
export function fluxoDoMes(receitas: ReceitaFluxo[], despesas: DespesaFluxo[], inicio: string, fim: string): FluxoDoMes {
  const noMes = (d: string) => d >= inicio && d <= fim;
  const totalReceitas = receitas.filter((r) => noMes(r.data)).reduce((t, r) => t + num(r.valor), 0);
  let despesasPagas = 0;
  let despesasPendentes = 0;
  for (const d of despesas) {
    if (!noMes(d.data)) continue;
    if (d.pago) despesasPagas += num(d.valor);
    else despesasPendentes += num(d.valor);
  }
  return { receitas: totalReceitas, despesasPagas, despesasPendentes, lucroLiquido: totalReceitas - despesasPagas };
}

export const ID_TOTAL_MES = 'total-mes';

/**
 * Lançamento só de leitura para Finanças > Negócio: "Total Mês" no último dia do mês corrente,
 * com o lucro líquido real apurado até agora. Não é gravado no banco; recalcula a cada abertura.
 */
export function lancamentoTotalMes(lucroLiquido: number, fimDoMes: string) {
  return {
    id: `${ID_TOTAL_MES}-${fimDoMes.slice(0, 7)}`,
    virtual: true as const,
    type: 'income' as const,
    escopo: 'negocio' as const,
    category: 'Clientes',
    description: 'Total Mês',
    amount: Math.round(lucroLiquido * 100) / 100,
    finance_date: fimDoMes,
    is_completed: false,
    is_recurring: false,
    recurring_group_id: null,
  };
}

export const ehTotalMes = (item: { virtual?: boolean } | null | undefined) => item?.virtual === true;
