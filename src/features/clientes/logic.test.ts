import { describe, expect, it } from 'vitest';
import { colunasQueCabem, aniversariantesDoMes, chaveAniversario, ordenarPor, confirmacaoExclusaoValida, contarPorGrupo, diferencaMembros, gruposPorCliente, limparDescricao, limparNome, nomeRepetido } from './logic';

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

describe('ordenarPor', () => {
  const lista = [{ n: 'beatriz', v: 2 }, { n: 'Ana', v: null }, { n: 'Álvaro', v: 10 }, { n: '', v: 1 }];
  it('texto em português, sem diferenciar acento, vazios no fim', () => {
    expect(ordenarPor(lista, (x) => x.n, 'asc').map((x) => x.n)).toEqual(['Álvaro', 'Ana', 'beatriz', '']);
    expect(ordenarPor(lista, (x) => x.n, 'desc').map((x) => x.n)).toEqual(['beatriz', 'Ana', 'Álvaro', '']);
  });
  it('números e vazios no fim nas duas direções', () => {
    expect(ordenarPor(lista, (x) => x.v, 'asc').map((x) => x.v)).toEqual([1, 2, 10, null]);
    expect(ordenarPor(lista, (x) => x.v, 'desc').map((x) => x.v)).toEqual([10, 2, 1, null]);
  });
});

describe('aniversários', () => {
  it('chave pelo dia do ano', () => {
    expect(chaveAniversario('1990-08-17')).toBe(817);
    expect(chaveAniversario(null)).toBeNull();
  });
  it('aniversariantes do mês em ordem de dia, com idade e situação', () => {
    const clientes = [
      { id: 'a', birthday: '1990-10-25' },
      { id: 'b', birthday: '2000-10-18' },
      { id: 'c', birthday: '1985-10-02' },
      { id: 'd', birthday: '1990-11-18' },
      { id: 'e', birthday: null },
      { id: 'f', birthday: '1800-10-30' },
    ];
    const r = aniversariantesDoMes(clientes, '2026-10-18');
    expect(r.map((x) => x.cliente.id)).toEqual(['c', 'b', 'a', 'f']);
    expect(r[1]).toMatchObject({ dia: 18, idade: 26, hoje: true, passou: false });
    expect(r[0]).toMatchObject({ passou: true });
    expect(r[3].idade).toBeNull();
  });
});

describe('colunasQueCabem', () => {
  const colunas = [{ id: 'nome', min: 200 }, { id: 'fone', min: 150 }, { id: 'grupo', min: 190 }, { id: 'ultimo', min: 140 }];
  const prioridade = ['nome', 'fone', 'ultimo', 'grupo'];
  it('largura folgada: todas na linha', () => {
    expect(colunasQueCabem(2000, colunas, prioridade, 130)).toEqual({ visiveis: ['nome', 'fone', 'grupo', 'ultimo'], abaixo: [] });
  });
  it('largura média: as de menor prioridade descem, mantendo a ordem de exibição', () => {
    expect(colunasQueCabem(600, colunas, prioridade, 130)).toEqual({ visiveis: ['nome', 'fone'], abaixo: ['grupo', 'ultimo'] });
    expect(colunasQueCabem(620, colunas, prioridade, 130)).toEqual({ visiveis: ['nome', 'fone', 'ultimo'], abaixo: ['grupo'] });
  });
  it('a primeira sempre entra; sem medida, mostra todas', () => {
    expect(colunasQueCabem(100, colunas, prioridade, 130).visiveis).toEqual(['nome']);
    expect(colunasQueCabem(0, colunas, prioridade).abaixo).toEqual([]);
  });
  it('não pula uma coluna mais importante para encaixar uma menor', () => {
    expect(colunasQueCabem(380, colunas, ['nome', 'grupo', 'fone', 'ultimo'])).toEqual({ visiveis: ['nome'], abaixo: ['fone', 'grupo', 'ultimo'] });
  });
});
