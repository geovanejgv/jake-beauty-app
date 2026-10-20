import { triagemLead } from './triagem-lead.ts';
import { resumoCliente } from './resumo-cliente.ts';
import type { FuncionalidadeIa } from './tipos.ts';

/**
 * Registro das funcionalidades de IA. Cada entrada usa só a interface comum
 * (AiProvider), então funciona igual com qualquer provedor. Nova funcionalidade:
 * um arquivo nesta pasta, uma linha aqui e o id na restrição de ai_generations.
 */
export const FUNCIONALIDADES = {
  triagem_lead: triagemLead,
  resumo_cliente: resumoCliente,
} satisfies Record<string, FuncionalidadeIa<any, any>>;

export type IdFuncionalidade = keyof typeof FUNCIONALIDADES;

export const ehFuncionalidade = (v: unknown): v is IdFuncionalidade => typeof v === 'string' && Object.hasOwn(FUNCIONALIDADES, v);
