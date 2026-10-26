import { describe, expect, it } from 'vitest';
import { atendimentosNoHorario, colunasSobrepostas, datasDoBloqueio, conflitoDoItem, conflitoLocal, fimDoItem, hhmmLocal, intervalosLivres, itensSobrepostos, mensagemAgenda, posicaoNaLinha } from './logic';

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
  it('atendimento no mesmo horário de outro atendimento é permitido, mas aparece no aviso', () => {
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T13:30:00Z'), t('2026-10-20T14:30:00Z'))).toBeNull();
    expect(atendimentosNoHorario(lista, 'p1', t('2026-10-20T13:30:00Z'), t('2026-10-20T14:30:00Z')).map((e) => e.id)).toEqual(['a']);
    expect(atendimentosNoHorario(lista, 'p1', t('2026-10-20T14:00:00Z'), t('2026-10-20T15:00:00Z'))).toEqual([]);
  });
  it('bloqueio impede atendimento; cancelado e lembrete não', () => {
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T16:30:00Z'), t('2026-10-20T16:45:00Z'))?.id).toBe('b');
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T18:00:00Z'), t('2026-10-20T19:00:00Z'))).toBeNull();
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T20:00:00Z'), t('2026-10-20T21:00:00Z'))).toBeNull();
  });
  it('bloqueio novo conflita com atendimento, não com outro bloqueio', () => {
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T13:30:00Z'), t('2026-10-20T14:30:00Z'), undefined, true)?.id).toBe('a');
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T16:30:00Z'), t('2026-10-20T17:30:00Z'), undefined, true)).toBeNull();
  });
  it('outro profissional e o próprio evento (remarcação) não conflitam', () => {
    expect(conflitoLocal(lista, 'p2', t('2026-10-20T16:00:00Z'), t('2026-10-20T17:00:00Z'))).toBeNull();
    expect(conflitoLocal(lista, 'p1', t('2026-10-20T16:15:00Z'), t('2026-10-20T16:30:00Z'), 'b')).toBeNull();
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

describe('vários serviços no mesmo agendamento', () => {
  const item = (chave: string, prof: string, hora: string, minutos: number) => ({
    chave, profissionalId: prof, servicoId: 's', servicoNome: 'S', data: '2026-10-21', hora, minutos, valor: null, valorExibido: 80, pacoteItemId: null,
  });
  it('itens sobrepostos da mesma profissional são permitidos, mas aparecem no aviso', () => {
    const a = item('a', 'p1', '11:00', 120);
    const b = item('b', 'p1', '12:30', 30);
    const c = item('c', 'p2', '11:00', 60);
    expect(conflitoDoItem([], b)).toBeNull();
    expect(itensSobrepostos([], [a, b, c]).map((x) => x.chave)).toEqual(['a', 'b']);
    expect(itensSobrepostos([], [a, item('d', 'p1', '13:00', 30)])).toEqual([]);
  });
  it('item em horário bloqueado é apontado para confirmação; sobre atendimento salvo, só avisa', () => {
    const d = (h: number) => new Date(2026, 9, 21, h).toISOString();
    const bloqueio = ev('x', d(14), d(15), { is_block: true });
    const salvo = ev('y', d(16), d(17));
    expect(conflitoDoItem([bloqueio, salvo], item('a', 'p1', '14:30', 30))?.id).toBe('x');
    expect(conflitoDoItem([bloqueio, salvo], item('a', 'p1', '16:30', 30))).toBeNull();
    expect(itensSobrepostos([bloqueio, salvo], [item('a', 'p1', '16:30', 30)])).toHaveLength(1);
  });
  it('fim do item vira o próximo horário', () => {
    expect(hhmmLocal(fimDoItem({ data: '2026-10-21', hora: '11:00', minutos: 120 }))).toBe('13:00');
  });
  it('lista os horários livres que comportam a duração', () => {
    const d = (h: number, m = 0) => new Date(2026, 9, 21, h, m);
    const livres = intervalosLivres(
      [{ inicio: d(9), fim: d(10) }, { inicio: d(9, 30), fim: d(11) }, { inicio: d(11, 20), fim: d(12) }, { inicio: d(20), fim: d(22) }],
      d(8), d(21), 30,
    );
    expect(livres.map((l) => [hhmmLocal(l.inicio), hhmmLocal(l.fim)])).toEqual([['08:00', '09:00'], ['12:00', '20:00']]);
  });
});

describe('bloqueio recorrente', () => {
  it('sem repetição é só o dia', () => {
    expect(datasDoBloqueio('2026-10-22', 'nao', { tipo: 'vezes', vezes: 5 })).toEqual(['2026-10-22']);
  });
  it('diário até uma data, inclusive, virando o mês', () => {
    expect(datasDoBloqueio('2026-10-30', 'diaria', { tipo: 'data', ate: '2026-11-02' })).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
  it('semanal após N vezes', () => {
    expect(datasDoBloqueio('2026-10-22', 'semanal', { tipo: 'vezes', vezes: 3 })).toEqual(['2026-10-22', '2026-10-29', '2026-11-05']);
  });
  it('mensal usa o último dia do mês quando falta o dia', () => {
    expect(datasDoBloqueio('2027-01-31', 'mensal', { tipo: 'data', ate: '2027-04-30' })).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });
  it('recusa término inválido e excesso de repetições', () => {
    expect(datasDoBloqueio('2026-10-22', 'diaria', { tipo: 'data', ate: '2026-10-22' })).toMatch(/depois/);
    expect(datasDoBloqueio('2026-10-22', 'diaria', { tipo: 'data', ate: '' })).toMatch(/termina/);
    expect(datasDoBloqueio('2026-10-22', 'diaria', { tipo: 'vezes', vezes: 1 })).toMatch(/2 vezes/);
    expect(datasDoBloqueio('2026-10-22', 'diaria', { tipo: 'data', ate: '2028-01-01' })).toMatch(/máximo/);
    expect((datasDoBloqueio('2026-01-01', 'diaria', { tipo: 'data', ate: '2027-01-01' }) as string[]).length).toBe(366);
  });
});
