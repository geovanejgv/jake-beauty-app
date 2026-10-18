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
