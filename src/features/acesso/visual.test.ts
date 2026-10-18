import { describe, expect, it } from 'vitest';
import { OPCOES_VISUAL, VISUAIS, lerVisual, modoComputadorNoCelular, opcaoVisual } from './visual';

describe('visual do portal', () => {
  it('mantém os valores já salvos do tema claro e escuro', () => {
    expect(lerVisual('light', true)).toBe('light');
    expect(lerVisual('dark', false)).toBe('dark');
  });
  it('aceita os visuais Jake', () => {
    expect(lerVisual('jake-claro', true)).toBe('jake-claro');
    expect(lerVisual('jake-escuro', false)).toBe('jake-escuro');
  });
  it('sem escolha válida, segue o tema do sistema no visual clássico', () => {
    expect(lerVisual(null, true)).toBe('dark');
    expect(lerVisual('xyz', false)).toBe('light');
  });
  it('tem uma opção para cada visual, na ordem pedida', () => {
    expect(OPCOES_VISUAL.map((o) => o.id)).toEqual([...VISUAIS]);
    expect(opcaoVisual('jake-escuro')).toMatchObject({ escuro: true, jake: true });
  });
});

describe('modo computador no celular', () => {
  it('reconhece o celular em "Site para computador"', () => {
    expect(modoComputadorNoCelular({ toque: true, telaLargura: 393, janelaLargura: 980, escala: 0.4 })).toBe(true);
    expect(modoComputadorNoCelular({ toque: true, telaLargura: 980, janelaLargura: 980, escala: 0.4 })).toBe(true);
  });
  it('não avisa no celular normal, no tablet nem no computador', () => {
    expect(modoComputadorNoCelular({ toque: true, telaLargura: 393, janelaLargura: 393, escala: 1 })).toBe(false);
    expect(modoComputadorNoCelular({ toque: true, telaLargura: 820, janelaLargura: 820, escala: 1 })).toBe(false);
    expect(modoComputadorNoCelular({ toque: false, telaLargura: 1920, janelaLargura: 1600, escala: 1 })).toBe(false);
  });
});
