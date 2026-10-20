import { criarAdaptador } from './adaptadores.ts';
import { nomeProvedor, ordenarModelos } from './catalogo.ts';
import { contextoChaveIa, cifrarChave, decifrarChave } from './cifra.ts';
import { restaurar } from './prompt.ts';
import { FUNCIONALIDADES, type IdFuncionalidade } from './funcionalidades/index.ts';
import type { FuncionalidadeIa, LeitorIa, Preparado, SessaoIa, Vinculo } from './funcionalidades/tipos.ts';
import type { Buscar } from './provedores/http.ts';
import { ErroEntrada } from './validacao.ts';
import { ErroIa, MENSAGEM_ERRO_IA, type CodigoErroIa, type DiagnosticoIa, type ProvedorIa } from './tipos.ts';

/**
 * Camada central de uso da IA (servidor). Recebe a sessão já conferida pela Edge
 * Function; se o usuário não tem integração ativa, devolve
 * { ok: false, codigo: "ia_nao_configurada" } (nunca exceção que derrube a tela).
 */

/** Cota por pessoa e por dia, contada a partir de 00:00 de Brasília (LLM-11). A validação de chave não conta. */
export const COTA_DIARIA = 40;
/** Ritmo: chamadas por hora por conta, contando também a validação de chave (RAT-03). */
export const RITMO_POR_HORA = 30;

export type LinhaChave = { provider: ProvedorIa; model_preference: string; api_key_encrypted: string };

export type RegistroUso = {
  provedor: ProvedorIa;
  acao: string;
  sucesso: boolean;
  codigoErro?: CodigoErroIa | null;
  modelo?: string | null;
  duracaoMs?: number;
  tokensEntrada?: number;
  tokensSaida?: number;
};

export type NovaGeracao = {
  funcionalidade: string;
  provedor: ProvedorIa;
  modelo: string;
  vinculo: Vinculo;
  parametros: Preparado['parametros'];
  conteudo: string;
};

/**
 * Acesso ao banco. A implementação (banco.ts) usa a chave de serviço SÓ onde o
 * navegador não pode (ler a coluna cifrada, gravar log e resultado), sempre com o
 * perfil e o estabelecimento da sessão; o resto vai pelo cliente do usuário (RLS).
 */
export interface BancoIa {
  /** Serviço, filtrado pelo perfil da sessão. */
  linhaChave(provedor?: ProvedorIa): Promise<LinhaChave | null>;
  usoDesde(desdeIso: string, contarValidacao: boolean): Promise<number>;
  registrarUso(r: RegistroUso): Promise<void>;
  salvarGeracao(g: NovaGeracao): Promise<{ id: string; created_at: string; modelo: string }>;
  /** Cliente do usuário (RLS). */
  configuracaoSalva(provedor: ProvedorIa): Promise<{ id: string } | null>;
  gravarConfiguracao(provedor: ProvedorIa, campos: { api_key_encrypted: string; model_preference: string }, novaComConsentimento: boolean): Promise<void>;
  marcarChave(provedor: ProvedorIa, status: 'valida' | 'invalida'): Promise<void>;
}

export type Dependencias = {
  sessao: SessaoIa;
  banco: BancoIa;
  leitor: LeitorIa;
  /** Segredo IA_ENCRYPTION_KEY (fora do banco). */
  segredo: string;
  buscar?: Buscar;
  agora?: () => Date;
  /** Logger com filtro de campos (LOG-04): só metadados. */
  log?: (nivel: 'info' | 'warn' | 'error', mensagem: string, contexto: Record<string, unknown>) => void;
};

export type Geracao = {
  id: string;
  funcionalidade: string;
  provider: ProvedorIa;
  nomeProvedor: string;
  modelo: string;
  conteudo: string;
  created_at: string;
};

export type Falha = { ok: false; codigo: CodigoErroIa; mensagem: string; diagnostico?: DiagnosticoIa };
export type ResultadoIa<S = unknown> = Falha | { ok: true; geracao: Geracao; resultado: S };

const falha = (codigo: CodigoErroIa, diagnostico?: DiagnosticoIa): Falha => ({ ok: false, codigo, mensagem: MENSAGEM_ERRO_IA[codigo], ...(diagnostico ? { diagnostico } : {}) });

/** Data de hoje (aaaa-mm-dd) em Brasília. */
export function hojeBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

