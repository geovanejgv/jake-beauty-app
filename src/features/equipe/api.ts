// Equipe (public.users + public.perfis_profissionais) e chamadas à Edge Function de acessos.
import { supabase } from '../../lib/supabase';
import { ErroPublico, mensagemDeErro } from '../../lib/seguranca/erros';
import type { Papel } from '../acesso/modulos';

export type ModeloContrato = 'salao_parceiro' | 'clt' | 'autonomo' | 'socio';

export const ROTULO_CONTRATO: Record<ModeloContrato, string> = {
  salao_parceiro: 'Salão parceiro (Lei 13.352/2016)',
  clt: 'CLT',
  autonomo: 'Autônomo',
  socio: 'Sócio(a)',
};

export type PerfilProfissional = {
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  cnpj: string | null;
  modelo_contrato: ModeloContrato;
  comissao_padrao_percentual: number | null;
  chave_pix: string | null;
  inicio_contrato: string | null;
  observacoes: string | null;
};

export type MembroEquipe = {
  id: string;
  name: string;
  role: Papel;
  active: boolean;
  auth_id: string | null;
  created_at: string;
  perfil: PerfilProfissional | null;
  qtd_servicos: number;
};

export const equipeKeys = { lista: ['equipe'] as const, ativos: ['equipe', 'ativos'] as const };

export async function listarEquipe(): Promise<MembroEquipe[]> {
  const [{ data: users, error }, { data: perfis, error: e2 }, { data: vinculos, error: e3 }] = await Promise.all([
    supabase.from('users').select('id, name, role, active, auth_id, created_at').order('name'),
    supabase.from('perfis_profissionais').select('user_id, email, telefone, cpf, cnpj, modelo_contrato, comissao_padrao_percentual, chave_pix, inicio_contrato, observacoes'),
    supabase.from('usuario_servico').select('user_id').eq('ativo', true),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  if (e3) throw e3;
  const porUser = new Map((perfis || []).map((p) => [(p as { user_id: string }).user_id, p as unknown as PerfilProfissional]));
  const contagem = new Map<string, number>();
  for (const v of vinculos || []) contagem.set((v as { user_id: string }).user_id, (contagem.get((v as { user_id: string }).user_id) ?? 0) + 1);
  return (users || []).map((u) => {
    const x = u as Omit<MembroEquipe, 'perfil' | 'qtd_servicos'>;
    return { ...x, perfil: porUser.get(x.id) ?? null, qtd_servicos: contagem.get(x.id) ?? 0 };
  });
}

/** Profissionais ativos (para filtros e seleção na agenda). Disponível para toda a equipe. */
export async function listarAtivos(): Promise<{ id: string; name: string; role: Papel }[]> {
  const { data, error } = await supabase.from('users').select('id, name, role').eq('active', true).order('name');
  if (error) throw error;
  return (data || []) as { id: string; name: string; role: Papel }[];
}

export type DadosMembro = { name: string; role: Papel } & PerfilProfissional;

function semVazios(p: PerfilProfissional): PerfilProfissional {
  const limpa = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    ...p,
    email: limpa(p.email), telefone: limpa(p.telefone), cpf: limpa(p.cpf), cnpj: limpa(p.cnpj),
    chave_pix: limpa(p.chave_pix), inicio_contrato: limpa(p.inicio_contrato), observacoes: limpa(p.observacoes),
  };
}

function traduzirErroBanco(e: unknown, padrao: string): never {
  const erro = e as { code?: string; message?: string };
  if (erro?.code === '23505' && /cpf/i.test(erro.message ?? '')) throw new ErroPublico('Já existe profissional cadastrado com este CPF.');
  if (erro?.code === '23514' && /cpf/i.test(erro.message ?? '')) throw new ErroPublico('CPF inválido.');
  if (erro?.code === '23514' && /cnpj/i.test(erro.message ?? '')) throw new ErroPublico('CNPJ/MEI inválido.');
  throw new ErroPublico(mensagemDeErro(e, padrao, 'equipe'));
}

export async function salvarMembro(id: string | null, d: DadosMembro): Promise<string> {
  const { name, role, ...perfil } = d;
  let userId = id;
  if (userId) {
    const { error } = await supabase.from('users').update({ name: name.trim(), role }).eq('id', userId);
    if (error) traduzirErroBanco(error, 'Não foi possível salvar o profissional.');
  } else {
    const { data, error } = await supabase.from('users').insert([{ name: name.trim(), role, active: true }]).select('id').single();
    if (error) traduzirErroBanco(error, 'Não foi possível cadastrar o profissional.');
    userId = (data as { id: string }).id;
  }
  const { error: e2 } = await supabase.from('perfis_profissionais').upsert({ user_id: userId, ...semVazios(perfil) }, { onConflict: 'user_id' });
  if (e2) traduzirErroBanco(e2, 'Não foi possível salvar o perfil.');
  return userId!;
}

type AcaoAcesso =
  | { acao: 'criar_acesso'; user_id: string; email: string; senha_temporaria: string }
  | { acao: 'redefinir_senha'; user_id: string; senha_temporaria: string }
  | { acao: 'desativar' | 'reativar'; user_id: string };

/** Chama a Edge Function admin-usuarios. As mensagens dela já são seguras para a tela. */
export async function acaoDeAcesso(corpo: AcaoAcesso): Promise<void> {
  const { error } = await supabase.functions.invoke('admin-usuarios', { body: corpo });
  if (!error) return;
  const resposta = (error as { context?: Response }).context;
  let mensagem: string | null = null;
  try {
    if (resposta && typeof resposta.json === 'function') {
      const j = (await resposta.json()) as { error?: string; id?: string };
      if (j?.error) mensagem = j.id ? `${j.error} (código ${j.id})` : j.error;
    }
  } catch { /* corpo não é JSON: cai na mensagem genérica */ }
  throw new ErroPublico(mensagem ?? mensagemDeErro(error, 'Não foi possível concluir a ação de acesso.', 'equipe.acesso'));
}

/** Desativa/reativa: com login passa pela função (bloqueia também o login); sem login, direto no banco. */
export async function definirAtivo(m: MembroEquipe, ativo: boolean): Promise<void> {
  if (m.auth_id) return acaoDeAcesso({ acao: ativo ? 'reativar' : 'desativar', user_id: m.id });
  const { error } = await supabase.from('users').update({ active: ativo }).eq('id', m.id);
  if (error) throw new ErroPublico(mensagemDeErro(error, 'Não foi possível alterar o status.', 'equipe.status'));
}

/** Senha temporária forte (gerador criptográfico, CRI-06), sem caracteres que confundem. */
export function gerarSenhaTemporaria(tamanho = 14): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(tamanho);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}
