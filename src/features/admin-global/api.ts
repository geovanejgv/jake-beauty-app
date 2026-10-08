// Acesso da administração global. Leitura e edição pelas funções do banco (que conferem
// admin global + MFA, aal2); criação pela Edge Function admin-usuarios (única com a chave
// de serviço, necessária para convidar a conta de login da nova administradora).
import { supabase } from '../../lib/supabase';
import { ErroPublico, mensagemDeErro } from '../../lib/seguranca/erros';
import { corpoNovoEstabelecimento, fimDemoParaBanco, mensagemPainel, type EdicaoEstabelecimento, type EstabelecimentoGlobal, type NovoEstabelecimento } from './logic';

export const chaveEstabelecimentos = ['admin-global', 'estabelecimentos'] as const;

function erroDoPainel(e: unknown, padrao: string): ErroPublico {
  const msg = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : '';
  return new ErroPublico(mensagemPainel(msg) ?? mensagemDeErro(e, padrao, 'admin_global'));
}

export async function listarEstabelecimentos(): Promise<EstabelecimentoGlobal[]> {
  const { data, error } = await supabase.rpc('admin_global_estabelecimentos');
  if (error) throw erroDoPainel(error, 'Não foi possível carregar os estabelecimentos.');
  return ((data ?? []) as EstabelecimentoGlobal[]).map((e) => ({
    ...e, profissionais: Number(e.profissionais), administradoras: Number(e.administradoras), clientes: Number(e.clientes),
  }));
}

export async function atualizarEstabelecimento(id: string, d: EdicaoEstabelecimento): Promise<void> {
  const { error } = await supabase.rpc('admin_global_atualizar_estabelecimento', {
    p_id: id, p_nome: d.nome.trim(), p_plano: d.plano, p_status: d.status,
    p_demo_expira_em: d.plano === 'demonstracao' ? fimDemoParaBanco(d.demo_expira_em) : null,
    p_max_profissionais: d.max_profissionais, p_max_clientes: d.max_clientes,
  });
  if (error) throw erroDoPainel(error, 'Não foi possível salvar.');
}

export async function criarEstabelecimento(d: NovoEstabelecimento): Promise<void> {
  const { error } = await supabase.functions.invoke('admin-usuarios', { body: corpoNovoEstabelecimento(d) });
  if (!error) return;
  const resposta = (error as { context?: Response }).context;
  let mensagem: string | null = null;
  try {
    if (resposta && typeof resposta.json === 'function') {
      const j = (await resposta.json()) as { error?: string; id?: string };
      if (typeof j.error === 'string' && j.error.length <= 200) mensagem = j.id ? `${j.error} (código ${j.id})` : j.error;
    }
  } catch { /* corpo ilegível: mensagem genérica */ }
  throw new ErroPublico(mensagem ?? mensagemDeErro(error, 'Não foi possível criar o estabelecimento.', 'admin_global'));
}
