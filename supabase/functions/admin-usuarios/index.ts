// Edge Function (Supabase): gestão de acessos da equipe pela administradora.
//
// Por que existe: criar login, redefinir senha e bloquear conta exigem a chave de
// serviço do Supabase, que NUNCA vai para o navegador (AUZ-05). Ela só existe aqui,
// como variável do próprio ambiente da função (SUPABASE_SERVICE_ROLE_KEY).
//
// Segurança:
// - toda chamada exige sessão válida (o gateway confere o JWT) e a função confere no
//   banco que quem chama é administradora ativa (AUZ-01, AUZ-06);
// - CORS só para as origens do portal (CAB-03);
// - entrada validada campo a campo, com limites (VAL-01, VAL-02);
// - resposta de erro genérica com código de correlação (LOG-01), sem senha em log (LOG-04);
// - cada ação grava a trilha de auditoria com quem fez e de onde (LOG-05).
//
// Ações (POST JSON): criar_acesso, redefinir_senha, desativar, reativar.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL') ?? '';
const CHAVE_PUBLICA = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// Origens extras (separadas por vírgula), ex.: domínio próprio. As do projeto na Vercel já são aceitas.
const ORIGENS_EXTRAS = (Deno.env.get('ORIGENS_PERMITIDAS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
const ORIGEM_VERCEL = /^https:\/\/studio-labeli-app(-[a-z0-9-]+)?\.vercel\.app$/;

const SENHA_MIN = 12;
const SENHA_MAX_BYTES = 72;

type Corpo = Record<string, unknown>;

class ErroPublico extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

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

function resposta(origem: string | null, status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: cabecalhos(origem) });
}

function mascarar(texto: string) {
  return texto.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
}

// ---------------------------------------------------------------- validação
const texto = (c: Corpo, campo: string, min: number, max: number): string => {
  const v = c[campo];
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max) throw new ErroPublico(400, `Campo inválido: ${campo}.`);
  return v.trim();
};
const uuid = (c: Corpo, campo: string): string => {
  const v = c[campo];
  if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw new ErroPublico(400, `Campo inválido: ${campo}.`);
  return v;
};
const email = (c: Corpo): string => {
  const v = texto(c, 'email', 5, 254).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new ErroPublico(400, 'E-mail inválido.');
  return v;
};
const senha = (c: Corpo): string => {
  const v = c.senha_temporaria;
  if (typeof v !== 'string' || [...v].length < SENHA_MIN) throw new ErroPublico(400, `A senha temporária precisa ter pelo menos ${SENHA_MIN} caracteres.`);
  if (new TextEncoder().encode(v).length > SENHA_MAX_BYTES) throw new ErroPublico(400, 'Senha temporária longa demais.');
  return v;
};
function soCampos(c: Corpo, permitidos: string[]) {
  const extras = Object.keys(c).filter((k) => !permitidos.includes(k));
  if (extras.length) throw new ErroPublico(400, 'Campos não permitidos na requisição.');
}

