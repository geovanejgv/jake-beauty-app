/**
 * Logger único da aplicação (LOG-04). Mascara campos sensíveis em qualquer
 * profundidade antes de escrever. Proibido usar console.* fora deste módulo
 * (tests/seguranca/varreduras.test.ts confere).
 */

const CHAVES_SENSIVEIS =
  /pass(word)?|senha|token|secret|segredo|cookie|authorization|api[-_]?key|apikey|chave|service[-_]?role|cpf|cnpj|^rg$|e-?mail|phone|telefone|whatsapp|contato|endereco|address|card|cart(a|ã)o|payload|texto|conteudo|body|corpo/i;

const MAX_PROFUNDIDADE = 6;

export function mascarar(valor: unknown, profundidade = 0): unknown {
  if (valor === null || valor === undefined) return valor;
  if (profundidade > MAX_PROFUNDIDADE) return '[profundo]';
  if (valor instanceof Error) {
    return { nome: valor.name, mensagem: mascarar(valor.message, profundidade + 1), stack: valor.stack };
  }
  if (Array.isArray(valor)) return valor.map((v) => mascarar(v, profundidade + 1));
  if (typeof valor === 'object') {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      saida[k] = CHAVES_SENSIVEIS.test(k) ? '[mascarado]' : mascarar(v, profundidade + 1);
    }
    return saida;
  }
  if (typeof valor === 'string') {
    // Tokens JWT, Bearer e chaves do Supabase soltos em mensagens
    return valor
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]')
      .replace(/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [mascarado]')
      .replace(/sb_(secret|publishable)_[\w-]+/g, '[chave]')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
  }
  return valor;
}

type Nivel = 'debug' | 'info' | 'warn' | 'error';

function escrever(nivel: Nivel, mensagem: string, contexto?: Record<string, unknown>) {
  if (nivel === 'debug' && import.meta.env.PROD) return;
  const linha = JSON.stringify({
    nivel,
    mensagem: mascarar(mensagem),
    momento: new Date().toISOString(),
    ...(contexto ? { contexto: mascarar(contexto) } : {}),
  });
  (nivel === 'error' ? console.error : nivel === 'warn' ? console.warn : console.log)(linha);
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => escrever('debug', m, c),
  info: (m: string, c?: Record<string, unknown>) => escrever('info', m, c),
  warn: (m: string, c?: Record<string, unknown>) => escrever('warn', m, c),
  error: (m: string, c?: Record<string, unknown>) => escrever('error', m, c),
};
