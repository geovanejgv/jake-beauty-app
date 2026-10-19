import { describe, expect, it } from 'vitest';
import { montarLinhas } from './relatorio';
import { montarResumoFinanceiro } from './resumoFinanceiro';
import type { LinhaAtendimento } from './api';
import type { Regras } from './logic';

const regras: Regras = { descontarTaxa: false, descontarMaterial: false, taxas: {} };
const linha = (x: Partial<LinhaAtendimento>): LinhaAtendimento => ({
  id: crypto.randomUUID(), start_time: '2026-10-10T13:00:00Z', end_time: '2026-10-10T14:00:00Z', status: 'completed',
  valor_cobrado: 100, comissao_percentual: 50, gorjeta: 0, payment_method: 'pix', taxa_percentual: null, professional_id: 'p1', client_id: 'c1',
  servico_id: null, service_id: null, cliente_nome: 'Ana', servico_nome: 'Corte', custo_material: 0, profissional_nome: 'Jana',
  fechamento: null, ...x,
});

describe('resumo financeiro do profissional', () => {
  it('soma comissão sobre serviços, gorjetas como recebíveis e ignora não concluídos', () => {
    const r = montarResumoFinanceiro(montarLinhas([
      linha({ gorjeta: 10 }),
      linha({ fechamento: { id: 'f', status: 'assinado_pago', valor_liquido: 42, valor_comissao: 42 } }),
      linha({ status: 'scheduled' }),
    ], regras));
    expect(r.itens).toHaveLength(2);
    expect(r.itens[0]).toMatchObject({ valor: 100, comissao: 50, gorjeta: 10, forma: 'PIX' });
    expect(r.sobreServicos).toBe(92);
    expect(r.recebiveisAdicionais).toBe(10);
    expect(r.totalRecebimentos).toBe(102);
    expect(r.totalDescontos).toBe(0);
    expect(r.total).toBe(102);
  });
  it('período sem atendimento fica zerado', () => {
    const r = montarResumoFinanceiro([]);
    expect(r.itens).toEqual([]);
    expect(r.total).toBe(0);
  });
});
