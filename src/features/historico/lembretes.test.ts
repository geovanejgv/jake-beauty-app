import { describe, expect, it } from 'vitest';
import { adiar, contatosParaHoje, lembretesDoDia, proximoPorCliente, sugerirDataLembrete, type Lembrete } from './lembretes';
import type { Contato } from './convites';

const HOJE = '2026-10-29';
const lembrete = (id: string, extra: Partial<Lembrete>): Lembrete => ({
  id, client_id: 'c1', data: HOJE, hora: null, responsavel_id: null, modelo_id: null, observacao: null, status: 'pendente', ...extra,
});
const convite = (extra: Partial<Contato>): Contato => ({
  id: 'x', client_id: 'c1', enviado_em: '2026-10-20T12:00:00Z', enviado_por: null, modelo_id: null, texto_enviado: 'Oi',
  resultado: 'sem_resposta', resultado_em: null, agendamento_id: null, ...extra,
});

describe('sugestão de data', () => {
  it('15 dias depois do convite sem resposta; senão o retorno previsto; nunca antes de hoje', () => {
    expect(sugerirDataLembrete({ retornoPrevisto: '2026-11-20', ultimoConvite: convite({}) }, HOJE)).toBe('2026-11-04');
    expect(sugerirDataLembrete({ retornoPrevisto: '2026-11-20', ultimoConvite: convite({ resultado: 'respondeu' }) }, HOJE)).toBe('2026-11-20');
    expect(sugerirDataLembrete({ retornoPrevisto: '2026-10-01', ultimoConvite: null }, HOJE)).toBe(HOJE);
    expect(sugerirDataLembrete({ retornoPrevisto: null, ultimoConvite: convite({ enviado_em: '2026-09-01T12:00:00Z' }) }, HOJE)).toBe(HOJE);
  });
});

describe('adiar e dia', () => {
  it('adiar parte de hoje quando atrasado', () => {
    expect(adiar('2026-10-20', 3, HOJE)).toBe('2026-11-01');
    expect(adiar('2026-11-10', 7, HOJE)).toBe('2026-11-17');
  });
  const lista = [
    lembrete('atrasado', { data: '2026-10-27' }),
    lembrete('hoje_tarde', { hora: '15:00' }),
    lembrete('hoje_cedo', { hora: '09:00' }),
    lembrete('amanha', { data: '2026-10-30', client_id: 'c2' }),
    lembrete('feito', { status: 'concluido' }),
  ];
  it('faixa do dia e contador', () => {
    expect(lembretesDoDia(lista, HOJE, HOJE).map((l) => l.id)).toEqual(['atrasado', 'hoje_cedo', 'hoje_tarde']);
    expect(lembretesDoDia(lista, '2026-10-30', HOJE).map((l) => l.id)).toEqual(['amanha']);
    expect(contatosParaHoje(lista, HOJE)).toBe(3);
    expect(proximoPorCliente(lista).get('c1')?.id).toBe('atrasado');
  });
});
