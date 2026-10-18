import { describe, expect, it } from 'vitest';
import { confirmacaoExclusaoValida, contarPorGrupo, diferencaMembros, gruposPorCliente, limparDescricao, limparNome, nomeRepetido } from './logic';

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

describe('exclusão de cliente em duas etapas', () => {
  it('só libera com a palavra EXCLUIR', () => {
    expect(confirmacaoExclusaoValida(' excluir ')).toBe(true);
    expect(confirmacaoExclusaoValida('EXCLUI')).toBe(false);
    expect(confirmacaoExclusaoValida('')).toBe(false);
  });
});

describe('grupos da cliente e contagem', () => {
  const grupos = [{ id: 'g1', nome: 'Lírios' }, { id: 'g2', nome: 'Guaianases' }];
  const membros = [
    { grupo_id: 'g1', cliente_id: 'c1' },
    { grupo_id: 'g2', cliente_id: 'c1' },
    { grupo_id: 'g1', cliente_id: 'c2' },
    { grupo_id: 'gx', cliente_id: 'c3' },
  ];
  it('lista os grupos de cada cliente em ordem e ignora grupo desconhecido', () => {
    const mapa = gruposPorCliente(grupos, membros);
    expect(mapa.get('c1')!.map((g) => g.nome)).toEqual(['Guaianases', 'Lírios']);
    expect(mapa.get('c2')!.map((g) => g.id)).toEqual(['g1']);
    expect(mapa.has('c3')).toBe(false);
  });
  it('conta clientes por grupo', () => {
    const c = contarPorGrupo(membros);
    expect(c.get('g1')).toBe(2);
    expect(c.get('g2')).toBe(1);
  });
});

describe('limparDescricao', () => {
  it('vazia vira null, longa é recusada', () => {
    expect(limparDescricao('  Retorno de novembro  ')).toBe('Retorno de novembro');
    expect(limparDescricao('   ')).toBeNull();
    expect(limparDescricao('x'.repeat(501))).toBe(false);
  });
});
