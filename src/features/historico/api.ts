// Histórico e reativação. O RLS decide o que cada pessoa vê (clientes_reativacao é
// security invoker; convites, modelos e "não quer contato" são da administradora).
import { supabase } from '../../lib/supabase';
import type { ClienteReativacao } from './logic';
import type { Contato, ModeloMensagem, ResultadoConvite } from './convites';
import type { Lembrete, StatusLembrete } from './lembretes';

export const historicoKeys = {
  reativacao: ['historico', 'reativacao'] as const,
  catalogo: ['historico', 'catalogo'] as const,
  telefones: ['historico', 'telefones'] as const,
  modelos: ['historico', 'modelos'] as const,
  contatos: ['historico', 'contatos'] as const,
  /** Debaixo de contatos: invalidar os convites também atualiza o histórico da cliente. */
  contatosDaCliente: (id: string) => ['historico', 'contatos', id] as const,
  naoQuer: ['historico', 'nao-quer'] as const,
  valores: (ids: string[]) => ['historico', 'valores', ids] as const,
  lembretes: ['historico', 'lembretes'] as const,
  nomes: ['historico', 'nomes'] as const,
};

async function rodar<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export async function listarClientesReativacao(): Promise<ClienteReativacao[]> {
  const linhas = ((await rodar(supabase.rpc('clientes_reativacao'))) ?? []) as ClienteReativacao[];
  return linhas.map((c) => ({
    ...c,
    total_12m: Number(c.total_12m ?? 0),
    ticket_medio_12m: c.ticket_medio_12m === null ? null : Number(c.ticket_medio_12m),
    intervalo_medio_dias: c.intervalo_medio_dias === null ? null : Number(c.intervalo_medio_dias),
  }));
}

export type CatalogoHistorico = {
  servicos: { id: string; nome: string; categoria_id: string }[];
  categorias: { id: string; nome: string }[];
};

export async function listarCatalogoHistorico(): Promise<CatalogoHistorico> {
  const [servicos, categorias] = await Promise.all([
    rodar(supabase.from('servicos').select('id, nome, categoria_id').order('nome')),
    rodar(supabase.from('categorias_servico').select('id, nome').order('nome')),
  ]);
  return { servicos: (servicos ?? []) as CatalogoHistorico['servicos'], categorias: (categorias ?? []) as CatalogoHistorico['categorias'] };
}

/** Telefone das clientes para a busca (vem mascarado para quem não tem permissão). */
export async function listarTelefones(): Promise<Map<string, string | null>> {
  const linhas = ((await rodar(supabase.from('clientes_visiveis').select('id, phone').limit(10000))) ?? []) as { id: string; phone: string | null }[];
  return new Map(linhas.map((l) => [l.id, l.phone]));
}

// ----- Fase 2: convites (só a administradora, pelo RLS) -----

const CAMPOS_CONTATO = 'id, client_id, enviado_em, enviado_por, modelo_id, texto_enviado, resultado, resultado_em, agendamento_id';

export async function listarModelos(): Promise<ModeloMensagem[]> {
  return ((await rodar(supabase.from('mensagem_modelos').select('id, nome, texto, padrao').order('nome'))) ?? []) as ModeloMensagem[];
}

export async function salvarModelo(m: ModeloMensagem) {
  const dados = { nome: m.nome.trim(), texto: m.texto.trim(), padrao: m.padrao };
  if (m.id) await rodar(supabase.from('mensagem_modelos').update(dados).eq('id', m.id));
  else await rodar(supabase.from('mensagem_modelos').insert([dados]));
}

export async function excluirModelo(id: string) {
  await rodar(supabase.from('mensagem_modelos').delete().eq('id', id));
}

