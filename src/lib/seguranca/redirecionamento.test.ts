import { describe, expect, it } from 'vitest';
import { caminhoInternoSeguro } from './redirecionamento';

describe('caminhoInternoSeguro (L-05)', () => {
  it('aceita caminho interno com busca', () => {
    expect(caminhoInternoSeguro('/agenda?x=1')).toBe('/agenda?x=1');
    expect(caminhoInternoSeguro('/relatorios/comissoes#topo')).toBe('/relatorios/comissoes#topo');
  });
  it('recusa outro site, barra dupla, barra invertida e esquema', () => {
    for (const v of ['https://x.com', '//x.com', '/\\x.com', 'javascript:alert(1)', 'x.com', '/\\\\x.com']) {
      expect(caminhoInternoSeguro(v)).toBe('/');
    }
  });
  it('recusa caracteres de controle, texto longo e valores que não são texto', () => {
    expect(caminhoInternoSeguro('/agenda\n')).toBe('/');
    expect(caminhoInternoSeguro('/a\tb')).toBe('/');
    expect(caminhoInternoSeguro(`/${'a'.repeat(512)}`)).toBe('/');
    expect(caminhoInternoSeguro(null)).toBe('/');
    expect(caminhoInternoSeguro(42)).toBe('/');
  });
  it('não volta para o login nem para o retorno do Google', () => {
    expect(caminhoInternoSeguro('/login?erro=falha')).toBe('/');
    expect(caminhoInternoSeguro('/auth/callback?code=x')).toBe('/');
  });
});
