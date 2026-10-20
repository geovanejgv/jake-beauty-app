// Edge Function (Supabase): integração opcional com IA, por pessoa e com vários
// provedores (Anthropic, OpenAI e Google). Especificação adaptada:
// docs/especificacoes/integracao-ia.md.
//
// Por que existe: a chave de API que cada pessoa cola é cifrada com um segredo que
// NUNCA vai para o navegador (IA_ENCRYPTION_KEY, variável do próprio ambiente da
// função), e a chamada ao provedor precisa dessa chave decifrada. Configurações,
// resultados e uso são lidos pela tela direto no banco, com RLS.
//
// Segurança:
// - toda chamada exige sessão válida (o gateway confere o JWT) e a função lê no
//   banco o perfil ativo e o estabelecimento de quem chama (AUZ-01, AUZ-03, AUZ-06);
// - CORS só para as origens do portal (CAB-03);
// - entrada validada campo a campo, objetos fechados, corpo até 20 KB (VAL-01, VAL-02, RAT-05);
// - dados do salão lidos com o JWT da própria pessoa: o RLS decide o contexto (LLM-02, LLM-12);
// - chave de serviço só para ler a coluna cifrada e gravar log e resultado, sempre
//   filtrada pelo perfil da sessão (AUZ-05);
// - cota diária e ritmo por hora por pessoa (LLM-11, RAT-03);
// - erro genérico com código de correlação; log só com metadados (LOG-01, LOG-04, IAD-08).
//
// Ações (POST JSON): validar_chave, salvar_configuracao e gerar.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { criarBanco, criarLeitor } from './nucleo/banco.ts';
import { ehFuncionalidade } from './nucleo/funcionalidades/index.ts';
import { executarFuncionalidade, salvarConfiguracao, validarChave, type Dependencias, type Falha } from './nucleo/servico.ts';
import { PROVEDORES_IA, STATUS_IA } from './nucleo/tipos.ts';
import { booleano, chaveApi, ErroEntrada, nomeModelo, objeto, umDe } from './nucleo/validacao.ts';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL') ?? '';
const CHAVE_PUBLICA = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SEGREDO_CIFRA = Deno.env.get('IA_ENCRYPTION_KEY') ?? '';
// Origens extras (separadas por vírgula), ex.: domínio próprio. As do projeto na Vercel já são aceitas.
const ORIGENS_EXTRAS = (Deno.env.get('ORIGENS_PERMITIDAS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
const ORIGEM_VERCEL = /^https:\/\/studio-labeli-app(-[a-z0-9-]+)?\.vercel\.app$/;
const MAX_CORPO = 20_000;

function origemPermitida(origem: string | null): string | null {
  if (!origem) return null;
  return ORIGEM_VERCEL.test(origem) || ORIGENS_EXTRAS.includes(origem) ? origem : null;
}

function cabecalhos(origem: string | null): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  const ok = origemPermitida(origem);
  if (ok) {
    h['Access-Control-Allow-Origin'] = ok;
    h['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type';
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  return h;
}

function resposta(origem: string | null, status: number, corpo: unknown, extras: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cabecalhos(origem), ...extras } });
}

// Logger da função (LOG-04): campos sensíveis mascarados, nunca prompt, resposta ou chave.
const SENSIVEL = /chave|key|token|secret|segredo|authorization|prompt|texto|conteudo|corpo|body|mensagem_provedor|email|telefone/i;
function log(nivel: 'info' | 'warn' | 'error', mensagem: string, contexto: Record<string, unknown> = {}) {
  const limpo = Object.fromEntries(Object.entries(contexto).map(([k, v]) => [k, SENSIVEL.test(k) ? '[mascarado]' : typeof v === 'string' ? v.slice(0, 200) : v]));
  const linha = JSON.stringify({ nivel, mensagem, momento: new Date().toISOString(), ...limpo });
  if (nivel === 'error') console.error(linha);
  else if (nivel === 'warn') console.warn(linha);
  else console.log(linha);
}

const respostaFalha = (origem: string | null, f: Falha) => {
  const extras: Record<string, string> = STATUS_IA[f.codigo] === 429 ? { 'Retry-After': f.codigo === 'cota_diaria' ? '3600' : '300' } : {};
  return resposta(origem, STATUS_IA[f.codigo], { ok: false, codigo: f.codigo, error: f.mensagem, ...(f.diagnostico ? { diagnostico: f.diagnostico } : {}) }, extras);
};

