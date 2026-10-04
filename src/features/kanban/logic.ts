// Regras do Kanban que não dependem de tela nem de banco (testadas em logic.test.ts).

export type StatusTarefa = 'pendente' | 'em_andamento' | 'concluida';
export type Criticidade = 'normal' | 'urgente' | 'critico';

export interface Quadro {
  id: string;
  nome: string;
  created_at: string;
}

export interface Coluna {
  id: string;
  quadro_id: string;
  nome: string;
  posicao: number;
}

export interface ItemTarefa {
  id: string;
  task_id: string;
  titulo: string;
  concluido: boolean;
  ordem: number;
  created_at: string;
}

export interface Tarefa {
  id: string;
  titulo: string;
  responsible_id: string;
  status: StatusTarefa;
  data_limite: string | null;
  client_id: string | null;
  descricao: string | null;
  criticidade: Criticidade;
  ordem: number;
  coluna_id: string;
  created_by: string | null;
  envolvidos: string[];
  concluida_em: string | null;
  cancelada_em: string | null;
  created_at: string;
  clients?: { id: string; name: string; phone: string } | null;
  tarefa_itens?: ItemTarefa[];
}

export interface Pessoa {
  id: string;
  name: string;
  auth_id: string | null;
  active: boolean | null;
}

export const CRITICIDADES: { valor: Criticidade; rotulo: string }[] = [
  { valor: 'normal', rotulo: 'Normal' },
  { valor: 'urgente', rotulo: 'Urgente' },
  { valor: 'critico', rotulo: 'Crítico' },
];

export const LIMITES = {
  tituloTarefa: 200,
  tituloItem: 200,
  descricao: 4000,
  envolvidos: 20,
  nomeQuadro: 30,
  nomeColuna: 25,
  minColunas: 2,
  maxColunas: 10,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

// -----------------------------------------------------------------------------
// Ordem e status
// -----------------------------------------------------------------------------

/**
 * Move o cartão `id` para a coluna `coluna`, antes do cartão `antesDe`
 * (ou no fim, se `antesDe` for null). A coluna de destino é renumerada (ordem = índice).
 * Soltar sobre si mesmo ou informar um id desconhecido devolve a lista intacta.
 */
export function reordenar<T extends { id: string; coluna_id: string; ordem: number }>(
  lista: T[],
  id: string,
  coluna: string,
  antesDe: string | null,
): T[] {
  const cartao = lista.find((t) => t.id === id);
  if (!cartao || antesDe === id) return lista;

  const resto = lista.filter((t) => t.id !== id);
  const destino = resto.filter((t) => t.coluna_id === coluna).sort((a, b) => a.ordem - b.ordem);
  let indice = antesDe ? destino.findIndex((t) => t.id === antesDe) : -1;
  if (indice < 0) indice = destino.length;
  destino.splice(indice, 0, { ...cartao, coluna_id: coluna });

  return [
    ...resto.filter((t) => t.coluna_id !== coluna),
    ...destino.map((t, i) => (t.ordem === i ? t : { ...t, ordem: i })),
  ];
}

/** Ids da coluna na ordem de exibição (para gravar a ordem no banco). */
export function idsDaColuna<T extends { id: string; coluna_id: string; ordem: number }>(lista: T[], coluna: string): string[] {
  return lista
    .filter((t) => t.coluna_id === coluna)
    .sort((a, b) => a.ordem - b.ordem)
    .map((t) => t.id);
}

/** Status pela posição da coluna (índice a partir de 0). Mesma regra do gatilho no banco. */
export function statusDaPosicao(indice: number, total: number): StatusTarefa {
  if (indice >= total - 1) return 'concluida';
  if (indice <= 0) return 'pendente';
  return 'em_andamento';
}

// -----------------------------------------------------------------------------
// Datas (sempre "YYYY-MM-DD" no fuso local, para não mudar de dia)
// -----------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function hojeISO(): string {
  return isoLocal(new Date());
}

