import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
const { codigoValido, podeRemover } = await import('./mfa');

describe('MFA: regras da tela', () => {
  it('código só com 6 dígitos (espaços são ignorados)', () => {
    expect(codigoValido('123456')).toBe(true);
    expect(codigoValido('123 456')).toBe(true);
    for (const c of ['12345', '1234567', 'abcdef', '12345a', '']) expect(codigoValido(c)).toBe(false);
  });
  it('remover exige aal2 (M-03)', () => {
    expect(podeRemover({ ehAdmin: false, aal2: false, verificados: 2 })).toMatch(/Confirme o código/);
  });
  it('administradora não fica sem autenticador; profissional pode remover o único', () => {
    expect(podeRemover({ ehAdmin: true, aal2: true, verificados: 1 })).toMatch(/ao menos um autenticador/);
    expect(podeRemover({ ehAdmin: true, aal2: true, verificados: 2 })).toBeNull();
    expect(podeRemover({ ehAdmin: false, aal2: true, verificados: 1 })).toBeNull();
  });
});
