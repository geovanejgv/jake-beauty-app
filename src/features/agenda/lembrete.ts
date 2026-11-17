// Lembrete do agendamento por WhatsApp: mensagem no modelo do salão e quem ainda falta avisar.
import { brl, dataBR, dataLocal, FUSO, horaBR } from '../../lib/formatos';
import { linkWhatsapp } from '../leads/logic';

export type AgendamentoLembrete = {
  id: string;
  start_time: string;
  status: string | null;
  client_id: string | null;
  professional_id: string | null;
  is_block?: boolean | null;
  is_manual_reminder?: boolean | null;
  lembrete_enviado_em?: string | null;
  clients: { name: string; phone: string | null; contato_visivel: boolean } | null;
  services: { name: string };
};

export type SituacaoLembrete = 'pronto' | 'enviado' | 'sem_telefone' | 'contato_restrito';

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || 'tudo bem';

/** "Olá, Ana, passando pra lembrar do seu procedimento Escova no dia 05/11/2026 e no horário 14:00. Até logo." */
export function mensagemLembrete(nome: string, procedimento: string, inicio: string | Date): string {
  return `Olá, ${primeiroNome(nome)}, passando pra lembrar do seu procedimento ${procedimento.trim() || 'agendado'} no dia ${dataBR(inicio)} e no horário ${horaBR(inicio)}. Até logo.`;
}

/** Telefone com DDD (10 ou 11 dígitos, com ou sem 55); mascarado ou incompleto não serve. */
export function telefoneValido(telefone: string | null | undefined): boolean {
  const d = (telefone ?? '').replace(/\D/g, '');
  return d.length === 10 || d.length === 11 || ((d.length === 12 || d.length === 13) && d.startsWith('55'));
}

export function situacaoLembrete(a: AgendamentoLembrete): SituacaoLembrete {
  if (!a.clients?.contato_visivel) return 'contato_restrito';
  if (!telefoneValido(a.clients.phone)) return 'sem_telefone';
  return a.lembrete_enviado_em ? 'enviado' : 'pronto';
}

export const linkLembrete = (a: AgendamentoLembrete) =>
  linkWhatsapp(a.clients?.phone ?? '', mensagemLembrete(a.clients?.name ?? '', a.services.name, a.start_time));

/** Atendimentos de cliente cadastrada, ainda por acontecer (agendado ou confirmado), no dia (fuso do salão). */
export function agendamentosParaLembrar<T extends AgendamentoLembrete>(lista: T[], dia: string): T[] {
  return lista
    .filter((a) => !!a.client_id && !a.is_block && !a.is_manual_reminder
      && ['scheduled', 'confirmed'].includes(a.status ?? 'scheduled')
      && dataLocal(a.start_time) === dia)
    .sort((x, y) => x.start_time.localeCompare(y.start_time));
}

/** Dia seguinte (YYYY-MM-DD), a data padrão para lembrar as clientes. */
export function diaSeguinte(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type RetornoLembrete = AgendamentoLembrete & {
  return_reminder_date?: string | null;
  return_reminder_sent_at?: string | null;
};

/**
 * Lembretes de retorno do dia (a cliente deve ser chamada para agendar de novo):
 * o retorno marcado num atendimento ou o lembrete manual, que fica na data do horário.
 */
export function retornosDoDia<T extends RetornoLembrete>(lista: T[], dia: string): T[] {
  return lista
    .filter((a) => !!a.client_id && !a.is_block
      && (a.is_manual_reminder ? dataLocal(a.start_time) === dia : a.return_reminder_date === dia))
    .sort((x, y) => (x.clients?.name ?? '').localeCompare(y.clients?.name ?? '', 'pt-BR'));
}

export function situacaoRetorno(a: RetornoLembrete): SituacaoLembrete {
  if (!a.clients?.contato_visivel) return 'contato_restrito';
  if (!telefoneValido(a.clients.phone)) return 'sem_telefone';
  return a.return_reminder_sent_at ? 'enviado' : 'pronto';
}

/** Um serviço do agendamento na mensagem de confirmação. */
export type ItemConfirmacao = {
  inicio: string | Date;
  servico: string;
  profissional?: string | null;
  valor?: number | null;
  pacote?: boolean;
};

const diaDaSemana = (d: string | Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long' }).format(typeof d === 'string' ? new Date(d) : d);

/**
 * Confirmação do agendamento por WhatsApp com os dados do dia: data, dia da semana, horário,
 * serviço(s), profissional e valor (sessão de pacote aparece como "sessão do pacote").
 */
export function mensagemConfirmacao(nome: string, itens: ItemConfirmacao[], estabelecimento?: string | null, mostrarValor = true): string {
  const lista = [...itens].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  if (!lista.length) return '';
  const primeiro = lista[0].inicio;
  const linha = (it: ItemConfirmacao) => {
    const partes = [`*${horaBR(it.inicio)}* ${it.servico.trim() || 'Procedimento'}`];
    if (it.profissional) partes.push(`com ${it.profissional}`);
    if (it.pacote) partes.push('(sessão do pacote)');
    else if (mostrarValor && it.valor != null) partes.push(`(${brl(it.valor)})`);
    return `- ${partes.join(' ')}`;
  };
  const total = lista.reduce((t, it) => t + (it.pacote ? 0 : Number(it.valor ?? 0)), 0);
  return [
    `Olá, ${primeiroNome(nome)}! Tudo bem?`,
    '',
    `Aqui é ${estabelecimento?.trim() ? `do *${estabelecimento.trim()}*` : 'do salão'}. Passando para confirmar o seu agendamento:`,
    '',
    `*Data:* ${dataBR(primeiro)} (${diaDaSemana(primeiro)})`,
    ...lista.map(linha),
    ...(mostrarValor && lista.length > 1 && total > 0 ? [`*Total:* ${brl(total)}`] : []),
    '',
    'Posso confirmar a sua presença? Responda *SIM* para confirmar ou me avise se precisar remarcar.',
  ].join('\n');
}
