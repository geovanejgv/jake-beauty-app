/**
 * Destino depois do login (L-05): só caminho interno do portal, nunca outro site.
 * O destino atravessa a ida ao Google guardado na aba (sessionStorage), porque a
 * URL de retorno cadastrada no Supabase é fixa (/auth/callback).
 */

const MAX = 512;
const CHAVE_DESTINO = 'jb-destino-login';

export function caminhoInternoSeguro(valor: unknown, padrao = '/'): string {
  if (typeof valor !== 'string' || !valor || valor.length > MAX) return padrao;
  // Caracteres de controle (inclui quebra de linha e tab) ou barra invertida: recusa.
  if (/[\u0000-\u001f\u007f\\]/.test(valor)) return padrao;
  // Precisa começar com uma barra só ("//x.com" é outro site) e não pode ter esquema.
  if (!valor.startsWith('/') || valor.startsWith('//')) return padrao;
  try {
    const base = 'https://portal.invalido';
    const url = new URL(valor, base);
    if (url.origin !== base) return padrao;
    // Não volta para as telas do próprio login.
    if (url.pathname === '/login' || url.pathname.startsWith('/auth/')) return padrao;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return padrao;
  }
}

export function guardarDestino(valor: unknown): void {
  try { sessionStorage.setItem(CHAVE_DESTINO, caminhoInternoSeguro(valor)); } catch { /* aba sem armazenamento: volta ao início */ }
}

/** Lê e apaga o destino guardado (vale uma vez). */
export function retirarDestino(): string {
  let valor: string | null = null;
  try {
    valor = sessionStorage.getItem(CHAVE_DESTINO);
    sessionStorage.removeItem(CHAVE_DESTINO);
  } catch { /* sem armazenamento */ }
  return caminhoInternoSeguro(valor);
}
