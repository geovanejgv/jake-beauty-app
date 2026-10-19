// Detalhamento das caixas do Meu Painel (Faturamento do dia, Projeção, Realizado, Atendimentos hoje):
// quais atendimentos compõem cada número, com a mesma regra de painelProfissional().
import type { AtendimentoPainel } from './logic';

export type IndicadorPainel = 'dia' | 'projecao' | 'realizado' | 'hoje';

export type SecaoPainel<T> = { titulo: string; itens: T[]; valor: number; comissao: number };
export type DetalhePainel<T> = { titulo: string; explicacao: string; secoes: SecaoPainel<T>[]; valor: number; comissao: number; quantidade: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const valorDe = (a: AtendimentoPainel) => Number(a.valor_cobrado ?? 0) || 0;
export const comissaoDe = (a: AtendimentoPainel) => r2((valorDe(a) * Number(a.comissao_percentual ?? 0)) / 100);

function secao<T extends AtendimentoPainel>(titulo: string, itens: T[]): SecaoPainel<T> {
  const ordenados = [...itens].sort((a, b) => a.start_time.localeCompare(b.start_time));
  return {
    titulo, itens: ordenados,
    valor: r2(ordenados.reduce((s, a) => s + valorDe(a), 0)),
    comissao: r2(ordenados.reduce((s, a) => s + comissaoDe(a), 0)),
  };
}

/**
 * `doPeriodo`: atendimentos do período escolhido; `todos`: a consulta inteira (inclui hoje).
 * Seções vazias saem da lista; os totais são os mesmos das caixas.
 */
export function detalharPainel<T extends AtendimentoPainel>(
  indicador: IndicadorPainel, doPeriodo: T[], todos: T[], hoje: string, diaLocal: (iso: string) => string,
): DetalhePainel<T> {
  const reais = (l: T[]) => l.filter((a) => !a.is_block && !a.is_manual_reminder);
  const deHoje = reais(todos).filter((a) => diaLocal(a.start_time) === hoje);
  const periodo = reais(doPeriodo);
  let titulo: string; let explicacao: string; let secoes: SecaoPainel<T>[];
  switch (indicador) {
    case 'dia':
      titulo = 'Faturamento do dia';
      explicacao = 'Atendimentos concluídos hoje e a sua comissão sobre cada um.';
      secoes = [secao('Concluídos hoje', deHoje.filter((a) => a.status === 'completed'))];
      break;
    case 'projecao':
      titulo = 'Projeção de ganhos';
      explicacao = 'Atendimentos do período ainda não concluídos: entram na comissão quando forem finalizados.';
      secoes = [
        secao('Confirmados', periodo.filter((a) => a.status === 'confirmed')),
        secao('Pendentes de confirmação', periodo.filter((a) => a.status === 'scheduled')),
      ];
      break;
    case 'realizado':
      titulo = 'Realizado no período';
      explicacao = 'Atendimentos concluídos no período e a comissão estimada sobre cada um.';
      secoes = [secao('Concluídos', periodo.filter((a) => a.status === 'completed'))];
      break;
    case 'hoje':
      titulo = 'Atendimentos hoje';
      explicacao = 'Agenda de hoje (cancelados não contam).';
      secoes = [
        secao('Por atender', deHoje.filter((a) => a.status === 'scheduled' || a.status === 'confirmed')),
        secao('Concluídos', deHoje.filter((a) => a.status === 'completed')),
        secao('Não compareceu', deHoje.filter((a) => a.status === 'no_show')),
      ];
      break;
  }
  const comItens = secoes.filter((s) => s.itens.length > 0);
  return {
    titulo, explicacao, secoes: comItens,
    valor: r2(comItens.reduce((t, s) => t + s.valor, 0)),
    comissao: r2(comItens.reduce((t, s) => t + s.comissao, 0)),
    quantidade: comItens.reduce((t, s) => t + s.itens.length, 0),
  };
}
