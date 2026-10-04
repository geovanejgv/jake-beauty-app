// Linhas do relatório de comissões (prévia calculada ou valores do fechamento) e exportação CSV.
import type { LinhaAtendimento } from './api';
import { calcularComissao, ROTULO_FORMA, ROTULO_STATUS_FECHAMENTO, type Calculo, type FormaPagamento, type Regras } from './logic';

export type SituacaoPagamento = 'aberto' | 'aguardando_conferencia' | 'contestado' | 'assinado_pago';

export const ROTULO_SITUACAO: Record<SituacaoPagamento, string> = {
  aberto: 'Em aberto',
  aguardando_conferencia: ROTULO_STATUS_FECHAMENTO.aguardando_conferencia,
  contestado: ROTULO_STATUS_FECHAMENTO.contestado,
  assinado_pago: ROTULO_STATUS_FECHAMENTO.assinado_pago,
};

export type LinhaRelatorio = LinhaAtendimento & { calculo: Calculo; liquido: number; situacao: SituacaoPagamento };

/** Valor líquido: o do fechamento (calculado e gravado no banco) ou a prévia pelas regras atuais. */
export function montarLinhas(lista: LinhaAtendimento[], regras: Regras): LinhaRelatorio[] {
  return lista.map((a) => {
    const calculo = calcularComissao(a, regras);
    return {
      ...a,
      calculo,
      liquido: a.fechamento ? a.fechamento.valor_liquido : calculo.liquido,
      situacao: (a.fechamento?.status as SituacaoPagamento | undefined) ?? 'aberto',
    };
  });
}

export type ResumoProfissional = {
  profissional_id: string; nome: string; qtd: number; bruto: number; comissoes: number; gorjetas: number; pago: number; aguardando: number; restante: number;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Resumo por profissional (tela "Lançamento de Pagamento"): comissões, gorjetas, pago e restante. */
export function resumoPorProfissional(linhas: LinhaRelatorio[]): ResumoProfissional[] {
  const mapa = new Map<string, ResumoProfissional>();
  for (const l of linhas) {
    if (l.status !== 'completed' || !l.professional_id) continue;
    const r = mapa.get(l.professional_id) ?? { profissional_id: l.professional_id, nome: l.profissional_nome, qtd: 0, bruto: 0, comissoes: 0, gorjetas: 0, pago: 0, aguardando: 0, restante: 0 };
    const gorjeta = l.calculo.gorjeta;
    const comissao = r2(l.liquido - gorjeta);
    r.qtd += 1;
    r.bruto = r2(r.bruto + l.calculo.bruto);
    r.comissoes = r2(r.comissoes + comissao);
    r.gorjetas = r2(r.gorjetas + gorjeta);
    if (l.situacao === 'assinado_pago') r.pago = r2(r.pago + l.liquido);
    if (l.situacao === 'aguardando_conferencia' || l.situacao === 'contestado') r.aguardando = r2(r.aguardando + l.liquido);
    r.restante = r2(r.comissoes + r.gorjetas - r.pago);
    mapa.set(l.professional_id, r);
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Célula CSV segura: aspas escapadas e sem fórmula (evita injeção ao abrir no Excel). */
export function celulaCsv(v: string | number | null | undefined): string {
  let t = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}

const num = (n: number) => n.toFixed(2).replace('.', ',');

export function gerarCsv(linhas: LinhaRelatorio[], comProfissional: boolean, dia: (iso: string) => string): string {
  const cab = ['Data', 'Cliente', 'Serviço', ...(comProfissional ? ['Profissional'] : []), 'Pagamento', 'Valor bruto', 'Descontos', '% Comissão', 'Comissão', 'Gorjeta', 'Valor líquido', 'Situação'];
  const corpo = linhas.map((l) => [
    dia(l.start_time), l.cliente_nome, l.servico_nome, ...(comProfissional ? [l.profissional_nome] : []),
    l.payment_method ? ROTULO_FORMA[l.payment_method as FormaPagamento] ?? l.payment_method : '',
    num(l.calculo.bruto), num(l.calculo.valorTaxa + l.calculo.material), num(l.calculo.comissaoPercentual),
    num(r2(l.liquido - l.calculo.gorjeta)), num(l.calculo.gorjeta), num(l.liquido), ROTULO_SITUACAO[l.situacao],
  ].map(celulaCsv).join(';'));
  // BOM para o Excel abrir acentos corretamente.
  return '﻿' + [cab.map(celulaCsv).join(';'), ...corpo].join('\r\n');
}
