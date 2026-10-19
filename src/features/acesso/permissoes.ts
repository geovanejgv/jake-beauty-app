// Permissões por profissional: a administradora define, por tela, o nível (sem acesso,
// ver ou editar), o alcance (só os dados dela ou de todas) e, em Clientes, os dados além
// do nome. A fronteira é o banco (public.minha_permissao nas políticas e funções, AUZ-07);
// aqui ficam o menu, os botões e a tela de configuração.
import { supabase } from '../../lib/supabase';
import type { IdModulo } from './modulos';

export type Nivel = 'nenhum' | 'ver' | 'editar';
export type Alcance = 'proprio' | 'todos';
export type CampoCliente = 'telefone' | 'email' | 'aniversario' | 'observacoes' | 'lgpd';
export type Permissao = { nivel: Nivel; alcance: Alcance; campos: CampoCliente[] };
export type Permissoes = Partial<Record<IdModulo, Permissao>>;

/** Telas já protegidas no banco por permissão (fase 1). As demais seguem só da administradora. */
export type ModuloPermissao = 'agenda' | 'meu_painel' | 'tarefas' | 'clientes' | 'relatorio_comissoes' | 'plano';

export const TELAS_PERMISSAO: { id: ModuloPermissao; rotulo: string; niveis: Nivel[]; alcance: boolean; dica: string }[] = [
  { id: 'agenda', rotulo: 'Agenda', niveis: ['nenhum', 'ver', 'editar'], alcance: true,
    dica: 'Editar: agendar, remarcar, confirmar e concluir. Valores continuam com a administradora.' },
  { id: 'clientes', rotulo: 'Clientes', niveis: ['nenhum', 'ver', 'editar'], alcance: false,
    dica: 'O nome aparece sempre. Editar: registrar histórico técnico e cadastrar cliente nova.' },
  { id: 'relatorio_comissoes', rotulo: 'Relatório de Comissões', niveis: ['nenhum', 'ver'], alcance: true,
    dica: 'Todas: vê os atendimentos e comissões das demais profissionais.' },
  { id: 'meu_painel', rotulo: 'Meu Painel', niveis: ['nenhum', 'ver'], alcance: false, dica: 'Sempre com os dados da própria profissional.' },
  { id: 'tarefas', rotulo: 'Tarefas', niveis: ['nenhum', 'editar'], alcance: false, dica: 'Quadros seguem o compartilhamento de cada quadro.' },
  { id: 'plano', rotulo: 'Plano', niveis: ['nenhum', 'ver'], alcance: false, dica: 'Prazo da demonstração e uso dos limites.' },
];

export const MODULOS_COM_PERMISSAO = new Set<IdModulo>(TELAS_PERMISSAO.map((t) => t.id));

export const CAMPOS_CLIENTE: { id: CampoCliente; rotulo: string }[] = [
  { id: 'telefone', rotulo: 'Telefone / WhatsApp' },
  { id: 'email', rotulo: 'E-mail' },
  { id: 'aniversario', rotulo: 'Aniversário' },
  { id: 'observacoes', rotulo: 'Observações' },
  { id: 'lgpd', rotulo: 'Consentimento LGPD' },
];

export const ROTULO_NIVEL: Record<Nivel, string> = { nenhum: 'Sem acesso', ver: 'Só visualizar', editar: 'Visualizar e editar' };
export const ROTULO_ALCANCE: Record<Alcance, string> = { proprio: 'Só os dados dela', todos: 'Dados de todas' };

/** Mesmo padrão do banco (public.permissao_padrao): as telas que a profissional já usava, com os dados dela. */
export function permissaoPadrao(modulo: IdModulo): Permissao {
  const nivel: Nivel = ['agenda', 'tarefas', 'clientes'].includes(modulo) ? 'editar'
    : ['meu_painel', 'relatorio_comissoes', 'plano'].includes(modulo) ? 'ver' : 'nenhum';
  return { nivel, alcance: 'proprio', campos: [] };
}

export const TOTAL: Permissao = { nivel: 'editar', alcance: 'todos', campos: CAMPOS_CLIENTE.map((c) => c.id) };