function paraData(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function ehDataISO(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return isoLocal(paraData(v)) === v;
}

export function somaDias(iso: string, dias: number): string {
  const d = paraData(iso);
  d.setDate(d.getDate() + dias);
  return isoLocal(d);
}

/** "2026-10-03" -> "03/10/2026" */
export function dataBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Data escolhida em "Concluída em" gravada ao meio-dia de Brasília (não muda de dia em UTC). */
export function conclusaoParaTimestamp(dataISO: string): string {
  return `${dataISO}T12:00:00-03:00`;
}

/** Dia (YYYY-MM-DD) de um timestamp no horário de Brasília. */
export function diaEmBrasilia(timestamp: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

export function estaAtrasada(t: Pick<Tarefa, 'data_limite' | 'status'>, hoje: string): boolean {
  return !!t.data_limite && t.status !== 'concluida' && t.data_limite < hoje;
}

// -----------------------------------------------------------------------------
// Filtros
// -----------------------------------------------------------------------------

export const PERIODOS = [
  'todos', 'hoje', 'amanha', 'esta_semana', 'este_mes', 'proximos_3', 'proxima_semana', 'proximo_mes',
  'ontem', 'ultimos_7', 'ultimos_30', 'personalizado',
] as const;
export type Periodo = (typeof PERIODOS)[number];

export const ROTULO_PERIODO: Record<Periodo, string> = {
  todos: 'Todas as datas',
  hoje: 'Hoje',
  amanha: 'Amanhã',
  esta_semana: 'Esta semana',
  este_mes: 'Este mês',
  proximos_3: 'Próximos 3 dias',
  proxima_semana: 'Próxima semana',
  proximo_mes: 'Próximo mês',
  ontem: 'Ontem',
  ultimos_7: 'Últimos 7 dias',
  ultimos_30: 'Últimos 30 dias',
  personalizado: 'Definir período',
};

export const ATRIBUICOES = ['todas', 'responsavel', 'criador', 'envolvido'] as const;
export type Atribuicao = (typeof ATRIBUICOES)[number];

export const ROTULO_ATRIBUICAO: Record<Atribuicao, string> = {
  todas: 'Todas as atribuições',
  responsavel: 'Responsável',
  criador: 'Quem criou',
  envolvido: 'Envolvido',
};

export const STATUS_FILTRO = ['todos', 'canceladas'] as const;
export type StatusFiltro = (typeof STATUS_FILTRO)[number];

export interface Filtros {
  periodo: Periodo;
  de: string | null;
  ate: string | null;
  pessoa: string | null;
  atrib: Atribuicao;
  status: StatusFiltro;
}

export const FILTROS_PADRAO: Filtros = { periodo: 'todos', de: null, ate: null, pessoa: null, atrib: 'todas', status: 'todos' };

export interface Intervalo {
  de: string;
  ate: string;
}

/** Intervalo (inclusivo) de cada período. Semanas de domingo a sábado. */
export function intervaloKanban(periodo: Periodo, hoje: string, de?: string | null, ate?: string | null): Intervalo | null {
  const h = paraData(hoje);
  const domingo = somaDias(hoje, -h.getDay());
  const mes = (desloc: number): Intervalo => {
    const ini = new Date(h.getFullYear(), h.getMonth() + desloc, 1);
    const fim = new Date(h.getFullYear(), h.getMonth() + desloc + 1, 0);
    return { de: isoLocal(ini), ate: isoLocal(fim) };
  };
  switch (periodo) {
    case 'todos': return null;
    case 'hoje': return { de: hoje, ate: hoje };
    case 'amanha': { const a = somaDias(hoje, 1); return { de: a, ate: a }; }
    case 'ontem': { const o = somaDias(hoje, -1); return { de: o, ate: o }; }
    case 'esta_semana': return { de: domingo, ate: somaDias(domingo, 6) };
    case 'proxima_semana': return { de: somaDias(domingo, 7), ate: somaDias(domingo, 13) };
    case 'este_mes': return mes(0);
    case 'proximo_mes': return mes(1);
    case 'proximos_3': return { de: hoje, ate: somaDias(hoje, 3) };
    case 'ultimos_7': return { de: somaDias(hoje, -6), ate: hoje };
    case 'ultimos_30': return { de: somaDias(hoje, -29), ate: hoje };
    case 'personalizado':
      return ehDataISO(de) && ehDataISO(ate) && de <= ate ? { de, ate } : null;
  }
}

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

/** Texto do botão de intervalo: "OUTUBRO/2026", "03/10/2026" ou "27/09/2026 a 03/10/2026". */
export function rotuloIntervalo(f: Filtros, hoje: string): string | null {
  const iv = intervaloKanban(f.periodo, hoje, f.de, f.ate);
  if (!iv) return null;
  if (f.periodo === 'este_mes' || f.periodo === 'proximo_mes') {
    const d = paraData(iv.de);
    return `${MESES[d.getMonth()]}/${d.getFullYear()}`;
  }
  return iv.de === iv.ate ? dataBR(iv.de) : `${dataBR(iv.de)} a ${dataBR(iv.ate)}`;
}

function umDe<T extends string>(valores: readonly T[], v: string | null, padrao: T): T {
  return v !== null && (valores as readonly string[]).includes(v) ? (v as T) : padrao;
}

/** Lê os filtros da URL; valor inválido volta ao padrão. */
export function lerFiltros(params: URLSearchParams): Filtros {
  let periodo = umDe(PERIODOS, params.get('periodo'), 'todos');
  let de: string | null = null;
  let ate: string | null = null;
  if (periodo === 'personalizado') {
    const d = params.get('de');
    const a = params.get('ate');
    if (ehDataISO(d) && ehDataISO(a) && d <= a) { de = d; ate = a; } else periodo = 'todos';
  }
  const p = params.get('pessoa');
  const pessoa = ehUuid(p) ? p.toLowerCase() : null;
  const atrib = pessoa ? umDe(ATRIBUICOES, params.get('atrib'), 'todas') : 'todas';
  const status = umDe(STATUS_FILTRO, params.get('status'), 'todos');
  return { periodo, de, ate, pessoa, atrib, status };
}

/** Grava os filtros na URL, sem os valores padrão. `extras` entram primeiro (ex.: quadro). */
export function urlFiltros(f: Filtros, extras: Record<string, string | null | undefined> = {}): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extras)) if (v) p.set(k, v);
  if (f.periodo !== 'todos') {
    if (f.periodo !== 'personalizado' || (f.de && f.ate)) p.set('periodo', f.periodo);
    if (f.periodo === 'personalizado' && f.de && f.ate) { p.set('de', f.de); p.set('ate', f.ate); }
  }
  if (f.pessoa) {
    p.set('pessoa', f.pessoa);
    if (f.atrib !== 'todas') p.set('atrib', f.atrib);
  }
  if (f.status !== 'todos') p.set('status', f.status);
  return p;
}

