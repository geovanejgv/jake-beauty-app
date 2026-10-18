// Conteúdo de cada planilha de backup. As consultas rodam como a administradora logada,
// então o RLS limita tudo ao estabelecimento dela (nada além do que ela já vê na tela).
import { supabase } from '../../lib/supabase';
import { ROTULO_ETAPA, ROTULO_ORIGEM, type EtapaLead, type OrigemLead } from '../leads/logic';
import type { Aba } from './xlsx';
import { dataBr, reais, simNao, type TipoBackup } from './logic';

const LIMITE = 20000;

async function ler<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw error;
  return (data ?? []) as T[];
}

const horaBr = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '';
const dataLocalBr = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';

async function mapaDeNomes(tabela: 'users' | 'clients', campo: 'name'): Promise<Map<string, string>> {
  const linhas = await ler<{ id: string; name: string }>(supabase.from(tabela).select(`id, ${campo}`).limit(LIMITE));
  return new Map(linhas.map((l) => [l.id, l.name]));
}

const STATUS_AGENDA: Record<string, string> = {
  scheduled: 'Agendado', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado', no_show: 'Faltou',
};
const STATUS_FECHAMENTO: Record<string, string> = {
  aguardando_conferencia: 'Aguardando conferência', contestado: 'Contestado', assinado_pago: 'Assinado e pago', cancelado: 'Cancelado',
};
const TIPO_HISTORICO: Record<string, string> = { tecnico: 'Técnico', alergia: 'Alergia', preferencia: 'Preferência', observacao: 'Observação' };

async function abasClientes(): Promise<Aba[]> {
  type C = { id: string; name: string; phone: string | null; email: string | null; birthday: string | null; notes: string | null; lgpd_consent: boolean | null; origem_id: string | null; created_at: string };
  const [clientes, origens, grupos, membros, historico, equipe] = await Promise.all([
    ler<C>(supabase.from('clients').select('id, name, phone, email, birthday, notes, lgpd_consent, origem_id, created_at').order('name').limit(LIMITE)),
    ler<{ id: string; nome: string }>(supabase.from('origens_cliente').select('id, nome')),
    ler<{ id: string; nome: string }>(supabase.from('grupos_cliente').select('id, nome')),
    ler<{ grupo_id: string; cliente_id: string }>(supabase.from('grupo_cliente_membros').select('grupo_id, cliente_id').limit(LIMITE)),
    ler<{ cliente_id: string; tipo: string; texto: string; created_at: string; autor_id: string | null }>(
      supabase.from('cliente_historico').select('cliente_id, tipo, texto, created_at, autor_id').order('created_at').limit(LIMITE)),
    mapaDeNomes('users', 'name'),
  ]);
  const origem = new Map(origens.map((o) => [o.id, o.nome]));
  const grupo = new Map(grupos.map((g) => [g.id, g.nome]));
  const gruposDe = new Map<string, string[]>();
  for (const m of membros) gruposDe.set(m.cliente_id, [...(gruposDe.get(m.cliente_id) ?? []), grupo.get(m.grupo_id) ?? '']);
  const nomeCliente = new Map(clientes.map((c) => [c.id, c.name]));
  return [
    {
      nome: 'Clientes',
      larguras: [32, 18, 28, 12, 16, 30, 40, 10, 14],
      linhas: [
        ['Nome', 'WhatsApp', 'E-mail', 'Aniversário', 'Origem', 'Grupos', 'Observações', 'LGPD', 'Cadastrada em'],
        ...clientes.map((c) => [
          c.name, c.phone ?? '', c.email ?? '', dataBr(c.birthday), c.origem_id ? origem.get(c.origem_id) ?? '' : '',
          (gruposDe.get(c.id) ?? []).filter(Boolean).sort().join(', '), c.notes ?? '', simNao(c.lgpd_consent), dataLocalBr(c.created_at),
        ]),
      ],
    },
    {
      nome: 'Histórico técnico',
      larguras: [32, 14, 60, 20, 12],
      linhas: [
        ['Cliente', 'Tipo', 'Registro', 'Autor', 'Data'],
        ...historico.map((h) => [nomeCliente.get(h.cliente_id) ?? '', TIPO_HISTORICO[h.tipo] ?? h.tipo, h.texto, h.autor_id ? equipe.get(h.autor_id) ?? '' : '', dataLocalBr(h.created_at)]),
      ],
    },
  ];
}

async function abasAgenda(): Promise<Aba[]> {
  type A = {
    start_time: string; end_time: string; status: string | null; is_block: boolean | null; block_reason: string | null; is_manual_reminder: boolean | null;
    client_id: string | null; professional_id: string | null; valor_cobrado: number | null; payment_method: string | null; notes: string | null;
    servicos: { nome: string } | null; services: { name: string } | null;
  };
  const [linhas, clientes, equipe] = await Promise.all([
    ler<A>(supabase.from('appointments')
      .select('start_time, end_time, status, is_block, block_reason, is_manual_reminder, client_id, professional_id, valor_cobrado, payment_method, notes, servicos ( nome ), services ( name )')
      .order('start_time').limit(LIMITE)),
    mapaDeNomes('clients', 'name'),
    mapaDeNomes('users', 'name'),
  ]);
  return [{
    nome: 'Agenda',
    larguras: [12, 8, 8, 12, 32, 22, 28, 14, 12, 14, 36],
    linhas: [
      ['Data', 'Início', 'Fim', 'Tipo', 'Cliente', 'Profissional', 'Serviço', 'Status', 'Valor (R$)', 'Pagamento', 'Observações'],
      ...linhas.map((a) => [
        dataLocalBr(a.start_time), horaBr(a.start_time), horaBr(a.end_time),
        a.is_block ? 'Bloqueio' : a.is_manual_reminder ? 'Lembrete' : 'Atendimento',
        a.client_id ? clientes.get(a.client_id) ?? '' : '', a.professional_id ? equipe.get(a.professional_id) ?? '' : '',
        a.servicos?.nome ?? a.services?.name ?? '', a.is_block ? '' : STATUS_AGENDA[a.status ?? ''] ?? a.status ?? '',
        reais(a.valor_cobrado), a.payment_method ?? '', a.is_block ? a.block_reason ?? '' : a.notes ?? '',
      ]),
    ],
  }];
}

