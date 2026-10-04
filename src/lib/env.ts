/**
 * Único ponto do código que lê variáveis de ambiente (SEG-01).
 *
 * O app é uma SPA: tudo o que está aqui vai para o navegador, então só entram
 * variáveis PÚBLICAS, com prefixo VITE_ (SEG-03). Segredo (service role, chave
 * de criptografia, token) nunca entra neste projeto de front.
 *
 * Se faltar variável ou o valor for inválido, o build falha (vite.config.ts chama
 * validarEnv) e, em tempo de execução, o app não sobe. A mensagem lista só os
 * NOMES das variáveis, nunca os valores.
 */

export type Env = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_PUBLISHABLE_KEY: string;
};

type Fonte = Record<string, string | boolean | undefined>;

const ehUrlHttps = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

/** Valida e devolve a configuração. Lança erro listando só os NOMES das variáveis inválidas. */
export function validarEnv(fonte: Fonte): Env {
  const problemas: string[] = [];
  const texto = (nome: keyof Env) => {
    const v = fonte[nome];
    return typeof v === 'string' ? v.trim() : '';
  };

  const url = texto('VITE_SUPABASE_URL');
  if (!url) problemas.push('VITE_SUPABASE_URL: obrigatória');
  else if (!ehUrlHttps(url)) problemas.push('VITE_SUPABASE_URL: precisa ser uma URL https');

  const chave = texto('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!chave) problemas.push('VITE_SUPABASE_PUBLISHABLE_KEY: obrigatória');
  else if (chave.length < 20) problemas.push('VITE_SUPABASE_PUBLISHABLE_KEY: valor curto demais');
  // A service role ignora o RLS: nunca pode ir para o navegador (AUZ-05).
  else if (/service_role|^sb_secret_/i.test(chave) || papelDoJwt(chave) === 'service_role') {
    problemas.push('VITE_SUPABASE_PUBLISHABLE_KEY: use a chave pública (publishable/anon), nunca a service role');
  }

  if (problemas.length) {
    throw new Error(`Configuração inválida (SEG-01). Ajuste as variáveis de ambiente:\n- ${problemas.join('\n- ')}`);
  }
  return { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: chave };
}

/** Lê o campo "role" de uma chave no formato JWT antigo (anon/service_role), só para recusar a errada. */
function papelDoJwt(chave: string): string | null {
  const partes = chave.split('.');
  if (partes.length !== 3) return null;
  try {
    const json = atob(partes[1].replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

let cache: Env | null = null;

export function env(): Env {
  if (!cache) cache = validarEnv(import.meta.env as Fonte);
  return cache;
}
