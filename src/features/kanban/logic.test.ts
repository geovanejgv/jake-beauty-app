import { describe, expect, it } from 'vitest';
import {
  FILTROS_PADRAO,
  podeEditarQuadro,
  quadrosDaVisao,
  visaoDoQuadro,
  agruparQuadros,
  validarNomeGrupo,
  conclusaoParaTimestamp,
  edicaoParaBanco,
  estaAtrasada,
  idsDaColuna,
  intervaloKanban,
  lerFiltros,
  passaNoFiltro,
  reordenar,
  rotuloIntervalo,
  statusDaPosicao,
  urlFiltros,
  validarEdicaoTarefa,
  validarNovaTarefa,
  validarQuadro,
  type Filtros,
} from './logic';
import type { Quadro } from './logic';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COL1 = '11111111-1111-4111-8111-111111111111';
const COL2 = '22222222-2222-4222-8222-222222222222';

const lista = [
  { id: 't1', coluna_id: 'c1', ordem: 0 },
  { id: 't2', coluna_id: 'c1', ordem: 1 },
  { id: 't3', coluna_id: 'c1', ordem: 2 },
  { id: 't4', coluna_id: 'c2', ordem: 0 },
];

describe('reordenar', () => {
  it('sobe dentro da coluna', () => {
    const r = reordenar(lista, 't3', 'c1', 't1');
    expect(idsDaColuna(r, 'c1')).toEqual(['t3', 't1', 't2']);
  });
  it('desce para o fim (antesDe = null)', () => {
    const r = reordenar(lista, 't1', 'c1', null);
    expect(idsDaColuna(r, 'c1')).toEqual(['t2', 't3', 't1']);
  });
  it('muda de coluna na posição escolhida', () => {
    const r = reordenar(lista, 't2', 'c2', 't4');
    expect(idsDaColuna(r, 'c2')).toEqual(['t2', 't4']);
    expect(idsDaColuna(r, 'c1')).toEqual(['t1', 't3']);
    expect(r.find((t) => t.id === 't2')?.coluna_id).toBe('c2');
  });
  it('soltar sobre si mesmo não muda nada', () => {
    expect(reordenar(lista, 't2', 'c1', 't2')).toBe(lista);
  });
  it('id desconhecido devolve a lista intacta', () => {
    expect(reordenar(lista, 'xx', 'c1', null)).toBe(lista);
  });
  it('renumera a coluna de destino a partir de 0', () => {
    const r = reordenar(lista, 't1', 'c2', null);
    expect(r.filter((t) => t.coluna_id === 'c2').map((t) => t.ordem).sort()).toEqual([0, 1]);
  });
});

describe('statusDaPosicao', () => {
  it('4 colunas', () => {
    expect([0, 1, 2, 3].map((i) => statusDaPosicao(i, 4))).toEqual(['pendente', 'em_andamento', 'em_andamento', 'concluida']);
  });
  it('2 colunas', () => {
    expect([0, 1].map((i) => statusDaPosicao(i, 2))).toEqual(['pendente', 'concluida']);
  });
});