/** Convites do último ano, do mais novo para o mais antigo. */
export async function listarContatos(): Promise<Contato[]> {
  const desde = new Date(Date.now() - 365 * 86_400_000).toISOString();
  return ((await rodar(supabase.from('contatos_reativacao').select(CAMPOS_CONTATO).gte('enviado_em', desde)
    .order('enviado_em', { ascending: false }).limit(5000))) ?? []) as Contato[];
}

/** Todas as mensagens de uma cliente, sem limite de data, da mais nova para a mais antiga. */
export async function listarContatosDaCliente(clienteId: string): Promise<Contato[]> {
  return ((await rodar(supabase.from('contatos_reativacao').select(CAMPOS_CONTATO).eq('client_id', clienteId)
    .order('enviado_em', { ascending: false }).limit(500))) ?? []) as Contato[];
}

/** Grava o envio; autor, data e canal são do banco. */
export async function registrarContato(d: { client_id: string; modelo_id: string | null; texto: string }) {
  await rodar(supabase.from('contatos_reativacao').insert([{ client_id: d.client_id, modelo_id: d.modelo_id, texto_enviado: d.texto }]));
}

export async function registrarResultado(ids: string[], resultado: ResultadoConvite) {
  if (ids.length) await rodar(supabase.from('contatos_reativacao').update({ resultado }).in('id', ids));
}

export async function listarNaoQuerContato(): Promise<Set<string>> {
  const linhas = ((await rodar(supabase.from('clients').select('id').eq('nao_quer_contato', true).limit(10000))) ?? []) as { id: string }[];
  return new Set(linhas.map((l) => l.id));
}

export async function definirNaoQuerContato(clienteId: string, valor: boolean) {
  await rodar(supabase.from('clients').update({ nao_quer_contato: valor, nao_quer_contato_em: valor ? new Date().toISOString() : null }).eq('id', clienteId));
}

/** Valor dos atendimentos realizados que vieram de convites (faturamento reativado). */
export async function valoresDosAgendamentos(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const linhas = ((await rodar(supabase.from('appointments').select('id, valor_cobrado, status').in('id', ids.slice(0, 500)))) ?? []) as
    { id: string; valor_cobrado: number | null; status: string }[];
  return new Map(linhas.filter((l) => l.status === 'completed').map((l) => [l.id, Number(l.valor_cobrado ?? 0)]));
}

// ----- Fase 3: lembretes de contato (só a administradora, pelo RLS) -----

const CAMPOS_LEMBRETE = 'id, client_id, data, hora, responsavel_id, modelo_id, observacao, status';

/** Pendentes (inclui atrasados), do mais antigo para o mais novo. */
export async function listarLembretesPendentes(): Promise<Lembrete[]> {
  const linhas = ((await rodar(supabase.from('lembretes_contato').select(CAMPOS_LEMBRETE).eq('status', 'pendente')
    .order('data').limit(2000))) ?? []) as Lembrete[];
  return linhas.map((l) => ({ ...l, hora: l.hora ? l.hora.slice(0, 5) : null }));
}

export async function criarLembrete(d: { client_id: string; data: string; hora: string | null; responsavel_id: string | null; modelo_id: string | null; observacao: string }) {
  await rodar(supabase.from('lembretes_contato').insert([{ ...d, observacao: d.observacao.trim() || null }]));
}

export async function mudarDataLembrete(id: string, data: string) {
  await rodar(supabase.from('lembretes_contato').update({ data }).eq('id', id));
}

export async function mudarStatusLembrete(id: string, status: StatusLembrete) {
  await rodar(supabase.from('lembretes_contato').update({ status }).eq('id', id));
}

/** Nome e telefone das clientes (para a faixa da agenda). */
export async function listarNomesClientes(): Promise<Map<string, { nome: string; telefone: string | null }>> {
  const linhas = ((await rodar(supabase.from('clientes_visiveis').select('id, name, phone').limit(10000))) ?? []) as { id: string; name: string; phone: string | null }[];
  return new Map(linhas.map((l) => [l.id, { nome: l.name, telefone: l.phone }]));
}
