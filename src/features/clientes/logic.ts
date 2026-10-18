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