// ---------------------------------------------------------------- função principal
Deno.serve(async (req) => {
  const origem = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: origemPermitida(origem) ? 204 : 403, headers: cabecalhos(origem) });
  }
  const id = crypto.randomUUID().slice(0, 8).toUpperCase();
  try {
    if (req.method !== 'POST') throw new ErroPublico(405, 'Método não permitido.');
    if (origem && !origemPermitida(origem)) throw new ErroPublico(403, 'Origem não permitida.');
    if (!URL_SUPABASE || !CHAVE_PUBLICA || !CHAVE_SERVICO) throw new Error('Configuração da função incompleta.');
    const tamanho = Number(req.headers.get('content-length') ?? '0');
    if (tamanho > 10_000) throw new ErroPublico(413, 'Requisição grande demais.');

    // Quem chama: cliente com o JWT da própria sessão (respeita o RLS) para conferir o papel.
    const autorizacao = req.headers.get('authorization') ?? '';
    if (!/^Bearer\s+\S+$/.test(autorizacao)) throw new ErroPublico(401, 'Sessão expirada. Entre novamente.');
    const comoUsuario = createClient(URL_SUPABASE, CHAVE_PUBLICA, {
      global: { headers: { Authorization: autorizacao } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: quem, error: erroQuem } = await comoUsuario.auth.getUser();
    if (erroQuem || !quem.user) throw new ErroPublico(401, 'Sessão expirada. Entre novamente.');
    const { data: ehAdmin, error: erroPapel } = await comoUsuario.rpc('usuario_admin');
    if (erroPapel) throw erroPapel;
    if (ehAdmin !== true) throw new ErroPublico(403, 'Somente a administradora gerencia acessos.');
    const { data: autorId } = await comoUsuario.rpc('usuario_atual_id');

    const corpo = (await req.json().catch(() => null)) as Corpo | null;
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new ErroPublico(400, 'Dados inválidos.');
    const acao = corpo.acao;

    const admin = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false, autoRefreshToken: false } });
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 64) || null;
    const navegador = (req.headers.get('user-agent') ?? '').slice(0, 300) || null;
    const auditar = async (acaoLog: string, entidadeId: string, detalhes: Record<string, unknown>) => {
      const { error } = await admin.from('access_logs').insert({
        auth_id: quem.user.id, user_id: autorId ?? null, acao: acaoLog, entidade: 'acessos',
        entidade_id: entidadeId, detalhes, ip, user_agent: navegador,
      });
      if (error) console.error(JSON.stringify({ id, aviso: 'falha ao auditar', codigo: error.code }));
    };
    const perfilDe = async (userId: string) => {
      const { data, error } = await admin.from('users').select('id, auth_id, role, active').eq('id', userId).maybeSingle();
      if (error) throw error;
      if (!data) throw new ErroPublico(404, 'Profissional não encontrado.');
      return data as { id: string; auth_id: string | null; role: string; active: boolean };
    };

    if (acao === 'criar_acesso') {
      // Cria o login de um profissional já cadastrado (com perfil em public.users).
      soCampos(corpo, ['acao', 'user_id', 'email', 'senha_temporaria']);
      const userId = uuid(corpo, 'user_id');
      const mail = email(corpo);
      const pass = senha(corpo);
      const perfil = await perfilDe(userId);
      if (perfil.auth_id) throw new ErroPublico(409, 'Este profissional já tem acesso. Use "redefinir senha".');
      const { data: criado, error } = await admin.auth.admin.createUser({
        email: mail, password: pass, email_confirm: true, user_metadata: { trocar_senha: true },
      });
      if (error || !criado.user) {
        if (error && /already|registered|exists/i.test(error.message)) throw new ErroPublico(409, 'Já existe um login com este e-mail.');
        throw error ?? new Error('Falha ao criar login.');
      }
      const { error: erroVinculo } = await admin.from('users').update({ auth_id: criado.user.id, active: true }).eq('id', userId);
      if (erroVinculo) {
        await admin.auth.admin.deleteUser(criado.user.id); // desfaz para não sobrar login solto
        throw erroVinculo;
      }
      await admin.from('perfis_profissionais').upsert({ user_id: userId, email: mail }, { onConflict: 'user_id' });
      await auditar('usuario_criado', userId, { login_criado: true, papel: perfil.role });
      return resposta(origem, 200, { ok: true });
    }

    if (acao === 'redefinir_senha') {
      soCampos(corpo, ['acao', 'user_id', 'senha_temporaria']);
      const perfil = await perfilDe(uuid(corpo, 'user_id'));
      if (!perfil.auth_id) throw new ErroPublico(409, 'Este profissional ainda não tem acesso ao sistema.');
      const { error } = await admin.auth.admin.updateUserById(perfil.auth_id, {
        password: senha(corpo), user_metadata: { trocar_senha: true },
      });
      if (error) throw error;
      await auditar('permissao_alterada', perfil.id, { senha_redefinida: true });
      return resposta(origem, 200, { ok: true });
    }

    if (acao === 'desativar' || acao === 'reativar') {
      soCampos(corpo, ['acao', 'user_id']);
      const perfil = await perfilDe(uuid(corpo, 'user_id'));
      const ativo = acao === 'reativar';
      // O gatilho do banco impede desativar a última administradora ativa.
      const { error } = await admin.from('users').update({ active: ativo }).eq('id', perfil.id);
      if (error) {
        if (/administradora ativa/.test(error.message)) throw new ErroPublico(409, 'É preciso manter ao menos uma administradora ativa.');
        throw error;
      }
      if (perfil.auth_id) {
        // Bloqueia também o login (além do RLS, que já corta o acesso aos dados na hora).
        const { error: erroBan } = await admin.auth.admin.updateUserById(perfil.auth_id, { ban_duration: ativo ? 'none' : '876000h' });
        if (erroBan) throw erroBan;
      }
      await auditar('permissao_alterada', perfil.id, { ativo });
      return resposta(origem, 200, { ok: true });
    }

    throw new ErroPublico(400, 'Ação inválida.');
  } catch (e) {
    if (e instanceof ErroPublico) return resposta(origem, e.status, { error: e.message, id });
    const detalhe = e instanceof Error ? e.message : JSON.stringify(e);
    console.error(JSON.stringify({ id, erro: mascarar(String(detalhe)) }));
    return resposta(origem, 500, { error: 'Erro interno. Informe o código ao suporte.', id });
  }
});