Deno.serve(async (req) => {
  const origem = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: origemPermitida(origem) ? 204 : 403, headers: cabecalhos(origem) });
  }
  const id = crypto.randomUUID().slice(0, 8).toUpperCase();
  try {
    if (req.method !== 'POST') throw new ErroEntrada('Método não permitido.', 405);
    if (origem && !origemPermitida(origem)) throw new ErroEntrada('Origem não permitida.', 403);
    if (!URL_SUPABASE || !CHAVE_PUBLICA || !CHAVE_SERVICO) throw new Error('Configuração da função incompleta.');
    if (Number(req.headers.get('content-length') ?? '0') > MAX_CORPO) throw new ErroEntrada('Requisição grande demais.', 413);

    // Quem chama: cliente com o JWT da própria sessão (respeita o RLS).
    const autorizacao = req.headers.get('authorization') ?? '';
    if (!/^Bearer\s+\S+$/.test(autorizacao)) throw new ErroEntrada('Sessão expirada. Entre novamente.', 401);
    const usuario = createClient(URL_SUPABASE, CHAVE_PUBLICA, {
      global: { headers: { Authorization: autorizacao } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: quem, error: erroQuem } = await usuario.auth.getUser();
    if (erroQuem || !quem.user) throw new ErroEntrada('Sessão expirada. Entre novamente.', 401);

    // Perfil ativo e estabelecimento vêm do banco, nunca do corpo (AUZ-03, AUZ-06).
    const [{ data: usuarioId }, { data: estabelecimentoId }] = await Promise.all([
      usuario.rpc('usuario_atual_id'),
      usuario.rpc('estabelecimento_atual'),
    ]);
    if (typeof usuarioId !== 'string' || typeof estabelecimentoId !== 'string') throw new ErroEntrada('Acesso não liberado.', 403);

    const bruto = await req.text();
    if (bruto.length > MAX_CORPO) throw new ErroEntrada('Requisição grande demais.', 413);
    let corpoJson: unknown;
    try {
      corpoJson = JSON.parse(bruto);
    } catch {
      throw new ErroEntrada('Dados inválidos.');
    }
    const acao = (corpoJson as { acao?: unknown } | null)?.acao;

    // Sem o segredo de cifra a integração fica desligada (estado normal até a configuração do painel).
    if (SEGREDO_CIFRA.length < 32) {
      log('error', 'IA_ENCRYPTION_KEY ausente ou curta', { id });
      return resposta(origem, 503, { ok: false, codigo: 'erro_interno', error: 'A integração com IA ainda não foi habilitada neste portal. Avise a administração.', id });
    }

    const servico = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false, autoRefreshToken: false } });
    const sessao = { authId: quem.user.id, usuarioId, estabelecimentoId };
    const dep: Dependencias = {
      sessao,
      banco: criarBanco(usuario, servico, sessao),
      leitor: criarLeitor(usuario),
      segredo: SEGREDO_CIFRA,
      log: (nivel, mensagem, contexto) => log(nivel, mensagem, { id, ...contexto }),
    };

    if (acao === 'validar_chave') {
      const c = objeto(corpoJson, ['acao', 'provider', 'api_key']);
      const r = await validarChave(dep, umDe(c, 'provider', PROVEDORES_IA), chaveApi(c));
      return r.ok ? resposta(origem, 200, { ok: true, modelos: r.modelos }) : respostaFalha(origem, r);
    }

    if (acao === 'salvar_configuracao') {
      const c = objeto(corpoJson, ['acao', 'provider', 'api_key', 'modelo', 'consentimento']);
      const r = await salvarConfiguracao(dep, {
        provider: umDe(c, 'provider', PROVEDORES_IA),
        api_key: chaveApi(c),
        modelo: nomeModelo(c),
        consentimento: booleano(c, 'consentimento'),
      });
      return r.ok ? resposta(origem, 200, { ok: true }) : respostaFalha(origem, r);
    }

    if (acao === 'gerar') {
      const c = objeto(corpoJson, ['acao', 'funcionalidade', 'entrada']);
      if (!ehFuncionalidade(c.funcionalidade)) throw new ErroEntrada('Funcionalidade inválida.');
      const r = await executarFuncionalidade(dep, c.funcionalidade, c.entrada);
      return r.ok ? resposta(origem, 200, { ok: true, geracao: r.geracao, resultado: r.resultado }) : respostaFalha(origem, r);
    }

    throw new ErroEntrada('Ação inválida.');
  } catch (e) {
    if (e instanceof ErroEntrada) return resposta(origem, e.status, { ok: false, codigo: 'entrada', error: e.message, id });
    log('error', 'Falha interna na IA', { id, nome: (e as Error)?.name ?? 'desconhecido' });
    return resposta(origem, 500, { ok: false, codigo: 'erro_interno', error: 'Erro interno. Informe o código ao suporte.', id });
  }
});
