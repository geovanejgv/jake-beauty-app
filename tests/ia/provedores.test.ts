import { describe, expect, it } from 'vitest';
import { AnthropicProvider, aceitaEsforco } from '../../supabase/functions/ia/nucleo/provedores/anthropic.ts';
import { OpenAiProvider } from '../../supabase/functions/ia/nucleo/provedores/openai.ts';
import { GoogleProvider } from '../../supabase/functions/ia/nucleo/provedores/google.ts';
import type { Buscar } from '../../supabase/functions/ia/nucleo/provedores/http.ts';
import { ErroIa } from '../../supabase/functions/ia/nucleo/tipos.ts';

const CHAVE = 'sk-chave-ficticia-de-teste-0123456789';
const SEGREDO_NA_MENSAGEM = `invalid x-api-key ${CHAVE}`;

type Chamada = { url: string; init: RequestInit };
function falso(respostas: { status: number; corpo: unknown }[] | ((url: string) => { status: number; corpo: unknown })) {
  const chamadas: Chamada[] = [];
  let i = 0;
  const buscar: Buscar = async (url, init) => {
    chamadas.push({ url, init });
    const r = typeof respostas === 'function' ? respostas(url) : respostas[Math.min(i++, respostas.length - 1)];
    return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
  return { buscar, chamadas };
}
const prompt = { sistema: 'regras', usuario: '<dados>x</dados>' };

async function erroDe(p: Promise<unknown>): Promise<ErroIa> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroIa) return e;
    throw e;
  }
  throw new Error('esperava erro');
}

describe('Anthropic', () => {
  const ok = { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '```json\n{"a":1}\n```' }], model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } };

  it('destino fixo, cabeçalhos, esforço e JSON extraído', async () => {
    const f = falso([{ status: 200, corpo: ok }]);
    const r = await new AnthropicProvider(CHAVE, f.buscar).generateText(prompt, { modelo: 'claude-haiku-5-5', maxTokens: 100, formato: 'json', esforco: 'low' });
    expect(r).toEqual({ texto: '{"a":1}', modelo: 'claude-haiku-5-5', tokensEntrada: 10, tokensSaida: 5 });
    expect(f.chamadas[0].url).toBe('https://api.anthropic.com/v1/messages');
    const h = f.chamadas[0].init.headers as Record<string, string>;
    expect(h['x-api-key']).toBe(CHAVE);
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(f.chamadas[0].init.redirect).toBe('error');
    expect(JSON.parse(String(f.chamadas[0].init.body)).output_config).toEqual({ effort: 'low' });
  });
  it('esforço só nos modelos que aceitam; fallback nos que têm', async () => {
    expect(aceitaEsforco('claude-haiku-4-5')).toBe(false);
    expect(aceitaEsforco('claude-opus-4-6')).toBe(true);
    expect(aceitaEsforco('claude-sonnet-5-5')).toBe(true);
    const f = falso([{ status: 200, corpo: { ...ok, content: [{ type: 'text', text: 'oi' }] } }]);
    await new AnthropicProvider(CHAVE, f.buscar).generateText(prompt, { modelo: 'claude-opus-5-5', maxTokens: 100, formato: 'texto', esforco: 'low' });
    expect(JSON.parse(String(f.chamadas[0].init.body)).fallbacks).toBe('default');
    expect((f.chamadas[0].init.headers as Record<string, string>)['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    const g = falso([{ status: 200, corpo: ok }]);
    await new AnthropicProvider(CHAVE, g.buscar).generateText(prompt, { modelo: 'claude-haiku-4-5', maxTokens: 100, formato: 'json', esforco: 'low' });
    const corpo = JSON.parse(String(g.chamadas[0].init.body));
    expect(corpo.output_config).toBeUndefined();
    expect(corpo.fallbacks).toBeUndefined();
  });
  it('tradução de status; mensagem do provedor nunca sai', async () => {
    const casos: [number, unknown, string][] = [
      [401, { error: { type: 'authentication_error', message: SEGREDO_NA_MENSAGEM } }, 'chave_invalida'],
      [400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } }, 'sem_saldo'],
      [403, { error: { type: 'permission_error' } }, 'sem_permissao'],
      [404, { error: { type: 'not_found_error' } }, 'modelo_invalido'],
      [429, { error: { type: 'rate_limit_error' } }, 'cota_provedor'],
      [529, { error: { type: 'overloaded_error' } }, 'indisponivel'],
      [400, { error: { type: 'invalid_request_error', message: 'outro' } }, 'pedido_recusado'],
    ];
    for (const [status, corpo, codigo] of casos) {
      const e = await erroDe(new AnthropicProvider(CHAVE, falso([{ status, corpo }]).buscar).generateText(prompt, { modelo: 'claude-haiku-5-5', maxTokens: 10, formato: 'texto' }));
      expect(e.codigo, String(status)).toBe(codigo);
      expect(JSON.stringify({ m: e.message, d: e.diagnostico })).not.toContain(CHAVE);
    }
  });
  it('recusa e limite de tokens em JSON', async () => {
    const recusa = await erroDe(new AnthropicProvider(CHAVE, falso([{ status: 200, corpo: { ...ok, stop_reason: 'refusal' } }]).buscar).generateText(prompt, { modelo: 'claude-haiku-5-5', maxTokens: 10, formato: 'texto' }));
    expect(recusa.codigo).toBe('recusa');
    const corte = await erroDe(new AnthropicProvider(CHAVE, falso([{ status: 200, corpo: { ...ok, stop_reason: 'max_tokens' } }]).buscar).generateText(prompt, { modelo: 'claude-haiku-5-5', maxTokens: 10, formato: 'json' }));
    expect(corte.codigo).toBe('limite_tokens');
  });
  it('validação: chamada mínima e lista paginada de modelos', async () => {
    const f = falso((url) => url.endsWith('/messages')
      ? { status: 200, corpo: ok }
      : url.includes('after_id') ? { status: 200, corpo: { data: [{ id: 'claude-opus-5-5' }], has_more: false } } : { status: 200, corpo: { data: [{ id: 'claude-haiku-5-5' }], has_more: true, last_id: 'claude-haiku-5-5' } });
    const r = await new AnthropicProvider(CHAVE, f.buscar).validateApiKey();
    expect(r).toEqual({ valida: true, modelos: ['claude-haiku-5-5', 'claude-opus-5-5'] });
    expect(JSON.parse(String(f.chamadas[0].init.body))).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 1 });
    const invalida = await new AnthropicProvider(CHAVE, falso([{ status: 401, corpo: { error: { type: 'authentication_error' } } }]).buscar).validateApiKey();
    expect(invalida).toEqual({ valida: false, codigo: 'chave_invalida', diagnostico: { status: 401, tipo: 'authentication_error' } });
  });
  it('falha de rede vira indisponível, sem detalhe', async () => {
    const buscar: Buscar = async () => { throw new TypeError(`fetch failed ${CHAVE}`); };
    const e = await erroDe(new AnthropicProvider(CHAVE, buscar).generateText(prompt, { modelo: 'claude-haiku-5-5', maxTokens: 10, formato: 'texto' }));
    expect(e.codigo).toBe('indisponivel');
    expect(e.diagnostico).toEqual({ status: null, tipo: 'erro_de_rede' });
  });
});

