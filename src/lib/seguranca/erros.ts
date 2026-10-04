import { logger } from './logger';

/**
 * Tratamento central de erros na tela (LOG-01). O usuário vê só uma mensagem
 * genérica e um código de correlação; o erro completo (mensagem do banco, código,
 * detalhe) vai para o logger com o mesmo código. Nunca mostre error.message cru.
 *
 * Exceção: erros com código P0001 são os "raise exception" escritos pelas
 * funções do próprio app no banco (ex.: "Este é o único quadro..."), já
 * redigidos para o usuário e sem detalhe interno.
 */

/** Erro com mensagem já redigida para o usuário (sem detalhe interno). */
export class ErroPublico extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroPublico';
  }
}

type ErroSupabase = { code?: string; message?: string; details?: string; hint?: string; status?: number };

/** Código curto para o usuário informar ao suporte (gerador criptográfico, CRI-06). */
export function novoIdCorrelacao(): string {
  return crypto.randomUUID().slice(0, 8).toUpperCase();
}

const MAX_MENSAGEM_PROPRIA = 160;

export function mensagemDeErro(e: unknown, padrao = 'Não foi possível concluir. Tente novamente.', origem = 'tela'): string {
  if (e instanceof ErroPublico) return e.message;
  const erro = (e ?? {}) as ErroSupabase;
  const msg = typeof erro.message === 'string' ? erro.message : '';

  if (erro.code === 'P0001' && msg && msg.length <= MAX_MENSAGEM_PROPRIA) return msg;
  if (/JWT|not authenticated|refresh token/i.test(msg) || erro.code === 'PGRST301' || erro.status === 401) {
    return 'Sessão expirada. Entre novamente.';
  }
  if (erro.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'Você não tem permissão para esta ação.';
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return 'Sem conexão. Verifique a internet e tente de novo.';
  }

  const id = novoIdCorrelacao();
  logger.error(`Falha em ${origem}`, { id, erro: e });
  return `${padrao} (código ${id})`;
}