/** Início do dia em Brasília, em ISO (cota diária). Brasil sem horário de verão desde 2019. */
export function inicioDoDia(agora = new Date()): string {
  return new Date(`${hojeBrasilia(agora)}T00:00:00-03:00`).toISOString();
}

/** Ritmo por hora e cota diária, antes de qualquer chamada paga. */
async function conferirLimites(d: Dependencias, contarCotaDiaria: boolean): Promise<CodigoErroIa | null> {
  const agora = d.agora?.() ?? new Date();
  if ((await d.banco.usoDesde(new Date(agora.getTime() - 3_600_000).toISOString(), true)) >= RITMO_POR_HORA) return 'ritmo';
  if (contarCotaDiaria && (await d.banco.usoDesde(inicioDoDia(agora), false)) >= COTA_DIARIA) return 'cota_diaria';
  return null;
}

async function registrar(d: Dependencias, r: RegistroUso) {
  try {
    await d.banco.registrarUso(r);
  } catch {
    d.log?.('warn', 'Falha ao registrar uso da IA', { acao: r.acao });
  }
  // Só metadados, nunca prompt, resposta ou chave (IAD-08, LOG-04).
  d.log?.('info', 'Uso da IA', { provedor: r.provedor, acao: r.acao, sucesso: r.sucesso, erro: r.codigoErro ?? null, modelo: r.modelo ?? null, duracaoMs: r.duracaoMs });
}

async function marcar(d: Dependencias, provedor: ProvedorIa, status: 'valida' | 'invalida') {
  try {
    await d.banco.marcarChave(provedor, status);
  } catch {
    d.log?.('warn', 'Falha ao marcar status da chave de IA', { provedor });
  }
}

/**
 * Executa uma funcionalidade do registro com o provedor ativo da pessoa.
 * Entrada inválida lança ErroEntrada (400), tratada pela Edge Function.
 */
export async function executarFuncionalidade(d: Dependencias, id: IdFuncionalidade, bruto: unknown): Promise<ResultadoIa> {
  const func = FUNCIONALIDADES[id] as unknown as FuncionalidadeIa<unknown, unknown>;
  const entrada = func.entrada(bruto);

  const linha = await d.banco.linhaChave();
  if (!linha) return falha('ia_nao_configurada');
  let chave: string;
  try {
    chave = await decifrarChave(linha.api_key_encrypted, contextoChaveIa(d.sessao.usuarioId, linha.provider), d.segredo);
  } catch {
    // Segredo trocado ou cifra corrompida: a pessoa precisa colar a chave de novo.
    d.log?.('warn', 'Chave de IA não decifrou', { provedor: linha.provider });
    return falha('chave_invalida');
  }

  const limite = await conferirLimites(d, true);
  if (limite) return falha(limite);

  const agora = d.agora?.() ?? new Date();
  let preparado: Preparado;
  try {
    preparado = await func.preparar({ sessao: d.sessao, leitor: d.leitor, hoje: hojeBrasilia(agora) }, entrada);
  } catch (e) {
    if (e instanceof ErroIa) return falha(e.codigo);
    throw e;
  }

  const base = { provedor: linha.provider, acao: func.id, modelo: linha.model_preference };
  const inicio = Date.now();
  let resultado: unknown;
  let resposta;
  try {
    resposta = await criarAdaptador(linha.provider, chave, d.buscar).generateText(preparado.prompt, {
      modelo: linha.model_preference, maxTokens: func.maxTokens, formato: func.formato, esforco: func.esforco,
    });
    resultado = func.interpretar(restaurar(resposta.texto, preparado.marcadores, func.formato === 'json'));
  } catch (e) {
    const codigo: CodigoErroIa = e instanceof ErroIa ? e.codigo : 'erro_interno';
    if (!(e instanceof ErroIa)) d.log?.('error', 'Falha inesperada na IA', { funcionalidade: func.id, nome: (e as Error)?.name });
    // Só status HTTP e tipo do erro do provedor (nunca a mensagem, que pode trazer parte da chave).
    else if (e.diagnostico) d.log?.('warn', 'Provedor de IA recusou o pedido', { funcionalidade: func.id, provedor: linha.provider, http: e.diagnostico.status, tipo: e.diagnostico.tipo });
    await registrar(d, { ...base, sucesso: false, codigoErro: codigo, duracaoMs: Date.now() - inicio });
    if (codigo === 'chave_invalida') await marcar(d, linha.provider, 'invalida');
    return falha(codigo, e instanceof ErroIa ? e.diagnostico : undefined);
  }

  const conteudo = typeof resultado === 'string' ? resultado : JSON.stringify(resultado);
  let salvo;
  try {
    salvo = await d.banco.salvarGeracao({
      funcionalidade: func.id, provedor: linha.provider, modelo: resposta.modelo || linha.model_preference,
      vinculo: preparado.vinculo, parametros: preparado.parametros, conteudo,
    });
  } catch {
    d.log?.('error', 'Falha ao salvar resultado da IA', { funcionalidade: func.id });
    await registrar(d, { ...base, sucesso: false, codigoErro: 'erro_interno', duracaoMs: Date.now() - inicio });
    return falha('erro_interno');
  }

  await registrar(d, { ...base, modelo: salvo.modelo, sucesso: true, duracaoMs: Date.now() - inicio, tokensEntrada: resposta.tokensEntrada, tokensSaida: resposta.tokensSaida });
  await marcar(d, linha.provider, 'valida');
  return {
    ok: true,
    resultado,
    geracao: { id: salvo.id, funcionalidade: func.id, provider: linha.provider, nomeProvedor: nomeProvedor(linha.provider), modelo: salvo.modelo, conteudo, created_at: salvo.created_at },
  };
}

