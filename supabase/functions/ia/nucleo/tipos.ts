/**
 * Interface comum dos provedores de IA. O restante da integração (funcionalidades,
 * serviço, Edge Function) só conhece estes tipos; só os arquivos de provedores/
 * falam com a API de cada provedor (teste tests/ia/isolamento.test.ts).
 *
 * Sem SDK de provedor (DEP-01: nenhuma dependência nova): cada adaptador chama a
 * API HTTP oficial com fetch, destino fixo e tempo máximo (RAT-05).
 *
 * Provedor novo: um adaptador em provedores/, uma linha em adaptadores.ts e em
 * catalogo.ts, e o valor novo na restrição da coluna provider no banco.
 */

export const PROVEDORES_IA = ['anthropic', 'openai', 'google'] as const;
export type ProvedorIa = (typeof PROVEDORES_IA)[number];

/** Pedido já montado (prompt.ts): instruções fixas e dados delimitados. */
export type PromptIa = { sistema: string; usuario: string };

export type OpcoesGeracao = {
  modelo: string;
  maxTokens: number;
  /** "json": o provedor é instruído a devolver um objeto JSON (validado depois, LLM-08). */
  formato: 'texto' | 'json';
  /**
   * Quanto o modelo raciocina antes de responder. Nos modelos atuais o raciocínio
   * conta no mesmo limite de saída: tarefa simples com esforço alto esgota o limite.
   * Cada adaptador aplica quando o modelo aceita; senão ignora.
   */
  esforco?: 'low' | 'medium' | 'high';
};

export type RespostaIa = { texto: string; modelo: string; tokensEntrada?: number; tokensSaida?: number };

/**
 * Diagnóstico seguro de uma falha no provedor: só o status HTTP e o tipo do erro
 * (ex.: 401 | authentication_error). Nunca a mensagem do provedor, que pode repetir
 * parte da chave. status null = sem resposta HTTP (rede, tempo esgotado).
 */
export type DiagnosticoIa = { status: number | null; tipo: string };

export type ValidacaoChave = { valida: true; modelos: string[] } | { valida: false; codigo: CodigoErroIa; diagnostico?: DiagnosticoIa };

export interface AiProvider {
  readonly id: ProvedorIa;
  generateText(prompt: PromptIa, opcoes: OpcoesGeracao): Promise<RespostaIa>;
  /** Confere a chave no provedor e devolve os modelos da conta. */
  validateApiKey(): Promise<ValidacaoChave>;
}

export const CODIGOS_ERRO_IA = [
  'ia_nao_configurada',
  'chave_invalida',
  'sem_saldo',
  'sem_permissao',
  'modelo_invalido',
  'pedido_recusado',
  'cota_provedor',
  'indisponivel',
  'recusa',
  'limite_tokens',
  'resposta_invalida',
  'entrada_grande',
  'cota_diaria',
  'ritmo',
  'nao_encontrado',
  'erro_interno',
] as const;
export type CodigoErroIa = (typeof CODIGOS_ERRO_IA)[number];

/** Mensagens públicas: nunca repassamos o texto do provedor (pode trazer parte da chave). */
export const MENSAGEM_ERRO_IA: Record<CodigoErroIa, string> = {
  ia_nao_configurada: 'Ative a integração com IA em Configurações para usar este recurso.',
  chave_invalida: 'Chave de API inválida: o provedor não reconheceu a chave. Confira se ela foi copiada inteira e se não foi revogada.',
  sem_saldo: 'A conta no provedor está sem saldo de créditos. Adicione créditos no painel do provedor e tente de novo.',
  sem_permissao: 'A chave não tem permissão para este recurso. Confira o projeto e as permissões da chave no provedor.',
  modelo_invalido: 'Modelo inválido ou indisponível para esta conta. Escolha outro modelo.',
  pedido_recusado: 'O provedor recusou o pedido. Veja o diagnóstico abaixo.',
  cota_provedor: 'Limite de uso do provedor atingido (pedidos por minuto ou teto de gasto da conta). Aguarde e tente de novo.',
  indisponivel: 'O provedor de IA está indisponível ou não respondeu. Tente novamente em instantes.',
  recusa: 'O provedor de IA recusou este pedido.',
  limite_tokens: 'A IA usou todo o limite de resposta antes de terminar. Tente de novo; se repetir, escolha um modelo mais rápido em Configurações > Integração com IA.',
  resposta_invalida: 'A IA devolveu uma resposta fora do formato esperado. Nada foi salvo; tente novamente.',
  entrada_grande: 'O conteúdo é grande demais para enviar à IA.',
  cota_diaria: 'Você atingiu a cota diária de uso da IA. Ela volta amanhã.',
  ritmo: 'Muitos pedidos à IA em pouco tempo. Aguarde alguns minutos e tente de novo.',
  nao_encontrado: 'Registro não encontrado.',
  erro_interno: 'Não foi possível concluir o pedido à IA.',
};

/** Status HTTP de cada código. "IA não configurada" é estado normal: 200 com ok=false (a tela mostra o convite). */
export const STATUS_IA: Record<CodigoErroIa, number> = {
  ia_nao_configurada: 200,
  chave_invalida: 400,
  sem_saldo: 402,
  sem_permissao: 400,
  modelo_invalido: 400,
  pedido_recusado: 400,
  entrada_grande: 413,
  nao_encontrado: 404,
  cota_diaria: 429,
  ritmo: 429,
  cota_provedor: 502,
  indisponivel: 502,
  recusa: 502,
  limite_tokens: 502,
  resposta_invalida: 502,
  erro_interno: 500,
};

/** Erro já traduzido para um código da plataforma; não carrega mensagem do provedor. */
export class ErroIa extends Error {
  constructor(
    public readonly codigo: CodigoErroIa,
    public readonly diagnostico?: DiagnosticoIa,
  ) {
    super(`ia:${codigo}`);
    this.name = 'ErroIa';
  }
}

/** Tradução comum por status HTTP do provedor. */
export function codigoPorStatus(status: number | null | undefined): CodigoErroIa {
  if (status === 401) return 'chave_invalida';
  if (status === 402) return 'sem_saldo';
  if (status === 403) return 'sem_permissao';
  if (status === 404) return 'modelo_invalido';
  if (status === 429) return 'cota_provedor';
  if (status === 413) return 'entrada_grande';
  if (status === 400 || status === 422) return 'pedido_recusado';
  return 'indisponivel';
}

/** Tempo máximo de uma chamada ao provedor (RAT-05), sem nova tentativa automática. */
export const TIMEOUT_IA_MS = 55_000;
/** Validação de chave: 15 s, com 1 nova tentativa só em falha de rede. */
export const TIMEOUT_VALIDACAO_MS = 15_000;
/** Listagem de modelos: no máximo 300. */
export const MAX_MODELOS = 300;
