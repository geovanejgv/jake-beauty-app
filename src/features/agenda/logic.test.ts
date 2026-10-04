import { describe, expect, it } from 'vitest';
import { colunasSobrepostas, conflitoLocal, mensagemAgenda, posicaoNaLinha } from './logic';

const ev = (id: string, ini: string, fim: string, x: Record<string, unknown> = {}) => ({
  id, start_time: ini, end_time: fim, status: 'scheduled', professional_id: 'p1', ...x,
});

describe('conflito de horário (mesma regra do banco)', () => {
  const lista = [
    ev('a', '2026-10-20T13:00:00Z', '2026-10-20T14:00:00Z'),
    ev('b', '2026-10-20T16:00:00Z', '2026-10-20T17:00:00Z', { is_block: true }),
    ev('c', '2026-10-20T18:00:00Z', '2026-10-20T19:00:00Z', { status: 'cancelled' }),
    ev('d', '2026-10-20T20:00:00Z', '2026-10-20T21:00:00Z', { is_manual_reminder: true }),
  ];
  const t = (iso: string) => new Date(iso);
  it('sobreposição conflita; encostado não', () => {
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T13:30:00Z'), t('2026-10-20T14:30:00Z'))?.id).toBe('a');
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T14:00:00Z'), t('2026-10-20T15:00:00Z'))).toBeNull();
  });
  it('bloqueio conflita; cancelado e lembrete não', () => {
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T16:30:00Z'), t('2026-10-20T16:45:00Z'))?.id).toBe('b');
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T18:00:00Z'), t('2026-10-20T19:00:00Z'))).toBeNull();
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T20:00:00Z'), t('2026-10-20T21:00:00Z'))).toBeNull();
  });
  it('outro profissional e o próprio evento (remarcação) não conflitam', () => {
    expect(conflitoLocal(lista, 'p2', t('2026-10-20T13:00:00Z'), t('2026-10-20T14:00:00Z'))).toBeNull();
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T13:15:00Z'), t('2026-10-20T14:15:00Z'), 'a')).toBeNull();
  });
  it('traduz o erro da trava do banco', () => {
    expect(mensagemAgenda({ code: '23P01', message: 'conflicting key value violates exclusion constraint "appointments_sem_conflito"' })).toMatch(/Conflito de horário/);
    expect(mensagemAgenda({ code: '42501' })).toBeNull();
  });
});

describe('linha do tempo', () => {
  it('posiciona e recorta à janela', () => {
    const janela = { inicioMin: 7 * 60, fimMin: 21 * 60 };
    const d = (h: number, m = 0) => new Date(2026, 9, 20, h, m);
    expect(posicaoNaLinha(d(7), d(8, 24), janela)).toEqual({ topo: 0, altura: 10 });
    expect(posicaoNaLinha(d(6), d(7, 42), janela)!.altura).toBeCloseTo(5);
    expect(posicaoNaLinha(d(22), d(23), janela)).toBeNull();
  });
  it('eventos sobrepostos ficam lado a lado', () => {
    const r = colunasSobrepostas([
      ev('a', '2026-10-20T13:00:00Z', '2026-10-20T14:00:00Z'),
      ev('b', '2026-10-20T13:30:00Z', '2026-10-20T14:30:00Z'),
      ev('c', '2026-10-20T15:00:00Z', '2026-10-20T16:00:00Z'),
    ]);
    expect(r.map((x) => [x.id, x.faixa, x.faixas])).toEqual([['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]);
  });
});
