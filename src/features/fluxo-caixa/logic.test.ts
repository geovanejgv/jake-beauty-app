import { describe, expect, it } from 'vitest';
import { ehTotalMes, fluxoDoMes, lancamentoTotalMes, limitesDoMes } from './logic';

describe('limitesDoMes', () => {
  it('primeiro e último dia, inclusive fevereiro bissexto', () => {
    expect(limitesDoMes('2026-10-18')).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' });
    expect(limitesDoMes('2028-02-10')).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' });
    expect(limitesDoMes('2026-11-30')).toEqual({ inicio: '2026-11-01', fim: '2026-11-30' });
  });
});

describe('fluxoDoMes', () => {
  const receitas = [
    { data: '2026-10-01', valor: 100 },
    { data: '2026-10-18', valor: 250.5 },
    { data: '2026-09-30', valor: 999 },
    { data: '2026-11-01', valor: 999 },
  ];
  const despesas = [
    { data: '2026-10-05', valor: 80, pago: true },
    { data: '2026-10-20', valor: 30, pago: false },
    { data: '2026-11-02', valor: 500, pago: true },
  ];
  it('só o mês: receitas menos despesas pagas', () => {
    expect(fluxoDoMes(receitas, despesas, '2026-10-01', '2026-10-31')).toEqual({
      receitas: 350.5, despesasPagas: 80, despesasPendentes: 30, lucroLiquido: 270.5,
    });
  });
  it('valores inválidos contam como zero e o lucro pode ser negativo', () => {
    expect(fluxoDoMes([{ data: '2026-10-02', valor: Number('x') }], [{ data: '2026-10-02', valor: 40, pago: true }], '2026-10-01', '2026-10-31').lucroLiquido).toBe(-40);
  });
});

describe('lancamentoTotalMes', () => {
  it('receita de negócio, só leitura, no último dia', () => {
    const l = lancamentoTotalMes(270.499, '2026-10-31');
    expect(l).toMatchObject({ description: 'Total Mês', type: 'income', escopo: 'negocio', finance_date: '2026-10-31', amount: 270.5, id: 'total-mes-2026-10' });
    expect(ehTotalMes(l)).toBe(true);
    expect(ehTotalMes({})).toBe(false);
  });
});
