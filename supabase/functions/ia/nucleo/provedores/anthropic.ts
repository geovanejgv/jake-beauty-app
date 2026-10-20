import { ErroIa, MAX_MODELOS, TIMEOUT_IA_MS, TIMEOUT_VALIDACAO_MS, type AiProvider, type CodigoErroIa, type OpcoesGeracao, type PromptIa, type RespostaIa, type ValidacaoChave } from '../tipos.ts';
import { extrairJson } from '../saida.ts';
import { campo, comoNumero, comoTexto, pedir, tipoSeguro, type Buscar, type RespostaHttp } from './http.ts';

/** Destino fixo: a chave do usuário só vai à Anthropic (nunca a uma URL de ambiente). */
const BASE = 'https://api.anthropic.com/v1';
const VERSAO_API = '2023-06-01';

/** Modelo da chamada de validação: o mais barato da linha atual (conferido em 2026-10-20). */
export const MODELO_VALIDACAO = 'claude-haiku-5-5';

/** Modelos com reencaminhamento automático em caso de recusa (fallback "default", beta). */
const COM_FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-opus-5']);
const BETA_FALLBACK = 'server-side-fallback-2026-07-01';

/**
 * Modelos que aceitam output_config.effort (geração 4.6 em diante e a linha 5).
 * Haiku 4.5 e anteriores recusam o parâmetro: nesses ele não é enviado.
 */
export function aceitaEsforco(modelo: string): boolean {
  return /^claude-(opus|sonnet|haiku|fable|mythos)-(4-[6-9]|[5-9])(-\d+)?$/.test(modelo);
}

/**
 * Traduz a falha pelo status HTTP e pelo error.type do corpo
 * ({"type":"error","error":{"type","message"}}). A mensagem do provedor só é lida
 * aqui, para reconhecer falta de crédito, e nunca sai do servidor.
 */
export function classificarErroAnthropic(r: RespostaHttp): ErroIa {
  const tipo = tipoSeguro(campo(r.corpo, 'error', 'type'));
  const mensagem = comoTexto(campo(r.corpo, 'error', 'message'));
  let codigo: CodigoErroIa;
  if (r.status === 401) codigo = 'chave_invalida';
  else if (r.status === 402 || (r.status === 400 && /credit balance/i.test(mensagem))) codigo = 'sem_saldo';
  else if (r.status === 403) codigo = 'sem_permissao';
  else if (r.status === 404) codigo = 'modelo_invalido';
  else if (r.status === 413) codigo = 'entrada_grande';
  else if (r.status === 429) codigo = 'cota_provedor';
  else if (r.status >= 500) codigo = 'indisponivel';
  else codigo = 'pedido_recusado';
  return new ErroIa(codigo, { status: r.status, tipo });
}

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic' as const;
  private readonly apiKey: string;
  constructor(apiKey: string, private readonly buscar: Buscar = (u, i) => fetch(u, i)) {
    this.apiKey = apiKey.trim();
  }

  private cabecalhos(extras: Record<string, string> = {}): Record<string, string> {
    return { 'x-api-key': this.apiKey, 'anthropic-version': VERSAO_API, 'content-type': 'application/json', ...extras };
  }

  async generateText(prompt: PromptIa, opcoes: OpcoesGeracao): Promise<RespostaIa> {
    const fallback = COM_FALLBACK.has(opcoes.modelo);
    const corpo = {
      model: opcoes.modelo,
      max_tokens: opcoes.maxTokens,
      system: prompt.sistema,
      messages: [{ role: 'user', content: prompt.usuario }],
      // O raciocínio conta no max_tokens: esforço baixo em tarefas simples evita cortar a resposta.
      ...(opcoes.esforco && aceitaEsforco(opcoes.modelo) ? { output_config: { effort: opcoes.esforco } } : {}),
      ...(fallback ? { fallbacks: 'default' } : {}),
    };
    const r = await pedir(this.buscar, `${BASE}/messages`, {
      method: 'POST',
      headers: this.cabecalhos(fallback ? { 'anthropic-beta': BETA_FALLBACK } : {}),
      body: JSON.stringify(corpo),
    }, TIMEOUT_IA_MS);
    if (r.status !== 200) throw classificarErroAnthropic(r);

    const parada = campo(r.corpo, 'stop_reason');
    if (parada === 'refusal') throw new ErroIa('recusa');
    if (parada === 'max_tokens' && opcoes.formato === 'json') throw new ErroIa('limite_tokens');
    const blocos = campo(r.corpo, 'content');
    const texto = (Array.isArray(blocos) ? blocos : [])
      .filter((b) => campo(b, 'type') === 'text')
      .map((b) => comoTexto(campo(b, 'text')))
      .join('');
    return {
      texto: opcoes.formato === 'json' ? extrairJson(texto) : texto,
      modelo: comoTexto(campo(r.corpo, 'model')) || opcoes.modelo,
      tokensEntrada: comoNumero(campo(r.corpo, 'usage', 'input_tokens')),
      tokensSaida: comoNumero(campo(r.corpo, 'usage', 'output_tokens')),
    };
  }

  /**
   * 1) Chamada mínima a /v1/messages com MODELO_VALIDACAO (1 token de saída, sem
   *    raciocínio): pega chave inválida, falta de crédito, permissão e limite, que a
   *    listagem de modelos não revela. Custo: frações de centavo. Se esse modelo não
   *    existir na conta (404), segue para a listagem.
   * 2) Listagem dos modelos da conta para o seletor.
   */
  async validateApiKey(): Promise<ValidacaoChave> {
    try {
      const teste = await pedir(this.buscar, `${BASE}/messages`, {
        method: 'POST',
        headers: this.cabecalhos(),
        body: JSON.stringify({ model: MODELO_VALIDACAO, max_tokens: 1, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: 'ok' }] }),
      }, TIMEOUT_VALIDACAO_MS, 1);
      if (teste.status !== 200 && teste.status !== 404) throw classificarErroAnthropic(teste);

      const modelos: string[] = [];
      let depois: string | null = null;
      do {
        const url: string = `${BASE}/models?limit=1000${depois ? `&after_id=${encodeURIComponent(depois)}` : ''}`;
        const r = await pedir(this.buscar, url, { method: 'GET', headers: this.cabecalhos() }, TIMEOUT_VALIDACAO_MS, 1);
        if (r.status !== 200) throw classificarErroAnthropic(r);
        const lista = campo(r.corpo, 'data');
        for (const m of Array.isArray(lista) ? lista : []) {
          const id = comoTexto(campo(m, 'id'));
          if (id) modelos.push(id);
        }
        depois = campo(r.corpo, 'has_more') === true ? comoTexto(campo(r.corpo, 'last_id')) || null : null;
      } while (depois && modelos.length < MAX_MODELOS);
      return { valida: true, modelos: modelos.slice(0, MAX_MODELOS) };
    } catch (e) {
      const erro = e instanceof ErroIa ? e : new ErroIa('indisponivel', { status: null, tipo: 'erro_de_rede' });
      return { valida: false, codigo: erro.codigo, diagnostico: erro.diagnostico };
    }
  }
}
