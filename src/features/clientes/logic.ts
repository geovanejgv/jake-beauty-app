// Regras puras de origem e grupos de clientes (sem acesso a dados).

/** Nome de origem ou grupo: sem espaços sobrando; vazio vira null. */
export function limparNome(nome: string, max: number): string | null {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (!limpo || limpo.length > max) return null;
  return limpo;
}

/** Já existe um nome igual (sem diferenciar maiúsculas e acentos)? `ignorarId` = o próprio registro. */
export function nomeRepetido(nome: string, existentes: { id: string; nome: string }[], ignorarId?: string): boolean {
  const chave = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return existentes.some((o) => o.id !== ignorarId && chave(o.nome) === chave(nome));
}

/** O que inserir e o que remover para o grupo passar de `atuais` para `marcadas`. */
export function diferencaMembros(atuais: string[], marcadas: string[]) {
  const a = new Set(atuais);
  const m = new Set(marcadas);
  return {
    incluir: [...m].filter((id) => !a.has(id)),
    remover: [...a].filter((id) => !m.has(id)),
  };
}

/** Palavra que a administradora digita na segunda etapa da exclusão de cliente. */
export const PALAVRA_EXCLUSAO = 'EXCLUIR';

export function confirmacaoExclusaoValida(texto: string): boolean {
  return texto.trim().toUpperCase() === PALAVRA_EXCLUSAO;
}

/** Grupos de cada cliente (em ordem alfabética), a partir da lista de membros. */
export function gruposPorCliente<G extends { id: string; nome: string }>(
  grupos: G[],
  membros: { grupo_id: string; cliente_id: string }[],
): Map<string, G[]> {
  const porId = new Map(grupos.map((g) => [g.id, g]));
  const mapa = new Map<string, G[]>();
  for (const m of membros) {
    const g = porId.get(m.grupo_id);
    if (!g) continue;
    mapa.set(m.cliente_id, [...(mapa.get(m.cliente_id) ?? []), g]);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return mapa;
}

/** Quantas clientes há em cada grupo. */
export function contarPorGrupo(membros: { grupo_id: string }[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const m of membros) mapa.set(m.grupo_id, (mapa.get(m.grupo_id) ?? 0) + 1);
  return mapa;
}

/** Descrição do grupo: sem espaços sobrando nas pontas; vazia vira null; até `max` caracteres. */
export function limparDescricao(texto: string, max = 500): string | null | false {
  const limpo = texto.trim();
  if (!limpo) return null;
  return limpo.length > max ? false : limpo;
}

export type Direcao = 'asc' | 'desc';

/**
 * Ordena por uma chave; vazios (null, undefined, '') ficam sempre no fim, nas duas direções.
 * Texto compara em português, sem diferenciar maiúsculas e acentos.
 */
export function ordenarPor<T>(lista: T[], chave: (item: T) => string | number | null | undefined, direcao: Direcao): T[] {
  const sinal = direcao === 'asc' ? 1 : -1;
  const vazio = (v: unknown) => v === null || v === undefined || v === '';
  return [...lista].sort((a, b) => {
    const va = chave(a);
    const vb = chave(b);
    if (vazio(va) || vazio(vb)) return vazio(va) === vazio(vb) ? 0 : vazio(va) ? 1 : -1;
    const r = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base', numeric: true });
    return r * sinal;
  });
}

/** Aniversário como MMDD (ex.: 0817), para ordenar pelo dia do ano e não pelo ano de nascimento. */
export function chaveAniversario(data: string | null | undefined): number | null {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(data ?? '');
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}

export type Aniversariante<T> = { cliente: T; dia: number; idade: number | null; hoje: boolean; passou: boolean };

/**
 * Aniversariantes do mês de `hoje` (AAAA-MM-DD), em ordem de dia.
 * `idade` é a que completa neste ano (null se o ano parece de preenchimento: antes de 1900).
 */
export function aniversariantesDoMes<T extends { birthday?: string | null }>(clientes: T[], hoje: string): Aniversariante<T>[] {
  const [ano, mes, diaHoje] = hoje.split('-').map(Number);
  const lista: Aniversariante<T>[] = [];
  for (const c of clientes) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(c.birthday ?? '');
    if (!m || Number(m[2]) !== mes) continue;
    const nasc = Number(m[1]);
    const dia = Number(m[3]);
    lista.push({ cliente: c, dia, idade: nasc >= 1900 && nasc <= ano ? ano - nasc : null, hoje: dia === diaHoje, passou: dia < diaHoje });
  }
  return lista.sort((a, b) => a.dia - b.dia);
}

/**
 * Colunas da tabela que cabem em `largura` (px). Entram por prioridade (a primeira sempre entra);
 * a partir da primeira que não cabe, todas vão para a linha de baixo. `reservado` é o espaço fixo (ex.: coluna de ações).
 * As duas listas saem na ordem de exibição de `colunas`. Largura 0 (ainda não medida) mostra todas.
 */
export function colunasQueCabem<T extends string>(
  largura: number,
  colunas: { id: T; min: number }[],
  prioridade: T[],
  reservado = 0,
): { visiveis: T[]; abaixo: T[] } {
  if (largura <= 0) return { visiveis: colunas.map((c) => c.id), abaixo: [] };
  const minimo = new Map(colunas.map((c) => [c.id, c.min]));
  const entram = new Set<T>();
  let usado = reservado;
  // Na ordem de prioridade: na primeira que não cabe, ela e as seguintes descem (a mais importante nunca
  // desce para dar lugar a uma menor).
  for (const [i, id] of prioridade.entries()) {
    const min = minimo.get(id) ?? 0;
    if (i > 0 && usado + min > largura) break;
    entram.add(id);
    usado += min;
  }
  return {
    visiveis: colunas.filter((c) => entram.has(c.id)).map((c) => c.id),
    abaixo: colunas.filter((c) => !entram.has(c.id)).map((c) => c.id),
  };
}
