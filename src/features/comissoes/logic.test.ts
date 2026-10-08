import { describe, expect, it } from 'vitest';
import { calcularComissao, painelProfissional, somar, type Regras } from './logic';

const regras: Regras = { descontarTaxa: true, descontarMaterial: true, taxas: { credito: 3.49, pix: 0 } };

describe('cálculo de comissão (mesma conta do teste do banco)', () => {
  it('corte 120 no crédito, material 10, 60%, gorjeta 10', () => {
    const c = calcularComissao({ valor_cobrado: 120, comissao_percentual: 60, gorjeta: 10, payment_method: 'credito', custo_material: 10 }, regras);
    expect(c).toMatchObject({ valorTaxa: 4.19, material: 10, base: 105.81, comissao: 63.49, liquido: 73.49 });
  });
  it('escova 60 no pix a 40%', () => {
    expect(calcularComissao({ valor_cobrado: 60, comissao_percentual: 40, gorjeta: 0, payment_method: 'pix', custo_material: 0 }, regras).comissao).toBe(24);
  });
  it('sem descontos configurados, a base é o bruto', () => {
    const c = calcularComissao({ valor_cobrado: 100, comissao_percentual: 50, gorjeta: 0, payment_method: 'credito', custo_material: 30 },
      { descontarTaxa: false, descontarMaterial: false, taxas: { credito: 3.49 } });
    expect(c).toMatchObject({ valorTaxa: 0, material: 0, base: 100, comissao: 50 });
  });
  it('sessão de pacote usa a taxa congelada do pacote (mesma conta do teste do banco)', () => {
    const c = calcularComissao({ valor_cobrado: 90, comissao_percentual: 40, gorjeta: 0, payment_method: 'pacote', custo_material: 0, taxa_percentual: 1.94 }, regras);
    expect(c).toMatchObject({ taxaPercentual: 1.94, valorTaxa: 1.75, base: 88.25, comissao: 35.3 });
  });
  it('base nunca fica negativa', () => {
    expect(calcularComissao({ valor_cobrado: 5, comissao_percentual: 50, gorjeta: 0, payment_method: null, custo_material: 30 }, regras).base).toBe(0);
  });
  it('totais batem com o fechamento do banco (129,49)', () => {
    const t = somar([
      calcularComissao({ valor_cobrado: 120, comissao_percentual: 60, gorjeta: 10, payment_method: 'credito', custo_material: 10 }, regras),
      calcularComissao({ valor_cobrado: 60, comissao_percentual: 40, gorjeta: 0, payment_method: 'pix', custo_material: 0 }, regras),
      calcularComissao({ valor_cobrado: 80, comissao_percentual: 40, gorjeta: 0, payment_method: 'dinheiro', custo_material: 0 }, regras),
    ]);
    expect(t).toEqual({ qtd: 3, bruto: 260, taxas: 4.19, materiais: 10, comissao: 119.49, gorjetas: 10, liquido: 129.49 });
  });
});

describe('painel do profissional', () => {
  const dia = (iso: string) => iso.slice(0, 10);
  const base = { comissao_percentual: 50 };
  it('faturamento do dia só com concluídos de hoje; projeção ignora cancelados e faltas', () => {
    const p = painelProfissional([
      { ...base, start_time: '2026-10-04T13:00:00Z', status: 'completed', valor_cobrado: 100 },
      { ...base, start_time: '2026-10-04T15:00:00Z', status: 'confirmed', valor_cobrado: 80 },
      { ...base, start_time: '2026-10-05T13:00:00Z', status: 'scheduled', valor_cobrado: 50 },
      { ...base, start_time: '2026-10-04T16:00:00Z', status: 'cancelled', valor_cobrado: 999 },
      { ...base, start_time: '2026-10-04T17:00:00Z', status: 'no_show', valor_cobrado: 999 },
      { ...base, start_time: '2026-10-03T13:00:00Z', status: 'completed', valor_cobrado: 40 },
      { ...base, start_time: '2026-10-04T12:00:00Z', status: 'scheduled', valor_cobrado: null, is_block: true },
    ], '2026-10-04', dia);
    expect(p).toMatchObject({
      faturamentoDia: 100, comissaoDia: 50, projecaoValor: 130, projecaoComissao: 65, qtdProjecao: 2,
      realizadoValor: 140, faltas: 1, atendimentosHoje: 3,
    });
  });
});
