// Resumo financeiro do profissional no período (modelo "Resumo Financeiro": receitas variáveis, descontos e total).
import { ROTULO_FORMA, type FormaPagamento } from './logic';
import type { LinhaRelatorio } from './relatorio';

export type ItemResumoFinanceiro = {
  id: string; start_time: string; cliente: string; servico: string; forma: string; valor: number; comissao: number; gorjeta: number;
};

export type ResumoFinanceiro = {
  itens: ItemResumoFinanceiro[];
  sobreServicos: number;
  /** Venda de produto e de pacote ainda não geram comissão no app: ficam zerados, como no modelo. */
  sobreProdutos: number;
  sobrePacotes: number;
  /** Gorjetas repassadas ao profissional. */
  recebiveisAdicionais: number;
  totalRecebimentos: number;
  abatimentosAdicionais: number;
  usoProdutos: number;
  totalDescontos: number;
  total: number;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const rotuloForma = (forma: string | null) => (forma ? ROTULO_FORMA[forma as FormaPagamento] ?? forma : '-');

/** Só atendimentos concluídos; comissão = valor líquido (fechamento ou prévia) menos a gorjeta. */
export function montarResumoFinanceiro(linhas: LinhaRelatorio[]): ResumoFinanceiro {
  const itens = linhas
    .filter((l) => l.status === 'completed')
    .map((l) => ({
      id: l.id, start_time: l.start_time, cliente: l.cliente_nome, servico: l.servico_nome, forma: rotuloForma(l.payment_method),
      valor: l.calculo.bruto, comissao: r2(l.liquido - l.calculo.gorjeta), gorjeta: l.calculo.gorjeta,
    }));
  const sobreServicos = r2(itens.reduce((s, i) => s + i.comissao, 0));
  const recebiveisAdicionais = r2(itens.reduce((s, i) => s + i.gorjeta, 0));
  const sobreProdutos = 0;
  const sobrePacotes = 0;
  const totalRecebimentos = r2(sobreServicos + sobreProdutos + sobrePacotes + recebiveisAdicionais);
  const abatimentosAdicionais = 0;
  const usoProdutos = 0;
  const totalDescontos = r2(abatimentosAdicionais + usoProdutos);
  return {
    itens, sobreServicos, sobreProdutos, sobrePacotes, recebiveisAdicionais, totalRecebimentos,
    abatimentosAdicionais, usoProdutos, totalDescontos, total: r2(totalRecebimentos - totalDescontos),
  };
}
