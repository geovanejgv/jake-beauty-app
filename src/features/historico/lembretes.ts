// Lembretes de contato (fase 3 da reativação): faixa própria na agenda, sem ocupar
// horário de profissional. Datas em dia local (aaaa-mm-dd).
import { somarDias } from './logic';
import type { Contato } from './convites';

export type StatusLembrete = 'pendente' | 'concluido' | 'cancelado';

export type Lembrete = {
  id: string;
  client_id: string;
  data: string;
  hora: string | null;
  responsavel_id: string | null;
  modelo_id: string | null;
  observacao: string | null;
  status: StatusLembrete;
};

export const ADIAMENTOS = [3, 7, 15] as const;
export const DIAS_APOS_SEM_RESPOSTA = 15;

const maior = (a: string, b: string) => (a > b ? a : b);

/**
 * Sugestão da especificação: 15 dias depois de um convite sem retorno; senão o retorno
 * previsto pelo ciclo do serviço. Nunca antes de hoje.
 */
export function sugerirDataLembrete(o: { retornoPrevisto: string | null; ultimoConvite: Contato | null }, hoje: string): string {
  const u = o.ultimoConvite;
  if (u && (u.resultado === 'enviado' || u.resultado === 'sem_resposta')) {
    return maior(hoje, somarDias(u.enviado_em.slice(0, 10), DIAS_APOS_SEM_RESPOSTA));
  }
  return o.retornoPrevisto ? maior(hoje, o.retornoPrevisto) : hoje;
}

/** Adiar conta a partir de hoje quando o lembrete já está atrasado. */
export function adiar(data: string, dias: number, hoje: string): string {
  return somarDias(maior(data, hoje), dias);
}

/** Pendentes que aparecem no dia: os do dia e, no dia de hoje, também os atrasados. */
export function lembretesDoDia(lista: Lembrete[], dia: string, hoje: string): Lembrete[] {
  return lista
    .filter((l) => l.status === 'pendente' && (l.data === dia || (dia === hoje && l.data < hoje)))
    .sort((a, b) => a.data.localeCompare(b.data) || (a.hora ?? '99').localeCompare(b.hora ?? '99'));
}

/** "X contatos para hoje": pendentes de hoje e atrasados. */
export function contatosParaHoje(lista: Lembrete[], hoje: string): number {
  return lista.filter((l) => l.status === 'pendente' && l.data <= hoje).length;
}

/** Próximo lembrete pendente de cada cliente. */
export function proximoPorCliente(lista: Lembrete[]): Map<string, Lembrete> {
  const m = new Map<string, Lembrete>();
  for (const l of lista) {
    if (l.status !== 'pendente') continue;
    const atual = m.get(l.client_id);
    if (!atual || l.data < atual.data) m.set(l.client_id, l);
  }
  return m;
}
