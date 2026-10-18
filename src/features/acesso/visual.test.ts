import { describe, expect, it } from 'vitest';
import { OPCOES_VISUAL, VISUAIS, lerVisual, opcaoVisual } from './visual';

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
