// Checkout de vários atendimentos da mesma cliente no mesmo dia, numa única cobrança.
// A agenda continua mostrando cada serviço no seu horário; o checkout junta todos.
import { dataLocal } from '../../lib/formatos';
import type { LinhaSaldo } from '../pacotes/logic';

export type AtendimentoCheckout = {
  id: string;
  client_id: string | null;
  start_time: string;
  end_time: string;
  status: string | null;
  is_block?: boolean | null;
  is_manual_reminder?: boolean | null;
  servico_id?: string | null;
  pacote_item_id?: string | null;
};

const ABERTOS = new Set(['scheduled', 'confirmed']);

/** O atendimento escolhido e os demais em aberto da mesma cliente no mesmo dia (qualquer profissional), por horário. */
export function atendimentosDoCheckout<T extends AtendimentoCheckout>(principal: T, todos: T[]): T[] {
  if (!principal.client_id) return [principal];
  const dia = dataLocal(principal.start_time);
  const outros = todos.filter((a) => a.id !== principal.id && a.client_id === principal.client_id && !a.is_block && !a.is_manual_reminder
    && ABERTOS.has(a.status ?? 'scheduled') && dataLocal(a.start_time) === dia);
  return [principal, ...outros].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

/**
 * Sessão de pacote de cada atendimento: a reservada no agendamento ou a do mesmo serviço que
 * vence primeiro, sem usar a mesma sessão disponível duas vezes.
 */
export function pacotesPorAtendimento(itens: Pick<AtendimentoCheckout, 'id' | 'servico_id' | 'pacote_item_id'>[], saldos: LinhaSaldo[]): Map<string, LinhaSaldo | null> {
  const restantes = new Map(saldos.map((l) => [l.item_id, l.disponiveis]));
  const mapa = new Map<string, LinhaSaldo | null>();
  for (const it of itens) {
    if (it.pacote_item_id) {
      mapa.set(it.id, saldos.find((l) => l.item_id === it.pacote_item_id) ?? null);
      continue;
    }
    const linha = it.servico_id
      ? saldos
        .filter((l) => l.servico_id === it.servico_id && l.status === 'ativo' && !l.vencido && (restantes.get(l.item_id) ?? 0) > 0)
        .sort((a, b) => a.validade.localeCompare(b.validade))[0] ?? null
      : null;
    if (linha) restantes.set(linha.item_id, (restantes.get(linha.item_id) ?? 0) - 1);
    mapa.set(it.id, linha);
  }
  return mapa;
}

export type LinhaCobranca = { incluir: boolean; pacote: boolean; valor: number | null };

/** Total a cobrar agora: atendimentos incluídos e pagos à parte, mais extras (a gorjeta fica à parte). */
export function totalCobranca(linhas: LinhaCobranca[], extras = 0): number {
  const soma = linhas.reduce((s, l) => s + (l.incluir && !l.pacote ? l.valor ?? 0 : 0), 0) + extras;
  return Math.round(soma * 100) / 100;
}

/** Fim do último atendimento: os serviços extras começam dali. */
export const fimDoUltimo = (itens: Pick<AtendimentoCheckout, 'end_time'>[]) =>
  new Date(Math.max(...itens.map((i) => new Date(i.end_time).getTime())));