export type ResultadoValidacao = { ok: true; modelos: string[] } | Falha;

/** Chave salva (decifrada) para o provedor, ou null. */
async function chaveSalva(d: Dependencias, provedor: ProvedorIa): Promise<string | null> {
  const linha = await d.banco.linhaChave(provedor);
  if (!linha) return null;
  try {
    return (await decifrarChave(linha.api_key_encrypted, contextoChaveIa(d.sessao.usuarioId, provedor), d.segredo)).trim();
  } catch {
    return null;
  }
}

/** Confere a chave no provedor e devolve os modelos de texto da conta. Nada é salvo. Sem chave: usa a salva. */
export async function validarChave(d: Dependencias, provedor: ProvedorIa, apiKey?: string): Promise<ResultadoValidacao> {
  const chave = apiKey ?? (await chaveSalva(d, provedor));
  if (!chave) throw new ErroEntrada('Cole a chave de API do provedor.');
  const limite = await conferirLimites(d, false);
  if (limite) return falha(limite);

  const inicio = Date.now();
  const r = await criarAdaptador(provedor, chave, d.buscar).validateApiKey();
  await registrar(d, { provedor, acao: 'validar_chave', sucesso: r.valida, codigoErro: r.valida ? null : r.codigo, duracaoMs: Date.now() - inicio });
  if (!r.valida) return falha(r.codigo, r.diagnostico);
  const modelos = ordenarModelos(provedor, r.modelos);
  if (!modelos.length) return { ok: false, codigo: 'sem_permissao', mensagem: 'A chave é válida, mas não dá acesso a nenhum modelo de texto.' };
  return { ok: true, modelos };
}

/**
 * Valida a chave no provedor, confere o modelo na lista da própria conta, exige o
 * consentimento LGPD na primeira ativação do provedor, cifra e ativa (o banco
 * desativa o provedor anterior: no máximo uma integração ativa).
 */
export async function salvarConfiguracao(
  d: Dependencias,
  e: { provider: ProvedorIa; api_key?: string; modelo: string; consentimento?: boolean },
): Promise<ResultadoValidacao> {
  const existente = await d.banco.configuracaoSalva(e.provider);
  if (!existente && e.consentimento !== true) {
    throw new ErroEntrada('Para ativar, confirme que concorda com o envio dos dados ao provedor de IA.');
  }
  const chave = e.api_key ?? (existente ? await chaveSalva(d, e.provider) : null);
  if (!chave) throw new ErroEntrada('Cole a chave de API do provedor.');

  const v = await validarChave(d, e.provider, chave);
  if (!v.ok) return v;
  if (!v.modelos.includes(e.modelo)) throw new ErroEntrada('Este modelo não está disponível na sua conta do provedor.');

  const cifrada = await cifrarChave(chave, contextoChaveIa(d.sessao.usuarioId, e.provider), d.segredo);
  await d.banco.gravarConfiguracao(e.provider, { api_key_encrypted: cifrada, model_preference: e.modelo }, !existente);
  return v;
}
