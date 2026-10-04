import { describe, expect, it } from 'vitest';
import { brl, cnpjValido, cpfValido, dataLocal, formatarCnpj, formatarCpf, intervaloLocal, lerValor, mesDe, pct, valorParaCampo } from './formatos';

describe('valores', () => {
  it('lê valor digitado em reais', () => {
    expect(lerValor('65,00')).toBe(65);
    expect(lerValor('1.234,56')).toBe(1234.56);
    expect(lerValor('R$ 80')).toBe(80);
    expect(lerValor('12.5')).toBe(12.5);
    expect(lerValor('abc')).toBeNull();
    expect(lerValor('1,234')).toBeNull();
    expect(lerValor('')).toBeNull();
  });
  it('formata', () => {
    expect(brl(1310.84).replace(/\s/g, ' ')).toBe('R$ 1.310,84');
    expect(pct(40)).toBe('40%');
    expect(valorParaCampo(65)).toBe('65,00');
  });
});

describe('datas no fuso de São Paulo', () => {
  it('23h de São Paulo ainda é o mesmo dia', () => {
    expect(dataLocal(new Date('2026-10-05T02:30:00Z'))).toBe('2026-10-04');
  });
  it('mês e intervalo', () => {
    expect(mesDe('2026-02-10')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
    expect(intervaloLocal('2026-10-01', '2026-10-31')).toEqual({ de: '2026-10-01T00:00:00-03:00', ate: '2026-11-01T00:00:00-03:00' });
  });
});

describe('documentos (mesmas regras do banco)', () => {
  it('CPF', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('111.444.777-35')).toBe(true);
    expect(cpfValido('123.456.789-00')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
  });
  it('CNPJ/MEI', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-00')).toBe(false);
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});
