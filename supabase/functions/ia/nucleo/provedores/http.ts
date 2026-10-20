import { ErroIa } from '../tipos.ts';

/**
 * Chamada HTTP comum dos adaptadores: tempo máximo em toda chamada (RAT-05),
 * corpo lido como JSON e nenhum texto do provedor repassado adiante.
 */

export type RespostaHttp = { status: number; corpo: unknown };

/** error.type / status só com letras, números e "_" (nunca texto livre do provedor). */
export const tipoSeguro = (t: unknown): string => (typeof t === 'string' && /^[A-Za-z0-9_]{1,60}$/.test(t) ? t.toLowerCase() : 'desconhecido');

/** Função fetch usada pelos adaptadores (os testes trocam por uma falsa). */
export type Buscar = (url: string, init: RequestInit) => Promise<Response>;

export async function pedir(buscar: Buscar, url: string, init: RequestInit, timeoutMs: number, tentativasExtras = 0): Promise<RespostaHttp> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      // Sem seguir redirecionamento: a chave só vai ao destino fixo do provedor.
      const r = await buscar(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      const corpo = await r.json().catch(() => null);
      return { status: r.status, corpo };
    } catch (e) {
      const nome = (e as { name?: string })?.name;
      const tipo = nome === 'TimeoutError' || nome === 'AbortError' ? 'timeout' : 'erro_de_rede';
      if (tentativa >= tentativasExtras) throw new ErroIa('indisponivel', { status: null, tipo });
    }
  }
}

/** Lê um caminho do corpo JSON sem confiar no formato. */
export function campo(corpo: unknown, ...caminho: (string | number)[]): unknown {
  let atual: unknown = corpo;
  for (const p of caminho) {
    if (atual === null || typeof atual !== 'object') return undefined;
    atual = (atual as Record<string | number, unknown>)[p];
  }
  return atual;
}

export const comoTexto = (v: unknown): string => (typeof v === 'string' ? v : '');
export const comoNumero = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
