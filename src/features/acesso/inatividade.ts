/**
 * Administradora parada por mais de 30 minutos sai do portal (L-09 adaptado).
 *
 * Sem servidor próprio, o tempo parado é medido no navegador: o último gesto da
 * pessoa (clique, toque, tecla) fica gravado neste aparelho e vale entre abas e
 * recarregamentos. Atualização automática das telas não conta como atividade (L-10):
 * só eventos de quem usa. A segunda camada, no servidor, é o "Inactivity timeout"
 * do Supabase Auth (pendencias-humanas.md).
 */

export const INATIVIDADE_ADMIN_SEG = 30 * 60;
const CHAVE_ATIVIDADE = 'jb-ultima-atividade';

/** Segundos parada a partir do valor gravado; null = valor ausente ou inválido. */
export function segundosOcioso(valor?: string | null, agoraMs = Date.now()): number | null {
  if (!valor || !/^\d{1,12}$/.test(valor)) return null;
  const ultima = Number(valor);
  const agora = Math.floor(agoraMs / 1000);
  if (ultima > agora + 60) return null; // horário no futuro: ignora
  return Math.max(0, agora - ultima);
}

export const passouDoLimite = (ocioso: number | null, limite = INATIVIDADE_ADMIN_SEG) => ocioso !== null && ocioso > limite;

export function lerAtividade(): string | null {
  try { return localStorage.getItem(CHAVE_ATIVIDADE); } catch { return null; }
}

export function marcarAtividade(agoraMs = Date.now()): void {
  try { localStorage.setItem(CHAVE_ATIVIDADE, String(Math.floor(agoraMs / 1000))); } catch { /* sem armazenamento */ }
}

export function limparAtividade(): void {
  try { localStorage.removeItem(CHAVE_ATIVIDADE); } catch { /* sem armazenamento */ }
}
