import { AnthropicProvider } from './provedores/anthropic.ts';
import { OpenAiProvider } from './provedores/openai.ts';
import { GoogleProvider } from './provedores/google.ts';
import type { Buscar } from './provedores/http.ts';
import type { AiProvider, ProvedorIa } from './tipos.ts';

/**
 * Único ponto que liga o nome do provedor salvo em user_ai_settings ao adaptador.
 * Provedor novo: uma linha aqui.
 */
export const ADAPTADORES: Record<ProvedorIa, (apiKey: string, buscar?: Buscar) => AiProvider> = {
  anthropic: (k, b) => new AnthropicProvider(k, b),
  openai: (k, b) => new OpenAiProvider(k, b),
  google: (k, b) => new GoogleProvider(k, b),
};

export function criarAdaptador(provedor: ProvedorIa, apiKey: string, buscar?: Buscar): AiProvider {
  return ADAPTADORES[provedor](apiKey, buscar);
}
