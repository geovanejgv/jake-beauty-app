import { describe, expect, it } from 'vitest';
import { datasMensais, mesAno, MESES_RECORRENCIA } from './recorrencia';

describe('datasMensais', () => {
  it('gera 12 meses mantendo o dia', () => {
    const d = datasMensais('2026-10-10');
    expect(d).toHaveLength(MESES_RECORRENCIA);
    expect(d[0]).toBe('2026-10-10');
    expect(d[1]).toBe('2026-11-10');
    expect(d[3]).toBe('2027-01-10');
    expect(d[11]).toBe('2027-09-10');
  });
  it('dia 31 vira o último dia em meses curtos', () => {
    expect(datasMensais('2026-01-31', 4)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('fevereiro de ano bissexto', () => {
    expect(datasMensais('2027-12-30', 3)).toEqual(['2027-12-30', '2028-01-30', '2028-02-29']);
  });
  it('mesAno', () => expect(mesAno('2027-09-10')).toBe('09/2027'));
});
