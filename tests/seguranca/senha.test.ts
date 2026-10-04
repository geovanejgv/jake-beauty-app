import { describe, expect, it } from 'vitest';
import { mensagemErroAuth, validarTrocaSenha } from '../../src/lib/seguranca/senha';

const ok = { atual: 'senha-antiga-qualquer', nova: 'uma frase bem longa', confirmacao: 'uma frase bem longa' };

describe('AUT-03: troca de senha', () => {
  it('aceita senha de 12 caracteres ou mais, sem regra de composição', () => {
    expect(validarTrocaSenha(ok)).toBeNull();
    expect(validarTrocaSenha({ ...ok, nova: 'abcdefghijkl', confirmacao: 'abcdefghijkl' })).toBeNull();
  });
  it('recusa senha de 11 caracteres', () => {
    expect(validarTrocaSenha({ ...ok, nova: 'abcdefghijk', confirmacao: 'abcdefghijk' })).toMatch(/pelo menos 12/);
  });
  it('conta caracteres, não bytes, no mínimo', () => {
    expect(validarTrocaSenha({ ...ok, nova: 'ççççççççççç', confirmacao: 'ççççççççççç' })).toMatch(/pelo menos 12/);
  });
  it('recusa acima de 72 bytes (limite do bcrypt)', () => {
    const longa = 'a'.repeat(73);
    expect(validarTrocaSenha({ ...ok, nova: longa, confirmacao: longa })).toMatch(/longa demais/);
  });
  it('exige a senha atual, confirmação igual e senha diferente da atual', () => {
    expect(validarTrocaSenha({ ...ok, atual: '' })).toMatch(/senha atual/);
    expect(validarTrocaSenha({ ...ok, confirmacao: 'outra frase bem longa' })).toMatch(/confirmação/);
    expect(validarTrocaSenha({ atual: ok.nova, nova: ok.nova, confirmacao: ok.nova })).toMatch(/diferente/);
  });
  it('recusa espaço no começo ou no fim', () => {
    expect(validarTrocaSenha({ ...ok, nova: ' frase bem longa', confirmacao: ' frase bem longa' })).toMatch(/espaço/);
  });
  it('só traduz códigos conhecidos do Supabase Auth; o resto vai para o tratamento genérico', () => {
    expect(mensagemErroAuth('invalid_credentials')).toBe('Senha atual incorreta.');
    expect(mensagemErroAuth('weak_password')).toMatch(/vazada/);
    expect(mensagemErroAuth('unexpected_failure')).toBeNull();
    expect(mensagemErroAuth(undefined)).toBeNull();
  });
});
