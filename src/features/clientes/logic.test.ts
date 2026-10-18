import { describe, expect, it } from 'vitest';
import { diferencaMembros, limparNome, nomeRepetido } from './logic';

describe('limparNome', () => {
  it('tira espaços sobrando e recusa vazio ou longo', () => {
    expect(limparNome('  Lírios   Centro ', 60)).toBe('Lírios Centro');
    expect(limparNome('   ', 60)).toBeNull();
    expect(limparNome('x'.repeat(61), 60)).toBeNull();
  });
});

describe('nomeRepetido', () => {
  const origens = [{ id: '1', nome: 'Guaianases' }, { id: '2', nome: 'Lírios' }];
  it('compara sem maiúsculas e acentos', () => {
    expect(nomeRepetido('lirios', origens)).toBe(true);
    expect(nomeRepetido('GUAIANASES ', origens)).toBe(true);
    expect(nomeRepetido('Indicação', origens)).toBe(false);
  });
  it('ignora o próprio registro ao renomear', () => {
    expect(nomeRepetido('Lírios', origens, '2')).toBe(false);
  });
});

describe('diferencaMembros', () => {
  it('separa quem entra e quem sai', () => {
    expect(diferencaMembros(['a', 'b'], ['b', 'c'])).toEqual({ incluir: ['c'], remover: ['a'] });
    expect(diferencaMembros([], [])).toEqual({ incluir: [], remover: [] });
  });
});