async function abasFinanceiro(): Promise<Aba[]> {
  type L = { finance_date: string; description: string | null; type: string | null; category: string | null; escopo: string | null; amount: number | null; is_completed: boolean | null };
  type F = { periodo_inicio: string; periodo_fim: string; profissional_id: string; status: string; qtd_atendimentos: number; total_bruto: number; total_comissao: number; total_gorjetas: number; total_a_pagar: number; created_at: string };
  const [lancamentos, fechamentos, equipe] = await Promise.all([
    ler<L>(supabase.from('personal_finances').select('finance_date, description, type, category, escopo, amount, is_completed').order('finance_date').limit(LIMITE)),
    ler<F>(supabase.from('fechamentos')
      .select('periodo_inicio, periodo_fim, profissional_id, status, qtd_atendimentos, total_bruto, total_comissao, total_gorjetas, total_a_pagar, created_at')
      .order('periodo_inicio').limit(LIMITE)),
    mapaDeNomes('users', 'name'),
  ]);
  return [
    {
      nome: 'Lançamentos',
      larguras: [12, 40, 10, 14, 10, 14, 14],
      linhas: [
        ['Data', 'Descrição', 'Tipo', 'Categoria', 'Escopo', 'Valor (R$)', 'Pago/recebido'],
        ...lancamentos.map((l) => [
          dataBr(l.finance_date), l.description ?? '', l.type === 'income' ? 'Receita' : 'Despesa', l.category ?? '',
          l.escopo === 'negocio' ? 'Negócio' : 'Pessoal', reais(l.amount), simNao(l.is_completed),
        ]),
      ],
    },
    {
      nome: 'Fechamentos',
      larguras: [12, 12, 24, 22, 12, 14, 14, 12, 14, 14],
      linhas: [
        ['Início', 'Fim', 'Profissional', 'Situação', 'Atendimentos', 'Bruto (R$)', 'Comissão (R$)', 'Gorjetas (R$)', 'A pagar (R$)', 'Gerado em'],
        ...fechamentos.map((f) => [
          dataBr(f.periodo_inicio), dataBr(f.periodo_fim), equipe.get(f.profissional_id) ?? '', STATUS_FECHAMENTO[f.status] ?? f.status,
          String(f.qtd_atendimentos), reais(f.total_bruto), reais(f.total_comissao), reais(f.total_gorjetas), reais(f.total_a_pagar), dataLocalBr(f.created_at),
        ]),
      ],
    },
  ];
}

async function abasLeads(): Promise<Aba[]> {
  type L = {
    nome: string; telefone: string | null; email: string | null; origem: OrigemLead | null; interesse: string | null; resumo: string | null; etapa: EtapaLead;
    valor_estimado: number | null; proxima_acao: string | null; proxima_acao_em: string | null; motivo_perda: string | null; responsavel_id: string | null;
    fechado_em: string | null; created_at: string;
  };
  const [leads, equipe] = await Promise.all([
    ler<L>(supabase.from('leads')
      .select('nome, telefone, email, origem, interesse, resumo, etapa, valor_estimado, proxima_acao, proxima_acao_em, motivo_perda, responsavel_id, fechado_em, created_at')
      .order('created_at').limit(LIMITE)),
    mapaDeNomes('users', 'name'),
  ]);
  return [{
    nome: 'Leads',
    larguras: [30, 18, 28, 14, 24, 40, 18, 14, 30, 14, 30, 22, 12, 12],
    linhas: [
      ['Nome', 'Telefone', 'E-mail', 'Como chegou', 'Interesse', 'Resumo', 'Etapa', 'Valor estimado (R$)', 'Próxima ação', 'Data da ação', 'Motivo da perda', 'Responsável', 'Fechou em', 'Cadastrado em'],
      ...leads.map((l) => [
        l.nome, l.telefone ?? '', l.email ?? '', l.origem ? ROTULO_ORIGEM[l.origem] : '', l.interesse ?? '', l.resumo ?? '', ROTULO_ETAPA[l.etapa] ?? l.etapa,
        reais(l.valor_estimado), l.proxima_acao ?? '', dataBr(l.proxima_acao_em), l.motivo_perda ?? '',
        l.responsavel_id ? equipe.get(l.responsavel_id) ?? '' : '', dataLocalBr(l.fechado_em), dataLocalBr(l.created_at),
      ]),
    ],
  }];
}

export function abasDoBackup(tipo: TipoBackup): Promise<Aba[]> {
  switch (tipo) {
    case 'clientes': return abasClientes();
    case 'agenda': return abasAgenda();
    case 'financeiro': return abasFinanceiro();
    case 'leads': return abasLeads();
  }
}