describe('intervaloKanban (hoje = sábado 03/10/2026)', () => {
  const hoje = '2026-10-03';
  it('esta semana = 27/09 a 03/10', () => expect(intervaloKanban('esta_semana', hoje)).toEqual({ de: '2026-09-27', ate: '2026-10-03' }));
  it('próxima semana = 04/10 a 10/10', () => expect(intervaloKanban('proxima_semana', hoje)).toEqual({ de: '2026-10-04', ate: '2026-10-10' }));
  it('este mês = 01/10 a 31/10', () => expect(intervaloKanban('este_mes', hoje)).toEqual({ de: '2026-10-01', ate: '2026-10-31' }));
  it('próximo mês em dezembro vira janeiro do ano seguinte', () =>
    expect(intervaloKanban('proximo_mes', '2026-12-15')).toEqual({ de: '2027-01-01', ate: '2027-01-31' }));
  it('próximos 3 dias = hoje até hoje+3', () => expect(intervaloKanban('proximos_3', hoje)).toEqual({ de: '2026-10-03', ate: '2026-10-06' }));
  it('últimos 7 dias = hoje-6 até hoje', () => expect(intervaloKanban('ultimos_7', hoje)).toEqual({ de: '2026-09-27', ate: '2026-10-03' }));
  it('últimos 30 dias = hoje-29 até hoje', () => expect(intervaloKanban('ultimos_30', hoje)).toEqual({ de: '2026-09-04', ate: '2026-10-03' }));
  it('hoje, amanhã e ontem', () => {
    expect(intervaloKanban('hoje', hoje)).toEqual({ de: hoje, ate: hoje });
    expect(intervaloKanban('amanha', hoje)).toEqual({ de: '2026-10-04', ate: '2026-10-04' });
    expect(intervaloKanban('ontem', hoje)).toEqual({ de: '2026-10-02', ate: '2026-10-02' });
  });
  it('todos = sem intervalo; personalizado exige de <= ate', () => {
    expect(intervaloKanban('todos', hoje)).toBeNull();
    expect(intervaloKanban('personalizado', hoje, '2026-10-01', '2026-10-05')).toEqual({ de: '2026-10-01', ate: '2026-10-05' });
    expect(intervaloKanban('personalizado', hoje, '2026-10-06', '2026-10-05')).toBeNull();
  });
  it('rótulo do intervalo', () => {
    expect(rotuloIntervalo({ ...FILTROS_PADRAO, periodo: 'este_mes' }, hoje)).toBe('OUTUBRO/2026');
    expect(rotuloIntervalo({ ...FILTROS_PADRAO, periodo: 'hoje' }, hoje)).toBe('03/10/2026');
    expect(rotuloIntervalo({ ...FILTROS_PADRAO, periodo: 'esta_semana' }, hoje)).toBe('27/09/2026 a 03/10/2026');
    expect(rotuloIntervalo(FILTROS_PADRAO, hoje)).toBeNull();
  });
});

describe('lerFiltros e urlFiltros', () => {
  it('ida e volta iguais', () => {
    const f: Filtros = { periodo: 'personalizado', de: '2026-10-01', ate: '2026-10-10', pessoa: A, atrib: 'envolvido', status: 'canceladas' };
    const url = urlFiltros(f, { quadro: COL1 });
    expect(url.get('quadro')).toBe(COL1);
    expect(lerFiltros(url)).toEqual(f);
  });
  it('padrão não aparece na URL', () => {
    expect(urlFiltros(FILTROS_PADRAO).toString()).toBe('');
    expect(urlFiltros(FILTROS_PADRAO, { quadro: COL1 }).toString()).toBe(`quadro=${COL1}`);
  });
  it('valores inválidos voltam ao padrão', () => {
    const f = lerFiltros(new URLSearchParams('periodo=sempre&pessoa=123&atrib=chefe&status=x'));
    expect(f).toEqual(FILTROS_PADRAO);
  });
  it('personalizado sem datas válidas volta para todos', () => {
    expect(lerFiltros(new URLSearchParams('periodo=personalizado&de=2026-10-10&ate=2026-10-01')).periodo).toBe('todos');
    expect(lerFiltros(new URLSearchParams('periodo=personalizado&de=2026-02-30&ate=2026-03-01')).periodo).toBe('todos');
  });
  it('atribuição só vale com pessoa', () => {
    expect(lerFiltros(new URLSearchParams('atrib=criador')).atrib).toBe('todas');
    expect(lerFiltros(new URLSearchParams(`atrib=criador&pessoa=${A}`)).atrib).toBe('criador');
  });
});

describe('passaNoFiltro', () => {
  const hoje = '2026-10-03';
  const base = { cancelada_em: null, data_limite: '2026-10-03', responsible_id: A, created_by: B, envolvidos: [C] };
  it('canceladas: escondidas por padrão, só elas no filtro', () => {
    const canc = { ...base, cancelada_em: '2026-10-01T10:00:00Z' };
    expect(passaNoFiltro(canc, FILTROS_PADRAO, hoje)).toBe(false);
    expect(passaNoFiltro(canc, { ...FILTROS_PADRAO, status: 'canceladas' }, hoje)).toBe(true);
    expect(passaNoFiltro(base, { ...FILTROS_PADRAO, status: 'canceladas' }, hoje)).toBe(false);
  });
  it('com período, cartão sem data não aparece', () => {
    expect(passaNoFiltro({ ...base, data_limite: null }, { ...FILTROS_PADRAO, periodo: 'hoje' }, hoje)).toBe(false);
    expect(passaNoFiltro({ ...base, data_limite: null }, FILTROS_PADRAO, hoje)).toBe(true);
    expect(passaNoFiltro(base, { ...FILTROS_PADRAO, periodo: 'hoje' }, hoje)).toBe(true);
    expect(passaNoFiltro(base, { ...FILTROS_PADRAO, periodo: 'amanha' }, hoje)).toBe(false);
  });
  it('atribuição por pessoa', () => {
    const f = (pessoa: string, atrib: Filtros['atrib']) => ({ ...FILTROS_PADRAO, pessoa, atrib });
    expect(passaNoFiltro(base, f(A, 'responsavel'), hoje)).toBe(true);
    expect(passaNoFiltro(base, f(A, 'criador'), hoje)).toBe(false);
    expect(passaNoFiltro(base, f(B, 'criador'), hoje)).toBe(true);
    expect(passaNoFiltro(base, f(C, 'envolvido'), hoje)).toBe(true);
    expect(passaNoFiltro(base, f(C, 'responsavel'), hoje)).toBe(false);
    expect(passaNoFiltro(base, f(C, 'todas'), hoje)).toBe(true);
    expect(passaNoFiltro(base, f(COL1, 'todas'), hoje)).toBe(false);
  });
});

