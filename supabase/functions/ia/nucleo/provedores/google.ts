import { codigoPorStatus, ErroIa, MAX_MODELOS, TIMEOUT_IA_MS, TIMEOUT_VALIDACAO_MS, type AiProvider, type OpcoesGeracao, type PromptIa, type RespostaIa, type ValidacaoChave } from '../tipos.ts';
import { extrairJson } from '../saida.ts';
import { campo, comoNumero, comoTexto, pedir, tipoSeguro, type Buscar, type RespostaHttp } from './http.ts';

/**
 * Gemini API (Google AI Studio), nunca Vertex. Destino fixo e chave no cabeçalho
 * x-goog-api-key (nunca na URL, que pode aparecer em log).
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function classificarErroGoogle(r: RespostaHttp): ErroIa {
  const tipo = tipoSeguro(campo(r.corpo, 'error', 'status'));
  const mensagem = comoTexto(campo(r.corpo, 'error', 'message'));
  // O Gemini responde 400 (API_KEY_INVALID) para chave inexistente.
  if (r.status === 400 && /api[_ ]?key/i.test(mensagem)) return new ErroIa('chave_invalida', { status: r.status, tipo });
  return new ErroIa(codigoPorStatus(r.status), { status: r.status, tipo });
}

/** Nome de modelo só com caracteres seguros para o caminho da URL. */
const modeloNaUrl = (m: string) => {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(m)) throw new ErroIa('modelo_invalido');
  return m;
};

export class GoogleProvider implements AiProvider {
  readonly id = 'google' as const;
  private readonly apiKey: string;
  constructor(apiKey: string, private readonly buscar: Buscar = (u, i) => fetch(u, i)) {
    this.apiKey = apiKey.trim();
  }

  private cabecalhos(): Record<string, string> {
    return { 'x-goog-api-key': this.apiKey, 'content-type': 'application/json' };
  }

  async generateText(prompt: PromptIa, opcoes: OpcoesGeracao): Promise<RespostaIa> {
    const r = await pedir(this.buscar, `${BASE}/models/${modeloNaUrl(opcoes.modelo)}:generateContent`, {
      method: 'POST',
      headers: this.cabecalhos(),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.sistema }] },
        contents: [{ role: 'user', parts: [{ text: prompt.usuario }] }],
        generationConfig: { maxOutputTokens: opcoes.maxTokens, ...(opcoes.formato === 'json' ? { responseMimeType: 'application/json' } : {}) },
      }),
    }, TIMEOUT_IA_MS);
    if (r.status !== 200) throw classificarErroGoogle(r);

    const motivo = campo(r.corpo, 'candidates', 0, 'finishReason');
    if (campo(r.corpo, 'promptFeedback', 'blockReason') || motivo === 'SAFETY' || motivo === 'PROHIBITED_CONTENT') throw new ErroIa('recusa');
    if (motivo === 'MAX_TOKENS' && opcoes.formato === 'json') throw new ErroIa('limite_tokens');
    const partes = campo(r.corpo, 'candidates', 0, 'content', 'parts');
    const texto = (Array.isArray(partes) ? partes : [])
      .filter((p) => campo(p, 'thought') !== true)
      .map((p) => comoTexto(campo(p, 'text')))
      .join('');
    return {
      texto: opcoes.formato === 'json' ? extrairJson(texto) : texto,
      modelo: comoTexto(campo(r.corpo, 'modelVersion')) || opcoes.modelo,
      tokensEntrada: comoNumero(campo(r.corpo, 'usageMetadata', 'promptTokenCount')),
      tokensSaida: comoNumero(campo(r.corpo, 'usageMetadata', 'candidatesTokenCount')),
    };
  }

  async validateApiKey(): Promise<ValidacaoChave> {
    try {
      const modelos: string[] = [];
      let pagina: string | null = null;
      do {
        const url: string = `${BASE}/models?pageSize=1000${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''}`;
        const r = await pedir(this.buscar, url, { method: 'GET', headers: this.cabecalhos() }, TIMEOUT_VALIDACAO_MS, 1);
        if (r.status !== 200) throw classificarErroGoogle(r);
        const lista = campo(r.corpo, 'models');
        for (const m of Array.isArray(lista) ? lista : []) {
          const metodos = campo(m, 'supportedGenerationMethods');
          const nome = comoTexto(campo(m, 'name')).replace(/^models\//, '');
          if (nome && Array.isArray(metodos) && metodos.includes('generateContent')) modelos.push(nome);
        }
        pagina = comoTexto(campo(r.corpo, 'nextPageToken')) || null;
      } while (pagina && modelos.length < MAX_MODELOS);
      return { valida: true, modelos: modelos.slice(0, MAX_MODELOS) };
    } catch (e) {
      const erro = e instanceof ErroIa ? e : new ErroIa('indisponivel', { status: null, tipo: 'erro_de_rede' });
      return { valida: false, codigo: erro.codigo, diagnostico: erro.diagnostico };
    }
  }
}
