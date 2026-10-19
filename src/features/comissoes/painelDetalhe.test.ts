import { describe, expect, it } from 'vitest';
import { painelProfissional, type AtendimentoPainel } from './logic';
import { detalharPainel } from './painelDetalhe';

const dia = (iso: string) => iso.slice(0, 10);
const a = (id: string, start_time: string, status: AtendimentoPainel['status'], valor: number, pct = 40, extra: Partial<AtendimentoPainel> = {}) =>
  ({ id, start_time, status, valor_cobrado: valor, comissao_percentual: pct, ...extra });

const hoje = '2026-10-19';
const todos = [
  a('h1', '2026-10-19T09:00', 'completed', 100),
  a('h2', '2026-10-19T11:00', 'confirmed', 200),
  a('h3', '2026-10-19T08:00', 'scheduled', 50),
  a('h4', '2026-10-19T13:00', 'cancelled', 999),
  a('h5', '2026-10-19T15:00', 'no_show', 80),
  a('b1', '2026-10-19T16:00', 'completed', 500, 40, { is_block: true }),
  a('p1', '2026-10-10T10:00', 'completed', 300, 50),
  a('p2', '2026-10-25T10:00', 'confirmed', 120, 50),
];
const doPeriodo = todos;
const resumoHoje = painelProfissional(todos.filter((x) => dia(x.start_time) === hoje), hoje, dia);
const resumoPeriodo = painelProfissional(doPeriodo, hoje, dia);

describe('detalharPainel bate com as caixas', () => {
  it('faturamento do dia', () => {
    const d = detalharPainel('dia', doPeriodo, todos, hoje, dia);
    expect(d.valor).toBe(resumoHoje.faturamentoDia);
    expect(d.comissao).toBe(resumoHoje.comissaoDia);
    expect(d.secoes[0].itens.map((x) => x.id)).toEqual(['h1']);
  });
  it('projeção: confirmados e pendentes, sem seção vazia', () => {
    const d = detalharPainel('projecao', doPeriodo, todos, hoje, dia);
    expect(d.comissao).toBe(resumoPeriodo.projecaoComissao);
    expect(d.valor).toBe(resumoPeriodo.projecaoValor);
    expect(d.quantidade).toBe(resumoPeriodo.qtdProjecao);
    expect(d.secoes.map((s) => s.titulo)).toEqual(['Confirmados', 'Pendentes de confirmação']);
    expect(d.secoes[0].itens.map((x) => x.id)).toEqual(['h2', 'p2']);
  });
  it('realizado', () => {
    const d = detalharPainel('realizado', doPeriodo, todos, hoje, dia);
    expect(d.comissao).toBe(resumoPeriodo.realizadoComissao);
    expect(d.valor).toBe(resumoPeriodo.realizadoValor);
  });
  it('atendimentos hoje: por atender (em ordem), concluídos e faltas', () => {
    const d = detalharPainel('hoje', doPeriodo, todos, hoje, dia);
    expect(d.quantidade).toBe(resumoHoje.atendimentosHoje);
    expect(d.secoes.map((s) => [s.titulo, s.itens.map((x) => x.id)])).toEqual([
      ['Por atender', ['h3', 'h2']], ['Concluídos', ['h1']], ['Não compareceu', ['h5']],
    ]);
  });
});
