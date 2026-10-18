// Detalhamento dos indicadores de Finanças (Caixa Real, Projeção, Receitas, Despesas):
// quais lançamentos do mês compõem cada valor, para conferência.

export type Indicador = 'caixa' | 'projecao' | 'receitas' | 'despesas';

export type ItemFinanceiro = {
  id: string; type: string; amount: number | string | null; category?: string | null;
  is_completed?: boolean | null; finance_date: string; description?: string | null; virtual?: boolean;
};

export type Secao<T> = { titulo: string; sinal: 1 | -1; itens: T[]; total: number };
export type Detalhe<T> = { titulo: string; explicacao: string; secoes: Secao<T>[]; resultado: number };

const valor = (i: ItemFinanceiro) => {
  const n = Number(i.amount);
  return Number.isFinite(n) ? n : 0;
};
/** "Total Mês" já é dinheiro apurado: conta como recebido. */
export const recebido = (i: ItemFinanceiro) => !!i.is_completed || i.virtual === true;

function secao<T extends ItemFinanceiro>(titulo: string, sinal: 1 | -1, itens: T[]): Secao<T> {
  const ordenados = [...itens].sort((a, b) => a.finance_date.localeCompare(b.finance_date));
  return { titulo, sinal, itens: ordenados, total: ordenados.reduce((t, i) => t + valor(i), 0) };
}

const TITULO_GRUPO = { Fixas: 'Custos fixos', Variáveis: 'Custos variáveis', Outras: 'Outros custos' } as const;
const grupoDespesa = (c: string | null | undefined) => (c === 'Fixas' ? 'Fixas' : c === 'Variáveis' ? 'Variáveis' : 'Outras');

/** Itens já filtrados pelo mês e pela visão (Tudo/Negócio/Pessoal). */
export function detalharIndicador<T extends ItemFinanceiro>(itens: T[], indicador: Indicador): Detalhe<T> {
  const receitas = itens.filter((i) => i.type === 'income');
  const despesas = itens.filter((i) => i.type !== 'income');
  const montar = (titulo: string, explicacao: string, secoes: Secao<T>[]): Detalhe<T> => ({
    titulo, explicacao, secoes, resultado: secoes.reduce((t, s) => t + s.sinal * s.total, 0),
  });
  switch (indicador) {
    case 'caixa':
      return montar('Caixa Real', 'Receitas já recebidas menos despesas já pagas no mês.', [
        secao('Receitas recebidas', 1, receitas.filter(recebido)),
        secao('Despesas pagas', -1, despesas.filter(recebido)),
      ]);
    case 'projecao':
      return montar('Projeção do Mês', 'Todas as receitas menos todas as despesas do mês, pagas ou não.', [
        secao('Receitas', 1, receitas),
        secao('Despesas', -1, despesas),
      ]);
    case 'receitas':
      return montar('Receitas', 'Recebidas e a receber no mês.', [
        secao('Recebidas', 1, receitas.filter(recebido)),
        secao('A receber', 1, receitas.filter((i) => !recebido(i))),
      ]);
    case 'despesas':
      return montar('Despesas', 'Por tipo de custo; cada item mostra se já foi pago.', (['Fixas', 'Variáveis', 'Outras'] as const)
        .map((g) => secao(TITULO_GRUPO[g], 1, despesas.filter((i) => grupoDespesa(i.category) === g)))
        .filter((s) => s.itens.length > 0));
  }
}
