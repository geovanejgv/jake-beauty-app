import { codigoPorStatus, ErroIa, MAX_MODELOS, TIMEOUT_IA_MS, TIMEOUT_VALIDACAO_MS, type AiProvider, type OpcoesGeracao, type PromptIa, type RespostaIa, type ValidacaoChave } from '../tipos.ts';
import { extrairJson } from '../saida.ts';
import { campo, comoNumero, comoTexto, pedir, tipoSeguro, type Buscar, type RespostaHttp } from './http.ts';

/** Destino fixo: a chave do usuário só vai à OpenAI (sem organização ou projeto do ambiente). */
const BASE = 'https://api.openai.com/v1';

/** Status + error.code/type; "insufficient_quota" (429) é falta de crédito, não limite por minuto. */
export function classificarErroOpenAi(r: RespostaHttp): ErroIa {
  const codigoProvedor = campo(r.corpo, 'error', 'code');
  const tipo = tipoSeguro(codigoProvedor ?? campo(r.corpo, 'error', 'type'));
  if (r.status === 429 && codigoProvedor === 'insufficient_quota') return new ErroIa('sem_saldo', { status: r.status, tipo });
  if (r.status === 404 || codigoProvedor === 'model_not_found') return new ErroIa('modelo_invalido', { status: r.status, tipo });
  return new ErroIa(codigoPorStatus(r.status), { status: r.status, tipo });
}

export class OpenAiProvider implements AiProvider {
  readonly id = 'openai' as const;
  private readonly apiKey: string;
  constructor(apiKey: string, private readonly buscar: Buscar = (u, i) => fetch(u, i)) {
    this.apiKey = apiKey.trim();
  }

  private cabecalhos(): Record<string, string> {
    return { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' };
  }

  async generateText(prompt: PromptIa, opcoes: OpcoesGeracao): Promise<RespostaIa> {
    const r = await pedir(this.buscar, `${BASE}/chat/completions`, {
      method: 'POST',
      headers: this.cabecalhos(),
      body: JSON.stringify({
        model: opcoes.modelo,
        max_completion_tokens: opcoes.maxTokens,
        messages: [
          { role: 'developer', content: prompt.sistema },
          { role: 'user', content: prompt.usuario },
        ],
        ...(opcoes.formato === 'json' ? { response_format: { type: 'json_object' } } : {}),
      }),
    }, TIMEOUT_IA_MS);
    if (r.status !== 200) throw classificarErroOpenAi(r);

    const escolha = campo(r.corpo, 'choices', 0);
    const fim = campo(escolha, 'finish_reason');
    if (!escolha || campo(escolha, 'message', 'refusal') || fim === 'content_filter') throw new ErroIa('recusa');
    if (fim === 'length' && opcoes.formato === 'json') throw new ErroIa('limite_tokens');
    const texto = comoTexto(campo(escolha, 'message', 'content'));
    return {
      texto: opcoes.formato === 'json' ? extrairJson(texto) : texto,
      modelo: comoTexto(campo(r.corpo, 'model')) || opcoes.modelo,
      tokensEntrada: comoNumero(campo(r.corpo, 'usage', 'prompt_tokens')),
      tokensSaida: comoNumero(campo(r.corpo, 'usage', 'completion_tokens')),
    };
  }

  /** A listagem de modelos já confere a chave (401 = inválida). */
  async validateApiKey(): Promise<ValidacaoChave> {
    try {
      const r = await pedir(this.buscar, `${BASE}/models`, { method: 'GET', headers: this.cabecalhos() }, TIMEOUT_VALIDACAO_MS, 1);
      if (r.status !== 200) throw classificarErroOpenAi(r);
      const lista = campo(r.corpo, 'data');
      const modelos = (Array.isArray(lista) ? lista : []).map((m) => comoTexto(campo(m, 'id'))).filter(Boolean).slice(0, MAX_MODELOS);
      return { valida: true, modelos };
    } catch (e) {
      const erro = e instanceof ErroIa ? e : new ErroIa('indisponivel', { status: null, tipo: 'erro_de_rede' });
      return { valida: false, codigo: erro.codigo, diagnostico: erro.diagnostico };
    }
  }
}
