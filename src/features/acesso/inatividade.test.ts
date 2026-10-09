import { describe, expect, it } from 'vitest';
import { INATIVIDADE_ADMIN_SEG, passouDoLimite, segundosOcioso } from './inatividade';

const agora = Date.UTC(2026, 9, 9, 12, 0, 0);
const seg = (s: number) => String(Math.floor(agora / 1000) - s);

describe('segundosOcioso (L-09, L-10)', () => {
  it('conta os segundos desde o último gesto', () => {
    expect(segundosOcioso(seg(90), agora)).toBe(90);
    expect(segundosOcioso(seg(0), agora)).toBe(0);
  });
  it('recusa vazio, texto, notação científica, negativo e horário no futuro', () => {
    for (const v of [undefined, null, '', 'abc', '1e9', '-5', '12.5', String(Math.floor(agora / 1000) + 3600)]) {
      expect(segundosOcioso(v, agora)).toBeNull();
    }
  });
  it('30 minutos é o limite da administradora', () => {
    expect(INATIVIDADE_ADMIN_SEG).toBe(1800);
    expect(passouDoLimite(segundosOcioso(seg(1801), agora))).toBe(true);
    expect(passouDoLimite(segundosOcioso(seg(1800), agora))).toBe(false);
    expect(passouDoLimite(null)).toBe(false);
  });
});