export function temFiltroAtivo(f: Filtros): boolean {
  return f.periodo !== 'todos' || !!f.pessoa || f.status !== 'todos';
}

export function passaNoFiltro(
  t: Pick<Tarefa, 'cancelada_em' | 'data_limite' | 'responsible_id' | 'created_by' | 'envolvidos'>,
  f: Filtros,
  hoje: string,
): boolean {
  const cancelada = !!t.cancelada_em;
  if (f.status === 'canceladas' ? !cancelada : cancelada) return false;

  const iv = intervaloKanban(f.periodo, hoje, f.de, f.ate);
  if (iv) {
    if (!t.data_limite || t.data_limite < iv.de || t.data_limite > iv.ate) return false;
  }

  if (f.pessoa) {
    const resp = t.responsible_id === f.pessoa;
    const criou = t.created_by === f.pessoa;
    const env = (t.envolvidos || []).includes(f.pessoa);
    const ok =
      f.atrib === 'responsavel' ? resp :
      f.atrib === 'criador' ? criou :
      f.atrib === 'envolvido' ? env :
      resp || criou || env;
    if (!ok) return false;
  }
  return true;
}

// -----------------------------------------------------------------------------
// Validações (equivalentes aos "schemas" da API; o banco valida de novo)
// -----------------------------------------------------------------------------

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

export interface NovaTarefa {
  titulo: string;
  responsible_id: string;
  data_limite: string | null;
  criticidade: Criticidade;
  descricao: string | null;
  client_id: string | null;
  coluna_id: string;
  envolvidos: string[];
}

const CAMPOS_NOVA = ['titulo', 'responsible_id', 'data_limite', 'criticidade', 'descricao', 'client_id', 'coluna_id', 'envolvidos'];
const CAMPOS_EDICAO = ['titulo', 'responsible_id', 'data_limite', 'criticidade', 'descricao', 'client_id', 'coluna_id', 'envolvidos', 'cancelada', 'concluida_em'];
const CRITICIDADES_VALIDAS = CRITICIDADES.map((c) => c.valor) as string[];

function camposExtras(obj: Record<string, unknown>, permitidos: string[]): string | null {
  const extra = Object.keys(obj).find((k) => !permitidos.includes(k));
  return extra ? `Campo não permitido: ${extra}.` : null;
}

