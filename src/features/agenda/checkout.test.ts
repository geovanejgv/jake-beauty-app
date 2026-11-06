import { describe, expect, it } from 'vitest';
import type { LinhaSaldo } from '../pacotes/logic';
import { atendimentosDoCheckout, fimDoUltimo, pacotesPorAtendimento, totalCobranca } from './checkout';

const apt = (id: string, ini: string, x: Record<string, unknown> = {}) => ({
  id, client_id: 'c1', start_time: ini, end_time: new Date(new Date(ini).getTime() + 3600000).toISOString(), status: 'scheduled', ...x,
});

describe('atendimentosDoCheckout', () => {
  // 13h UTC = 10h em São Paulo
  const principal = apt('b', '2026-11-04T13:00:00Z');
  const todos = [
    apt('a', '2026-11-04T11:00:00Z', { status: 'confirmed', professional_id: 'outra' }),
    principal,
    apt('c', '2026-11-04T14:00:00Z'),
    apt('d', '2026-11-04T15:00:00Z', { status: 'completed' }),
    apt('e', '2026-11-04T16:00:00Z', { status: 'cancelled' }),
    apt('f', '2026-11-04T17:00:00Z', { client_id: 'c2' }),
    apt('g', '2026-11-05T13:00:00Z'),
    apt('h', '2026-11-04T18:00:00Z', { is_block: true }),
    apt('i', '2026-11-04T19:00:00Z', { is_manual_reminder: true }),
    apt('j', '2026-11-05T02:00:00Z'), // 23h do dia 04 em São Paulo
  ];
  it('junta os atendimentos em aberto da cliente no mesmo dia local, de qualquer profissional, por horário', () => {
    expect(atendimentosDoCheckout(principal, todos).map((a) => a.id)).toEqual(['a', 'b', 'c', 'j']);
  });
  it('sem cliente, só o próprio atendimento', () => {
    expect(atendimentosDoCheckout({ ...principal, client_id: null }, todos).map((a) => a.id)).toEqual(['b']);
  });
});

const saldo = (item_id: string, servico_id: string, disponiveis: number, validade = '2027-01-01'): LinhaSaldo => ({
  pacote_id: 'p', cliente_id: 'c1', pacote_nome: 'Pacote', status: 'ativo', validade, vencido: false, vendido_em: '2026-01-01',
  item_id, servico_id, servico_nome: servico_id, sessoes: 10, usadas: 0, faltas: 0, reservadas: 0, disponiveis,
  valor_sessao: 50, valor_restante: 500, comissao_percentual: 40,
});

describe('pacotesPorAtendimento', () => {
  it('usa a sessão reservada e não reaproveita a mesma sessão disponível', () => {
    const saldos = [saldo('i1', 's1', 1, '2026-12-01'), saldo('i2', 's1', 1, '2027-06-01'), saldo('i3', 's2', 0)];
    const m = pacotesPorAtendimento([
      { id: 'a', servico_id: 's1', pacote_item_id: null },
      { id: 'b', servico_id: 's1', pacote_item_id: null },
      { id: 'c', servico_id: 's1', pacote_item_id: null },
      { id: 'd', servico_id: 's2', pacote_item_id: 'i3' },
      { id: 'e', servico_id: null, pacote_item_id: null },
    ], saldos);
    expect(m.get('a')?.item_id).toBe('i1');
    expect(m.get('b')?.item_id).toBe('i2');
    expect(m.get('c')).toBeNull();
    expect(m.get('d')?.item_id).toBe('i3');
    expect(m.get('e')).toBeNull();
  });
});

describe('totalCobranca e fimDoUltimo', () => {
  it('soma só os incluídos e pagos à parte, mais os extras', () => {
    expect(totalCobranca([
      { incluir: true, pacote: false, valor: 100.1 },
      { incluir: true, pacote: true, valor: 80 },
      { incluir: false, pacote: false, valor: 70 },
      { incluir: true, pacote: false, valor: null },
    ], 0.2)).toBe(100.3);
  });
  it('fim do último atendimento', () => {
    expect(fimDoUltimo([{ end_time: '2026-11-04T12:00:00Z' }, { end_time: '2026-11-04T15:00:00Z' }]).toISOString()).toBe('2026-11-04T15:00:00.000Z');
  });
});
