import { describe, expect, it } from 'vitest';
import { datasMensais, datasRecorrentes, datasSemanais, diaMesAno, mesAno, vezesValidas, VEZES_PADRAO } from './recorrencia';

describe('datasMensais', () => {
  it('gera 12 meses mantendo o dia', () => {
    const d = datasMensais('2026-10-10');
    expect(d).toHaveLength(VEZES_PADRAO.mensal);
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
  it('mesAno e diaMesAno', () => {
    expect(mesAno('2027-09-10')).toBe('09/2027');
    expect(diaMesAno('2027-09-10')).toBe('10/09/2027');
  });
});

describe('datasSemanais', () => {
  it('de 7 em 7 dias, virando mês e ano', () => {
    expect(datasSemanais('2026-12-24', 3)).toEqual(['2026-12-24', '2026-12-31', '2027-01-07']);
    expect(datasSemanais('2028-02-22', 2)).toEqual(['2028-02-22', '2028-02-29']);
    expect(datasSemanais('2026-10-18')).toHaveLength(VEZES_PADRAO.semanal);
  });
  it('datasRecorrentes escolhe pela frequência', () => {
    expect(datasRecorrentes('2026-10-10', 'semanal', 2)).toEqual(['2026-10-10', '2026-10-17']);
    expect(datasRecorrentes('2026-10-10', 'mensal', 2)).toEqual(['2026-10-10', '2026-11-10']);
  });
});

describe('vezesValidas', () => {
  it('aceita inteiros de 2 a 60', () => {
    expect(vezesValidas('2')).toBe(2);
    expect(vezesValidas(60)).toBe(60);
    expect(vezesValidas('1')).toBeNull();
    expect(vezesValidas('61')).toBeNull();
    expect(vezesValidas('3.5')).toBeNull();
    expect(vezesValidas('')).toBeNull();
  });
});
