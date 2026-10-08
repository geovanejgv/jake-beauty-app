import { describe, expect, it } from 'vitest';
import { celulaCsv, gerarCsv, montarLinhas, resumoPorProfissional } from './relatorio';
import type { LinhaAtendimento } from './api';
import type { Regras } from './logic';

const regras: Regras = { descontarTaxa: false, descontarMaterial: false, taxas: {} };
const linha = (x: Partial<LinhaAtendimento>): LinhaAtendimento => ({
  id: crypto.randomUUID(), start_time: '2026-10-10T13:00:00Z', end_time: '2026-10-10T14:00:00Z', status: 'completed',
  valor_cobrado: 100, comissao_percentual: 50, gorjeta: 0, payment_method: 'pix', taxa_percentual: null, professional_id: 'p1', client_id: 'c1',
  servico_id: null, service_id: null, cliente_nome: 'Ana', servico_nome: 'Corte', custo_material: 0, profissional_nome: 'Jana',
  fechamento: null, ...x,
});

describe('relatório e resumo por profissional', () => {
  it('usa o valor do fechamento quando existe e a prévia quando não', () => {
    const [a, b] = montarLinhas([
      linha({}),
      linha({ fechamento: { id: 'f', status: 'assinado_pago', valor_liquido: 42, valor_comissao: 42 } }),
    ], regras);
    expect(a.liquido).toBe(50);
    expect(a.situacao).toBe('aberto');
    expect(b.liquido).toBe(42);
    expect(b.situacao).toBe('assinado_pago');
  });
  it('soma comissões, gorjetas, pago e restante (como na tela de pagamento)', () => {
    const linhas = montarLinhas([
      linha({ gorjeta: 10 }),
      linha({ fechamento: { id: 'f', status: 'assinado_pago', valor_liquido: 50, valor_comissao: 50 } }),
      linha({ fechamento: { id: 'g', status: 'aguardando_conferencia', valor_liquido: 50, valor_comissao: 50 } }),
      linha({ status: 'scheduled' }),
      linha({ professional_id: 'p2', profissional_nome: 'Ana' }),
    ], regras);
    const [ana, jana] = resumoPorProfissional(linhas);
    expect(ana).toMatchObject({ nome: 'Ana', qtd: 1, comissoes: 50, restante: 50 });
    expect(jana).toMatchObject({ nome: 'Jana', qtd: 3, comissoes: 150, gorjetas: 10, pago: 50, aguardando: 50, restante: 110 });
  });
  it('CSV escapa aspas e neutraliza fórmulas', () => {
    expect(celulaCsv('=1+1')).toBe(`"'=1+1"`);
    expect(celulaCsv('Ana "Bia"')).toBe('"Ana ""Bia"""');
    const csv = gerarCsv(montarLinhas([linha({ cliente_nome: '@SOMA(A1)' })], regras), true, (iso) => iso.slice(0, 10));
    expect(csv.startsWith('﻿"Data"')).toBe(true);
    expect(csv).toContain(`"'@SOMA(A1)"`);
    expect(csv).toContain('"100,00"');
  });
});