export function permissaoDe(permissoes: Permissoes | undefined, modulo: IdModulo): Permissao {
  return permissoes?.[modulo] ?? permissaoPadrao(modulo);
}

/** Atalhos de tela para o usuário logado. */
export function acessoTela(permissoes: Permissoes | undefined, modulo: IdModulo) {
  const p = permissaoDe(permissoes, modulo);
  return {
    ver: p.nivel !== 'nenhum',
    editar: p.nivel === 'editar',
    todos: p.nivel !== 'nenhum' && p.alcance === 'todos',
    editarTodos: p.nivel === 'editar' && p.alcance === 'todos',
    campo: (c: CampoCliente) => p.nivel !== 'nenhum' && p.campos.includes(c),
  };
}

type Linha = { modulo: IdModulo; nivel: Nivel; alcance: Alcance; campos: CampoCliente[] | null };
const paraMapa = (linhas: Linha[]): Permissoes =>
  Object.fromEntries(linhas.map((l) => [l.modulo, { nivel: l.nivel, alcance: l.alcance, campos: l.campos ?? [] }]));

async function rodar<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

/** Permissões efetivas do usuário logado (calculadas no banco). */
export async function minhasPermissoes(): Promise<Permissoes> {
  return paraMapa(((await rodar(supabase.rpc('minhas_permissoes'))) ?? []) as Linha[]);
}

export const permissoesKeys = {
  base: ['permissoes'] as const,
  doUsuario: (id: string) => ['permissoes', id] as const,
  historico: (id: string) => ['permissoes', 'historico', id] as const,
};

/** Permissões gravadas para uma profissional (sem linha = padrão). Só a administradora. */
export async function permissoesDe(userId: string): Promise<Permissoes> {
  return paraMapa((await rodar(supabase.from('permissoes_profissional').select('modulo, nivel, alcance, campos').eq('user_id', userId))) as Linha[]);
}

export async function salvarPermissoes(userId: string, mapa: Partial<Record<ModuloPermissao, Permissao>>) {
  const linhas = Object.entries(mapa).map(([modulo, p]) => ({ user_id: userId, modulo, nivel: p!.nivel, alcance: p!.alcance, campos: modulo === 'clientes' ? p!.campos : [] }));
  if (!linhas.length) return;
  await rodar(supabase.from('permissoes_profissional').upsert(linhas, { onConflict: 'user_id,modulo' }));
}

export type AcaoHistorico = { id: number; acao: 'criou' | 'alterou' | 'excluiu'; tela: 'agenda' | 'clientes'; data_referencia: string | null; campos: string[]; created_at: string };

export async function historicoDe(userId: string): Promise<AcaoHistorico[]> {
  return (await rodar(supabase.from('historico_acoes').select('id, acao, tela, data_referencia, campos, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(200))) as AcaoHistorico[];
}

const ROTULO_CAMPO: Record<string, string> = {
  status: 'status', start_time: 'horário', end_time: 'horário de término', professional_id: 'profissional', servico_id: 'serviço',
  client_id: 'cliente', notes: 'observação', payment_method: 'forma de pagamento', valor_cobrado: 'valor', gorjeta: 'gorjeta',
  texto: 'texto', tipo: 'tipo', block_reason: 'motivo do bloqueio', return_reminder_date: 'lembrete de retorno',
};

/** Frase do histórico, sem dado pessoal: tela, ação, data do atendimento e campos alterados. */
export function descreverAcao(a: AcaoHistorico, dataHora: (iso: string) => string): string {
  const alvo = a.tela === 'agenda' ? `atendimento${a.data_referencia ? ` de ${dataHora(a.data_referencia)}` : ''}` : 'registro de cliente';
  const verbo = a.acao === 'criou' ? 'Criou' : a.acao === 'excluiu' ? 'Excluiu' : 'Alterou';
  const campos = a.acao === 'alterou' && a.campos.length
    ? ` (${[...new Set(a.campos.map((c) => ROTULO_CAMPO[c] ?? c.replace(/_/g, ' ')))].join(', ')})` : '';
  return `${verbo} ${alvo}${campos}`;
}
