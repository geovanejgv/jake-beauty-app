import type { Marcadores } from '../prompt.ts';
import type { PromptIa } from '../tipos.ts';

/** Sessão já conferida pela Edge Function: perfil e estabelecimento vêm do banco (AUZ-03, AUZ-06). */
export type SessaoIa = {
  /** auth.users.id (conta de login). */
  authId: string;
  /** public.users.id (perfil no estabelecimento). */
  usuarioId: string;
  estabelecimentoId: string;
};

export type LeadIa = {
  id: string;
  nome: string;
  origem: string | null;
  interesse: string | null;
  resumo: string | null;
  etapa: string;
  valor_estimado: number | null;
  proxima_acao: string | null;
  motivo_perda: string | null;
  created_at: string;
};

export type ClienteIa = { id: string; nome: string; observacoes: string | null };
export type AnotacaoIa = { tipo: string; texto: string; created_at: string };
export type AtendimentoIa = { inicio: string; servico: string | null; status: string | null };

/**
 * Leituras feitas com o cliente do PRÓPRIO usuário (JWT da sessão): o RLS decide o
 * que entra no contexto (LLM-02, LLM-12). Registro de outro estabelecimento ou fora
 * do alcance da pessoa volta null (vira 404). Campos escolhidos por nome (IAD-03).
 */
export interface LeitorIa {
  lead(id: string): Promise<LeadIa | null>;
  cliente(id: string): Promise<ClienteIa | null>;
  anotacoesCliente(id: string, limite: number): Promise<AnotacaoIa[]>;
  atendimentosCliente(id: string, limite: number): Promise<AtendimentoIa[]>;
  nomesServicos(limite: number): Promise<string[]>;
}

export type ContextoIa = { sessao: SessaoIa; leitor: LeitorIa; hoje: string };

export type Vinculo = { client_id?: string | null; lead_id?: string | null };

export type Preparado = {
  prompt: PromptIa;
  marcadores: Marcadores;
  vinculo: Vinculo;
  /** Parâmetros curtos do pedido, guardados com o resultado (nunca o registro inteiro). */
  parametros: Record<string, string | number | boolean | null>;
};

/**
 * Uma entrada do registro. Só conhece a interface comum (PromptIa); nunca um
 * provedor específico. Funcionalidade nova = um arquivo e uma linha no index.
 */
export interface FuncionalidadeIa<E = unknown, S = unknown> {
  id: string;
  rotulo: string;
  /** Valida o corpo (objeto fechado, VAL-01/02); lança ErroEntrada se não servir. */
  entrada(bruto: unknown): E;
  formato: 'texto' | 'json';
  /** Teto de saída, incluindo o raciocínio do modelo (LLM-11). */
  maxTokens: number;
  /** "low" para extração e resumo, "medium" para redação e análise. */
  esforco: 'low' | 'medium' | 'high';
  /** Lê os dados pelo cliente do usuário (RLS) e monta o prompt. Sem acesso: ErroIa("nao_encontrado"). */
  preparar(ctx: ContextoIa, entrada: E): Promise<Preparado>;
  /** Valida a saída (schema estrito, LLM-08); lança ErroIa("resposta_invalida") se não servir. */
  interpretar(texto: string): S;
}
