import { ErroIa } from './tipos.ts';

/**
 * Leitura da resposta do modelo. Não interpreta nada além de JSON: a saída nunca
 * vai para eval, shell ou SQL (LLM-07); a validação campo a campo vem depois (LLM-08).
 */

/** Extrai o objeto JSON da resposta (alguns modelos cercam com ```json ... ``` ou comentam antes). */
export function extrairJson(texto: string): string {
  const semCerca = texto.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const ini = semCerca.indexOf('{');
  const fim = semCerca.lastIndexOf('}');
  if (ini < 0 || fim <= ini) throw new ErroIa('resposta_invalida');
  return semCerca.slice(ini, fim + 1);
}

export function lerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErroIa('resposta_invalida');
  }
}

// ---------------------------------------------------------------- schema estrito mínimo
// O projeto não usa Zod (DEP-01): validadores pequenos e fechados. Campo a mais,
// tipo errado ou tamanho fora do limite = resposta_invalida (nada é salvo).

const invalida = (): never => {
  throw new ErroIa('resposta_invalida');
};

export function objetoEstrito(v: unknown, campos: string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return invalida();
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!campos.includes(k)) invalida();
  return o;
}

export function textoLimitado(v: unknown, min: number, max: number): string {
  if (typeof v !== 'string') return invalida();
  const t = v.trim();
  if (t.length < min || t.length > max) invalida();
  return t;
}

export function textoOuNulo(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const t = textoLimitado(v, 0, max);
  return t || null;
}

export function listaDeTextos(v: unknown, maxItens: number, maxTexto: number): string[] {
  if (!Array.isArray(v) || v.length > maxItens) return invalida();
  return v.map((x) => textoLimitado(x, 1, maxTexto));
}

export function umDe<T extends string>(v: unknown, opcoes: readonly T[]): T {
  if (typeof v !== 'string' || !opcoes.includes(v as T)) return invalida();
  return v as T;
}

export function inteiroOuNulo(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return invalida();
  return v;
}