describe('OpenAI', () => {
  it('destino fixo, Bearer, formato JSON e tradução', async () => {
    const f = falso([{ status: 200, corpo: { model: 'gpt-6-luna', choices: [{ finish_reason: 'stop', message: { content: '{"a":1}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } } }]);
    const r = await new OpenAiProvider(CHAVE, f.buscar).generateText(prompt, { modelo: 'gpt-6-luna', maxTokens: 50, formato: 'json' });
    expect(r.texto).toBe('{"a":1}');
    expect(f.chamadas[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect((f.chamadas[0].init.headers as Record<string, string>).authorization).toBe(`Bearer ${CHAVE}`);
    expect(JSON.parse(String(f.chamadas[0].init.body)).response_format).toEqual({ type: 'json_object' });
    for (const [status, corpo, codigo] of [
      [401, { error: { code: 'invalid_api_key', message: SEGREDO_NA_MENSAGEM } }, 'chave_invalida'],
      [429, { error: { code: 'insufficient_quota' } }, 'sem_saldo'],
      [429, { error: { code: 'rate_limit_exceeded' } }, 'cota_provedor'],
      [404, { error: { code: 'model_not_found' } }, 'modelo_invalido'],
    ] as [number, unknown, string][]) {
      const e = await erroDe(new OpenAiProvider(CHAVE, falso([{ status, corpo }]).buscar).generateText(prompt, { modelo: 'gpt-6-luna', maxTokens: 50, formato: 'texto' }));
      expect(e.codigo).toBe(codigo);
      expect(JSON.stringify(e.diagnostico)).not.toContain(CHAVE);
    }
  });
  it('recusa e corte em JSON', async () => {
    const recusa = await erroDe(new OpenAiProvider(CHAVE, falso([{ status: 200, corpo: { choices: [{ finish_reason: 'stop', message: { refusal: 'não' } }] } }]).buscar).generateText(prompt, { modelo: 'gpt-6-luna', maxTokens: 50, formato: 'texto' }));
    expect(recusa.codigo).toBe('recusa');
    const corte = await erroDe(new OpenAiProvider(CHAVE, falso([{ status: 200, corpo: { choices: [{ finish_reason: 'length', message: { content: '{' } }] } }]).buscar).generateText(prompt, { modelo: 'gpt-6-luna', maxTokens: 50, formato: 'json' }));
    expect(corte.codigo).toBe('limite_tokens');
  });
});

describe('Google', () => {
  it('chave no cabeçalho (nunca na URL), JSON e validação paginada', async () => {
    const f = falso([{ status: 200, corpo: { modelVersion: 'gemini-3.8-flash', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'pensando', thought: true }, { text: '{"a":1}' }] } }] } }]);
    const r = await new GoogleProvider(CHAVE, f.buscar).generateText(prompt, { modelo: 'gemini-3.8-flash', maxTokens: 50, formato: 'json' });
    expect(r.texto).toBe('{"a":1}');
    expect(f.chamadas[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(f.chamadas[0].url).not.toContain(CHAVE);
    expect((f.chamadas[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe(CHAVE);
    const v = falso((url) => url.includes('pageToken')
      ? { status: 200, corpo: { models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }] } }
      : { status: 200, corpo: { models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/text-embedding', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'p2' } });
    expect(await new GoogleProvider(CHAVE, v.buscar).validateApiKey()).toEqual({ valida: true, modelos: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'] });
  });
  it('400 de chave = chave_invalida; modelo com "/" recusado antes da chamada', async () => {
    const e = await erroDe(new GoogleProvider(CHAVE, falso([{ status: 400, corpo: { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid' } } }]).buscar).generateText(prompt, { modelo: 'gemini-3.8-flash', maxTokens: 50, formato: 'texto' }));
    expect(e.codigo).toBe('chave_invalida');
    const f = falso([{ status: 200, corpo: {} }]);
    const m = await erroDe(new GoogleProvider(CHAVE, f.buscar).generateText(prompt, { modelo: '../outro', maxTokens: 50, formato: 'texto' }));
    expect(m.codigo).toBe('modelo_invalido');
    expect(f.chamadas).toHaveLength(0);
  });
});
