// Integração opcional com IA (docs/especificacoes/integracao-ia.md).
// Configurações, resultados e uso: lidos e alterados direto no banco, com RLS (cada
// pessoa só vê as próprias linhas; a coluna da chave cifrada nem é legível pelo
// navegador). Validar a chave, salvar e gerar: Edge Function "ia", a única que
// conhece o segredo de cifra e fala com o provedor.
import { supabase } from '../../lib/supabase';
import { ErroPublico, mensagemDeErro } from '../../lib/seguranca/erros';
import { PROVEDORES_IA, type ProvedorIa } from '../../../supabase/functions/ia/nucleo/tipos.ts';

export type LinhaConfiguracao = {
  provider: ProvedorIa;
  model_preference: string;
  is_active: boolean;
  status_chave: 'valida' | 'invalida';
  validada_em: string | null;
  consentimento_em: string;
};

export type GeracaoIa = {
  id: string;
  funcionalidade: string;
  provider: ProvedorIa;
  modelo: string;
  conteudo: string;
  conteudo_editado: string | null;
  revisado_em: string | null;
  created_at: string;
};

/** Diagnóstico seguro do provedor (status HTTP e tipo do erro, nunca a mensagem dele). */
export type DiagnosticoIa = { status: number | null; tipo: string };

export type FalhaIa = { ok: false; codigo: string; error: string; diagnostico?: DiagnosticoIa };
export type RespostaGeracao<R> = { ok: true; geracao: GeracaoIa; resultado: R } | FalhaIa;

/** Discrimina a falha (o tsconfig do app não é strict, então r.ok não estreita o tipo sozinho). */
export const falhou = (r: { ok: boolean }): r is FalhaIa => r.ok === false;

export const iaKeys = { configuracoes: (perfilId: string | undefined) => ['ia', 'configuracoes', perfilId ?? ''] as const };

const COLUNAS_CONFIG = 'provider, model_preference, is_active, status_chave, validada_em, consentimento_em';
const COLUNAS_GERACAO = 'id, funcionalidade, provider, modelo, conteudo, conteudo_editado, revisado_em, created_at';

export async function listarConfiguracoes(): Promise<LinhaConfiguracao[]> {
  const { data, error } = await supabase.from('user_ai_settings').select(COLUNAS_CONFIG).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LinhaConfiguracao[];
}

/** "Trocar de provedor": desativa a atual; a chave fica guardada para reativar sem colar de novo. */
export async function desativarAtual(): Promise<void> {
  const { error } = await supabase.from('user_ai_settings').update({ is_active: false }).eq('is_active', true);
  if (error) throw new ErroPublico(mensagemDeErro(error, 'Não foi possível desativar a integração.', 'ia.trocar'));
}

/** "Desativar totalmente": apaga as chaves salvas de todos os provedores (só as da própria pessoa, RLS). */
export async function apagarTudo(): Promise<void> {
  const { error } = await supabase.from('user_ai_settings').delete().in('provider', [...PROVEDORES_IA]);
  if (error) throw new ErroPublico(mensagemDeErro(error, 'Não foi possível apagar as chaves.', 'ia.apagar'));
}

const ehFalha = (b: unknown): b is FalhaIa =>
  !!b && typeof b === 'object' && (b as { ok?: unknown }).ok === false && typeof (b as { error?: unknown }).error === 'string';

/** Chama a Edge Function "ia". As mensagens dela já são seguras para a tela; erro de rede vira texto amigável. */
async function chamar<T>(corpo: Record<string, unknown>): Promise<({ ok: true } & T) | FalhaIa> {
  const { data, error } = await supabase.functions.invoke('ia', { body: corpo });
  if (!error) {
    if (ehFalha(data)) return data;
    return { ok: true, ...(data as T) };
  }
  const resposta = (error as { context?: Response }).context;
  try {
    if (resposta && typeof resposta.json === 'function') {
      const j = (await resposta.json()) as unknown;
      if (ehFalha(j)) {
        const id = (j as { id?: unknown }).id;
        return typeof id === 'string' && /^[A-Z0-9]{8}$/.test(id) ? { ...j, error: `${j.error} (código ${id})` } : j;
      }
    }
  } catch { /* corpo não é JSON: cai na mensagem genérica */ }
  return { ok: false, codigo: 'erro_interno', error: mensagemDeErro(error, 'Não foi possível falar com a IA.', 'ia.funcao') };
}

export function validarChave(provider: ProvedorIa, apiKey?: string) {
  return chamar<{ modelos: string[] }>({ acao: 'validar_chave', provider, ...(apiKey ? { api_key: apiKey } : {}) });
}

export function salvarConfiguracao(e: { provider: ProvedorIa; modelo: string; api_key?: string; consentimento?: boolean }) {
  return chamar<Record<string, never>>({ acao: 'salvar_configuracao', ...e });
}

export async function gerar<R>(funcionalidade: string, entrada: Record<string, unknown>): Promise<RespostaGeracao<R>> {
  return chamar<{ geracao: GeracaoIa; resultado: R }>({ acao: 'gerar', funcionalidade, entrada }) as Promise<RespostaGeracao<R>>;
}

/** Último resultado salvo para o vínculo (a tela mostra mesmo depois de recarregar). */
export async function ultimaGeracao(funcionalidade: string, vinculo: { lead_id?: string; client_id?: string }): Promise<GeracaoIa | null> {
  let q = supabase.from('ai_generations').select(COLUNAS_GERACAO).eq('funcionalidade', funcionalidade);
  if (vinculo.lead_id) q = q.eq('lead_id', vinculo.lead_id);
  if (vinculo.client_id) q = q.eq('client_id', vinculo.client_id);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as GeracaoIa | null) ?? null;
}

/** Revisão antes do uso: só o texto revisado e a marca de revisão (colunas liberadas na migração). */
export async function editarGeracao(id: string, e: { conteudo_editado?: string | null; revisado?: boolean }): Promise<GeracaoIa> {
  const campos: Record<string, string | null> = {};
  if (e.conteudo_editado !== undefined) campos.conteudo_editado = e.conteudo_editado;
  if (e.revisado !== undefined) campos.revisado_em = e.revisado ? new Date().toISOString() : null;
  const { data, error } = await supabase.from('ai_generations').update(campos).eq('id', id).select(COLUNAS_GERACAO).maybeSingle();
  if (error) throw new ErroPublico(mensagemDeErro(error, 'Não foi possível salvar.', 'ia.editar'));
  if (!data) throw new ErroPublico('Resultado não encontrado.');
  return data as GeracaoIa;
}

export async function excluirGeracao(id: string): Promise<void> {
  const { error } = await supabase.from('ai_generations').delete().eq('id', id);
  if (error) throw new ErroPublico(mensagemDeErro(error, 'Não foi possível excluir.', 'ia.excluir'));
}

/** Resultado JSON salvo (o conteúdo vem da Edge Function, já validado por schema); falha = null. */
export function lerResultado<R>(g: GeracaoIa | null): R | null {
  if (!g) return null;
  try {
    return JSON.parse(g.conteudo) as R;
  } catch {
    return null;
  }
}
