/**
 * Cifra das chaves de API dos provedores (CRI-04, CRI-05, CRI-06), só no servidor
 * (Edge Function). Web Crypto padrão (Deno e Node têm a mesma API):
 *
 * - AES-256-GCM, IV aleatório de 12 bytes por cifra e tag de 16 bytes;
 * - chave de 256 bits derivada por HKDF-SHA256 do segredo IA_ENCRYPTION_KEY (fora
 *   do banco e do repositório), com sal fixo e rótulo próprio;
 * - contexto (usuário + provedor) como dado autenticado (AAD): a cifra copiada
 *   para a linha de outra pessoa não abre.
 *
 * Formato gravado: v1.<iv>.<tag>.<cifra>, cada parte em base64url; o CHECK do
 * banco recusa texto puro. Trocar o segredo invalida as chaves salvas (a pessoa
 * cola de novo).
 */

const VERSAO = 'v1';
const ROTULO = 'controla-miga/user_ai_settings/api_key/v1';
const SAL = new TextEncoder().encode('controla-miga:ia:hkdf-sal:v1');
const TAMANHO_MINIMO_SEGREDO = 32;

const texto = new TextEncoder();

function paraBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('base64url inválido');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const saida = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) saida[i] = bin.charCodeAt(i);
  return saida;
}

async function chaveDerivada(segredo: string): Promise<CryptoKey> {
  if (typeof segredo !== 'string' || segredo.length < TAMANHO_MINIMO_SEGREDO) {
    throw new Error('Segredo de cifra ausente ou curto.');
  }
  const base = await crypto.subtle.importKey('raw', texto.encode(segredo), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: SAL, info: texto.encode(ROTULO) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function cifrarChave(apiKey: string, contexto: string, segredo: string): Promise<string> {
  if (!apiKey) throw new Error('Chave vazia.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const saida = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: texto.encode(contexto), tagLength: 128 }, await chaveDerivada(segredo), texto.encode(apiKey)),
  );
  // Web Crypto devolve cifra || tag; gravamos separados (formato v1).
  const dados = saida.slice(0, saida.length - 16);
  const tag = saida.slice(saida.length - 16);
  return [VERSAO, paraBase64Url(iv), paraBase64Url(tag), paraBase64Url(dados)].join('.');
}

/** Lança erro genérico (sem detalhe) se o formato, o contexto, o segredo ou a tag não conferirem. */
export async function decifrarChave(cifrado: string, contexto: string, segredo: string): Promise<string> {
  const partes = cifrado.split('.');
  if (partes.length !== 4 || partes[0] !== VERSAO) throw new Error('Cifra em formato inválido.');
  try {
    const iv = deBase64Url(partes[1]);
    const tag = deBase64Url(partes[2]);
    const dados = deBase64Url(partes[3]);
    const junto = new Uint8Array(dados.length + tag.length);
    junto.set(dados);
    junto.set(tag, dados.length);
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: texto.encode(contexto), tagLength: 128 }, await chaveDerivada(segredo), junto);
    return new TextDecoder().decode(claro);
  } catch {
    throw new Error('Não foi possível decifrar a chave.');
  }
}

/** Contexto (AAD) da chave de IA: amarra a cifra ao perfil e ao provedor. */
export function contextoChaveIa(userId: string, provedor: string): string {
  return `user_ai_settings:${userId}:${provedor}`;
}
