// Lembrete do agendamento por WhatsApp: mensagem no modelo do salão e quem ainda falta avisar.
import { dataBR, dataLocal, horaBR } from '../../lib/formatos';
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