describe('atraso e conclusão', () => {
  it('atrasada: tem data, não concluída, antes de hoje', () => {
    expect(estaAtrasada({ data_limite: '2026-10-02', status: 'pendente' }, '2026-10-03')).toBe(true);
    expect(estaAtrasada({ data_limite: '2026-10-02', status: 'concluida' }, '2026-10-03')).toBe(false);
    expect(estaAtrasada({ data_limite: '2026-10-03', status: 'pendente' }, '2026-10-03')).toBe(false);
    expect(estaAtrasada({ data_limite: null, status: 'pendente' }, '2026-10-03')).toBe(false);
  });
  it('concluída em vira meio-dia de Brasília', () => {
    expect(conclusaoParaTimestamp('2026-10-03')).toBe('2026-10-03T12:00:00-03:00');
    expect(new Date(conclusaoParaTimestamp('2026-10-03')).toISOString().slice(0, 10)).toBe('2026-10-03');
  });
});

describe('validações', () => {
  const nova = { titulo: 'Ligar para fornecedor', responsible_id: A, coluna_id: COL1 };
  it('tarefa válida com padrões', () => {
    const r = validarNovaTarefa(nova);
    expect(r.ok && r.dados.criticidade).toBe('normal');
  });
  it('recusa campo extra e status direto', () => {
    expect(validarNovaTarefa({ ...nova, foo: 1 }).ok).toBe(false);
    expect(validarNovaTarefa({ ...nova, status: 'concluida' }).ok).toBe(false);
    expect(validarEdicaoTarefa({ status: 'concluida' }).ok).toBe(false);
  });
  it('criticidade inválida, UUID inválido', () => {
    expect(validarNovaTarefa({ ...nova, criticidade: 'altissima' }).ok).toBe(false);
    expect(validarNovaTarefa({ ...nova, responsible_id: '123' }).ok).toBe(false);
    expect(validarNovaTarefa({ ...nova, coluna_id: 'x' }).ok).toBe(false);
  });
  it('mais de 20 envolvidos', () => {
    const muitos = Array.from({ length: 21 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`);
    expect(validarNovaTarefa({ ...nova, envolvidos: muitos }).ok).toBe(false);
    expect(validarNovaTarefa({ ...nova, envolvidos: muitos.slice(0, 20) }).ok).toBe(true);
  });
  it('observação acima de 4000', () => {
    expect(validarNovaTarefa({ ...nova, descricao: 'a'.repeat(4001) }).ok).toBe(false);
    expect(validarEdicaoTarefa({ descricao: 'a'.repeat(4000) }).ok).toBe(true);
  });
  it('título vazio ou longo', () => {
    expect(validarNovaTarefa({ ...nova, titulo: '   ' }).ok).toBe(false);
    expect(validarNovaTarefa({ ...nova, titulo: 'a'.repeat(201) }).ok).toBe(false);
  });
  it('edição exige ao menos um campo', () => {
    expect(validarEdicaoTarefa({}).ok).toBe(false);
    expect(validarEdicaoTarefa({ coluna_id: COL2 }).ok).toBe(true);
  });
  it('edição converte cancelada e concluída em', () => {
    const r = edicaoParaBanco({ cancelada: true, concluida_em: '2026-10-03' }, () => 'AGORA');
    expect(r).toEqual({ cancelada_em: 'AGORA', concluida_em: '2026-10-03T12:00:00-03:00' });
    expect(edicaoParaBanco({ cancelada: false })).toEqual({ cancelada_em: null });
  });
  it('quadro com 1 ou 11 colunas e nome de coluna acima de 25', () => {
    expect(validarQuadro('Q', [{ nome: 'a' }])).not.toBeNull();
    expect(validarQuadro('Q', Array.from({ length: 11 }, (_, i) => ({ nome: `c${i}` })))).not.toBeNull();
    expect(validarQuadro('Q', [{ nome: 'a'.repeat(26) }, { nome: 'b' }])).not.toBeNull();
    expect(validarQuadro('a'.repeat(31), [{ nome: 'a' }, { nome: 'b' }])).not.toBeNull();
    expect(validarQuadro('Q', [{ nome: 'a' }, { nome: 'b' }])).toBeNull();
  });
});

describe('visões do Kanban (negócio e pessoal)', () => {
  const q = (x: Partial<import('./logic').Quadro>) => ({ id: 'q', nome: 'Q', created_at: '', ...x });
  it('separa os quadros por visão, incluindo os compartilhados', () => {
    const lista = [
      q({ id: 'neg', escopo: 'negocio', no_negocio: true, no_pessoal: false }),
      q({ id: 'meu', escopo: 'pessoal', no_negocio: false, no_pessoal: true }),
      q({ id: 'meuCompart', escopo: 'pessoal', no_negocio: true, no_pessoal: true }),
      q({ id: 'negNoMeu', escopo: 'negocio', no_negocio: true, no_pessoal: true }),
    ];
    expect(quadrosDaVisao(lista, 'negocio').map((x) => x.id)).toEqual(['neg', 'meuCompart', 'negNoMeu']);
    expect(quadrosDaVisao(lista, 'pessoal').map((x) => x.id)).toEqual(['meu', 'meuCompart', 'negNoMeu']);
  });
  it('quadro sem dados de escopo (antigo) fica no negócio', () => {
    expect(quadrosDaVisao([q({})], 'negocio')).toHaveLength(1);
    expect(quadrosDaVisao([q({})], 'pessoal')).toHaveLength(0);
  });
  it('permissão de edição', () => {
    expect(podeEditarQuadro({ permissao: 'ver' })).toBe(false);
    expect(podeEditarQuadro({ permissao: 'editar' })).toBe(true);
    expect(podeEditarQuadro({})).toBe(true);
  });
});

describe('visão do quadro e grupos', () => {
  const q = (id: string, extra: Partial<Quadro> = {}): Quadro => ({ id, nome: id, created_at: '', ...extra });

  it('visaoDoQuadro: negócio, pessoal e ambos', () => {
    expect(visaoDoQuadro({ escopo: 'negocio', dono_id: null })).toBe('negocio');
    expect(visaoDoQuadro({ escopo: 'pessoal', dono_id: 'u1' })).toBe('pessoal');
    expect(visaoDoQuadro({ escopo: 'negocio', dono_id: 'u1' })).toBe('ambos');
    expect(visaoDoQuadro({})).toBe('negocio');
  });

  it('agruparQuadros: grupos por nome, vazios aparecem, sem grupo no fim', () => {
    const grupos = [{ id: 'g2', nome: 'Salão' }, { id: 'g1', nome: 'Casa' }, { id: 'g3', nome: 'Vazio' }];
    const vinculos = [{ quadro_id: 'a', grupo_id: 'g1' }, { quadro_id: 'b', grupo_id: 'g2' }, { quadro_id: 'x', grupo_id: 'sumiu' }];
    const secoes = agruparQuadros([q('a'), q('b'), q('c'), q('x')], grupos, vinculos);
    expect(secoes.map((s) => s.grupo?.nome ?? null)).toEqual(['Casa', 'Salão', 'Vazio', null]);
    expect(secoes.map((s) => s.quadros.map((x) => x.id))).toEqual([['a'], ['b'], [], ['c', 'x']]);
  });

  it('agruparQuadros sem grupos: só a seção sem grupo', () => {
    expect(agruparQuadros([q('a')], [], [])).toEqual([{ grupo: null, quadros: [q('a')] }]);
  });

  it('validarNomeGrupo: tamanho e repetição', () => {
    const grupos = [{ id: 'g1', nome: 'Casa' }];
    expect(validarNomeGrupo('  ', grupos)).toMatch(/1 a 40/);
    expect(validarNomeGrupo('x'.repeat(41), grupos)).toMatch(/1 a 40/);
    expect(validarNomeGrupo('casa', grupos)).toBe('Já existe um grupo com esse nome.');
    expect(validarNomeGrupo('Casa', grupos, 'g1')).toBeNull();
    expect(validarNomeGrupo('Rotinas', grupos)).toBeNull();
  });
});