function validarComuns(o: Record<string, unknown>): string | null {
  if ('titulo' in o) {
    const t = typeof o.titulo === 'string' ? o.titulo.trim() : '';
    if (t.length < 1 || t.length > LIMITES.tituloTarefa) return `A descrição da tarefa deve ter de 1 a ${LIMITES.tituloTarefa} caracteres.`;
  }
  if ('responsible_id' in o && !ehUuid(o.responsible_id)) return 'Responsável inválido.';
  if ('data_limite' in o && o.data_limite !== null && o.data_limite !== '' && !ehDataISO(o.data_limite)) return 'Data inválida.';
  if ('criticidade' in o && !CRITICIDADES_VALIDAS.includes(o.criticidade as string)) return 'Prioridade inválida.';
  if ('descricao' in o && o.descricao !== null && (typeof o.descricao !== 'string' || o.descricao.length > LIMITES.descricao)) {
    return `A observação pode ter no máximo ${LIMITES.descricao} caracteres.`;
  }
  if ('client_id' in o && o.client_id !== null && !ehUuid(o.client_id)) return 'Cliente inválida.';
  if ('coluna_id' in o && !ehUuid(o.coluna_id)) return 'Coluna inválida.';
  if ('envolvidos' in o) {
    if (!Array.isArray(o.envolvidos) || !o.envolvidos.every(ehUuid)) return 'Envolvido inválido.';
    if (new Set(o.envolvidos).size > LIMITES.envolvidos) return `No máximo ${LIMITES.envolvidos} envolvidos.`;
  }
  return null;
}

export function validarNovaTarefa(entrada: Record<string, unknown>): Resultado<NovaTarefa> {
  const erro = camposExtras(entrada, CAMPOS_NOVA) ?? validarComuns(entrada);
  if (erro) return { ok: false, erro };
  if (!('titulo' in entrada)) return { ok: false, erro: 'Informe a descrição da tarefa.' };
  if (!ehUuid(entrada.responsible_id)) return { ok: false, erro: 'Responsável inválido.' };
  if (!ehUuid(entrada.coluna_id)) return { ok: false, erro: 'Coluna inválida.' };
  const desc = typeof entrada.descricao === 'string' ? entrada.descricao.trim() : '';
  return {
    ok: true,
    dados: {
      titulo: (entrada.titulo as string).trim(),
      responsible_id: entrada.responsible_id,
      data_limite: entrada.data_limite ? (entrada.data_limite as string) : null,
      criticidade: (entrada.criticidade as Criticidade) || 'normal',
      descricao: desc || null,
      client_id: (entrada.client_id as string) || null,
      coluna_id: entrada.coluna_id,
      envolvidos: [...new Set((entrada.envolvidos as string[]) || [])],
    },
  };
}

/** Edição: ao menos um campo, sem campos extras (inclusive "status", que vem da coluna). */
export function validarEdicaoTarefa(entrada: Record<string, unknown>): Resultado<Record<string, unknown>> {
  if (Object.keys(entrada).length === 0) return { ok: false, erro: 'Nada para salvar.' };
  const erro = camposExtras(entrada, CAMPOS_EDICAO) ?? validarComuns(entrada);
  if (erro) return { ok: false, erro };
  if ('cancelada' in entrada && typeof entrada.cancelada !== 'boolean') return { ok: false, erro: 'Valor inválido para cancelada.' };
  if ('concluida_em' in entrada && entrada.concluida_em !== null && !ehDataISO(entrada.concluida_em)) return { ok: false, erro: 'Data de conclusão inválida.' };
  return { ok: true, dados: entrada };
}

/** Converte a edição validada para as colunas da tabela. */
export function edicaoParaBanco(e: Record<string, unknown>, agora: () => string = () => new Date().toISOString()): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    if (k === 'cancelada') r.cancelada_em = v ? agora() : null;
    else if (k === 'concluida_em') r.concluida_em = v ? conclusaoParaTimestamp(v as string) : null;
    else if (k === 'titulo') r.titulo = (v as string).trim();
    else if (k === 'data_limite') r.data_limite = v || null;
    else if (k === 'descricao') r.descricao = typeof v === 'string' && v.trim() ? v : null;
    else if (k === 'envolvidos') r.envolvidos = [...new Set(v as string[])];
    else r[k] = v;
  }
  return r;
}

export interface ColunaEdicao {
  id?: string;
  nome: string;
}

export function validarQuadro(nome: string, colunas: ColunaEdicao[]): string | null {
  const n = nome.trim();
  if (n.length < 1 || n.length > LIMITES.nomeQuadro) return `O nome do quadro deve ter de 1 a ${LIMITES.nomeQuadro} caracteres.`;
  if (colunas.length < LIMITES.minColunas || colunas.length > LIMITES.maxColunas) {
    return `O quadro deve ter de ${LIMITES.minColunas} a ${LIMITES.maxColunas} colunas.`;
  }
  for (const c of colunas) {
    const cn = c.nome.trim();
    if (cn.length < 1 || cn.length > LIMITES.nomeColuna) return `O nome de cada coluna deve ter de 1 a ${LIMITES.nomeColuna} caracteres.`;
  }
  return null;
}

export const COLUNAS_PADRAO: ColunaEdicao[] = [{ nome: 'A Fazer' }, { nome: 'Fazendo' }, { nome: 'Concluído' }];
