import { describe, expect, it } from 'vitest';
import { detalharIndicador } from './indicadores';

const itens = [
  { id: 'r1', type: 'income', amount: 500, is_completed: true, finance_date: '2026-10-05' },
  { id: 'r2', type: 'income', amount: '300', is_completed: false, finance_date: '2026-10-02' },
  { id: 'tm', type: 'income', amount: 1000, is_completed: false, finance_date: '2026-10-31', virtual: true },
  { id: 'd1', type: 'expense', amount: 900, category: 'Fixas', is_completed: true, finance_date: '2026-10-10' },
  { id: 'd2', type: 'expense', amount: 150.5, category: 'Variáveis', is_completed: false, finance_date: '2026-10-12' },
  { id: 'd3', type: 'expense', amount: 20, category: 'Impostos', is_completed: false, finance_date: '2026-10-01' },
];

describe('detalharIndicador', () => {
  it('caixa real: recebidas (com Total Mês) menos pagas', () => {
    const d = detalharIndicador(itens, 'caixa');
    expect(d.secoes.map((s) => s.itens.map((i) => i.id))).toEqual([['r1', 'tm'], ['d1']]);
    expect(d.resultado).toBe(600);
  });
  it('projeção: tudo menos tudo', () => {
    expect(detalharIndicador(itens, 'projecao').resultado).toBeCloseTo(1800 - 1070.5);
  });
  it('receitas: recebidas e a receber, ordenadas por data', () => {
    const d = detalharIndicador(itens, 'receitas');
    expect(d.secoes.map((s) => s.total)).toEqual([1500, 300]);
    expect(d.resultado).toBe(1800);
  });
  it('despesas por tipo de custo, sem grupo vazio', () => {
    const d = detalharIndicador(itens, 'despesas');
    expect(d.secoes.map((s) => [s.titulo, s.total])).toEqual([['Custos fixos', 900], ['Custos variáveis', 150.5], ['Outros custos', 20]]);
    expect(d.resultado).toBe(1070.5);
    expect(detalharIndicador([itens[0]], 'despesas').secoes).toEqual([]);
  });
});
