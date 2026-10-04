// Acesso ao Supabase do Kanban. Quadros e colunas mudam só pelas funções kanban_*
// (ver supabase/migrations/20261004120000_kanban.sql); cartões e sub-itens são gravados direto.
import { supabase } from '../../lib/supabase';
import { ErroPublico, mensagemDeErro } from '../../lib/seguranca/erros';
import type { Coluna, ColunaEdicao, ItemTarefa, NovaTarefa, Pessoa, Quadro, Tarefa } from './logic';

export const kanbanKeys = {
  base: ['kanban'] as const,
  quadros: ['kanban', 'quadros'] as const,
  colunas: ['kanban', 'colunas'] as const,
  resumo: ['kanban', 'resumo'] as const,
  tarefas: (quadroId: string) => ['kanban', 'tarefas', quadroId] as const,
  pessoas: ['kanban', 'pessoas'] as const,
  eu: ['kanban', 'eu'] as const,
  clientes: ['kanban', 'clientes'] as const,
};

/** Converte o erro do Supabase numa mensagem curta para a tela (sem detalhes técnicos, LOG-01). */
export function mensagemErro(e: unknown, padrao = 'Não foi possível salvar. Tente novamente.'): string {
  return mensagemDeErro(e, padrao, 'kanban');
}

async function rodar<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- leitura

export async function garantirPadrao(): Promise<void> {
  await rodar(supabase.rpc('kanban_garantir_padrao'));
}

export async function usuarioAtual(): Promise<string> {
  return rodar(supabase.rpc('kanban_usuario_atual')) as Promise<string>;
}

export async function listarQuadros(): Promise<Quadro[]> {
  return (await rodar(supabase.from('kanban_quadros').select('id, nome, created_at').order('created_at'))) as Quadro[];
}

export async function listarColunas(): Promise<Coluna[]> {
  return (await rodar(supabase.from('kanban_colunas').select('id, quadro_id, nome, posicao').order('posicao'))) as Coluna[];
}

/** Contagem leve para a tela inicial (sem canceladas). */
export async function listarResumo(): Promise<{ coluna_id: string }[]> {
  return (await rodar(supabase.from('internal_tasks').select('coluna_id').is('cancelada_em', null))) as { coluna_id: string }[];
}

export async function listarTarefas(colunaIds: string[]): Promise<Tarefa[]> {
  if (colunaIds.length === 0) return [];
  const dados = (await rodar(
    supabase
      .from('internal_tasks')
      .select('*, clients(id, name, phone), tarefa_itens(*)')
      .in('coluna_id', colunaIds)
      .order('ordem')
      .order('created_at'),
  )) as Tarefa[];
  return dados.map((t) => ({
    ...t,
    tarefa_itens: [...(t.tarefa_itens || [])].sort((a, b) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at)),
  }));
}

export async function listarPessoas(): Promise<Pessoa[]> {
  return (await rodar(supabase.from('users').select('id, name, auth_id, active').order('name'))) as Pessoa[];
}

export async function listarClientes(): Promise<{ id: string; name: string; phone: string }[]> {
  return (await rodar(supabase.from('clients').select('id, name, phone').order('name'))) as { id: string; name: string; phone: string }[];
}

// ---------------------------------------------------------------- cartões

export async function criarTarefa(dados: NovaTarefa): Promise<Tarefa> {
  return (await rodar(supabase.from('internal_tasks').insert([dados]).select('*, clients(id, name, phone), tarefa_itens(*)').single())) as Tarefa;
}

export async function editarTarefa(id: string, campos: Record<string, unknown>): Promise<void> {
  const linhas = (await rodar(supabase.from('internal_tasks').update(campos).eq('id', id).select('id'))) as unknown[];
  if (!linhas.length) throw new ErroPublico('Tarefa inválida.');
}

export async function excluirTarefa(id: string): Promise<void> {
  await rodar(supabase.from('internal_tasks').delete().eq('id', id));
}

export async function gravarOrdem(colunaId: string, ids: string[]): Promise<void> {
  await rodar(supabase.rpc('kanban_reordenar', { p_coluna: colunaId, p_ids: ids }));
}

// ---------------------------------------------------------------- sub-itens

export async function criarItem(taskId: string, titulo: string, ordem: number): Promise<ItemTarefa> {
  return (await rodar(supabase.from('tarefa_itens').insert([{ task_id: taskId, titulo, ordem }]).select().single())) as ItemTarefa;
}

export async function editarItem(taskId: string, itemId: string, campos: { titulo?: string; concluido?: boolean }): Promise<void> {
  await rodar(supabase.from('tarefa_itens').update(campos).eq('id', itemId).eq('task_id', taskId));
}

export async function excluirItem(taskId: string, itemId: string): Promise<void> {
  await rodar(supabase.from('tarefa_itens').delete().eq('id', itemId).eq('task_id', taskId));
}

// ---------------------------------------------------------------- quadros

export async function criarQuadro(nome: string, colunas: ColunaEdicao[]): Promise<string> {
  return (await rodar(
    supabase.rpc('kanban_criar_quadro', { p_nome: nome.trim(), p_colunas: colunas.map((c) => ({ nome: c.nome.trim() })) }),
  )) as string;
}

export async function salvarQuadro(id: string, nome: string, colunas: ColunaEdicao[]): Promise<void> {
  await rodar(
    supabase.rpc('kanban_salvar_quadro', {
      p_quadro: id,
      p_nome: nome.trim(),
      p_colunas: colunas.map((c) => (c.id ? { id: c.id, nome: c.nome.trim() } : { nome: c.nome.trim() })),
    }),
  );
}

export async function excluirQuadro(id: string): Promise<void> {
  await rodar(supabase.rpc('kanban_excluir_quadro', { p_quadro: id }));
}

// ---------------------------------------------------------------- equipe (public.users)

export async function salvarPessoa(p: { id?: string; name: string; active?: boolean }): Promise<void> {
  if (p.id) await rodar(supabase.from('users').update({ name: p.name.trim(), active: p.active ?? true }).eq('id', p.id));
  else await rodar(supabase.from('users').insert([{ name: p.name.trim(), role: 'professional', active: true }]));
}
