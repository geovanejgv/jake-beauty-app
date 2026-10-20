/**
 * Validação das entradas da Edge Function (VAL-01, VAL-02): objetos fechados,
 * campo a campo, com limites. Campo não previsto é recusado; nada do corpo é
 * repassado inteiro ao banco. Mensagens já redigidas para a tela (sem eco do valor).
 */

export class ErroEntrada extends Error {
  constructor(mensagem: string, public readonly status = 400) {
    super(mensagem);
    this.name = 'ErroEntrada';
  }
}

export type Corpo = Record<string, unknown>;

export function objeto(v: unknown, permitidos: string[], rotulo = 'Dados'): Corpo {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ErroEntrada(`${rotulo} inválidos.`);
  const o = v as Corpo;
  if (Object.keys(o).some((k) => !permitidos.includes(k))) throw new ErroEntrada('Campos não permitidos na requisição.');
  return o;
}

export function uuid(c: Corpo, campo: string): string {
  const v = c[campo];
  if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw new ErroEntrada(`Campo inválido: ${campo}.`);
  return v.toLowerCase();
}

export function texto(c: Corpo, campo: string, min: number, max: number, opcional = false): string | undefined {
  const v = c[campo];
  if (v === undefined && opcional) return undefined;
  if (typeof v !== 'string') throw new ErroEntrada(`Campo inválido: ${campo}.`);
  const t = v.trim();
  if (opcional && t === '') return undefined;
  if (t.length < min || t.length > max) throw new ErroEntrada(`Campo inválido: ${campo}.`);
  return t;
}

export function umDe<T extends string>(c: Corpo, campo: string, opcoes: readonly T[]): T {
  const v = c[campo];
  if (typeof v !== 'string' || !opcoes.includes(v as T)) throw new ErroEntrada(`Campo inválido: ${campo}.`);
  return v as T;
}

/** Chave colada: só caracteres de chave, sem espaços (não ecoamos o valor em erro). */
export function chaveApi(c: Corpo, campo = 'api_key'): string | undefined {
  const v = c[campo];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new ErroEntrada('Chave de API inválida.');
  const t = v.trim();
  if (t.length < 20) throw new ErroEntrada('Chave de API muito curta.');
  if (t.length > 400) throw new ErroEntrada('Chave de API muito longa.');
  if (!/^[A-Za-z0-9_\-.:]+$/.test(t)) throw new ErroEntrada('A chave tem caracteres inválidos. Copie de novo, sem espaços.');
  return t;
}

export function nomeModelo(c: Corpo, campo = 'modelo'): string {
  const v = c[campo];
  if (typeof v !== 'string' || !/^[A-Za-z0-9._:\-/]{1,120}$/.test(v.trim())) throw new ErroEntrada('Modelo inválido.');
  return v.trim();
}

export function booleano(c: Corpo, campo: string): boolean | undefined {
  const v = c[campo];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw new ErroEntrada(`Campo inválido: ${campo}.`);
  return v;
}
