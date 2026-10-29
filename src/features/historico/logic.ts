// Histórico de atendimentos e reativação de clientes (fase 1 da especificação de reativação).
// Regras de data em dias locais (aaaa-mm-dd), sem fuso no meio da conta.
import type { FormaPagamento, StatusAgendamento } from '../comissoes/logic';

export type SituacaoRetorno = 'em_dia' | 'proximo' | 'vencido' | 'inativa' | 'perdida';

export const ROTULO_SITUACAO_RETORNO: Record<SituacaoRetorno, string> = {
  em_dia: 'Em dia',
  proximo: 'Retorno próximo',
  vencido: 'Retorno vencido',
  inativa: 'Inativa',
  perdida: 'Perdida',
};

export const SITUACOES_RETORNO: SituacaoRetorno[] = ['vencido', 'proximo', 'em_dia', 'inativa', 'perdida'];

/** Limites da especificação; a clínica poderá ajustar quando houver tela de configuração. */
export const LIMITES_PADRAO = { proximoDias: 7, inativaDias: 90, perdidaDias: 180, cicloPadraoDias: 45 };
export type Limites = typeof LIMITES_PADRAO;

/** Linha devolvida por public.clientes_reativacao(). */
export type ClienteReativacao = {
  cliente_id: string;
  nome: string;
  telefone: string | null;
  ultimo_atendimento: string;
  ultimo_servico: string | null;
  ultimo_profissional: string | null;
  retorno_ciclo_dias: number | null;
  visitas_12m: number;
  intervalo_medio_dias: number | null;
  total_12m: number;
  ticket_medio_12m: number | null;
  proximo_agendamento: string | null;
};

export type OrigemCiclo = 'servico' | 'media' | 'padrao';

export type Retorno = {
  ultimoDia: string;
  previsto: string;
  cicloDias: number;
  origemCiclo: OrigemCiclo;
  /** Dias passados do retorno previsto (0 se ainda não venceu). */
  atrasoDias: number;
  diasSemVir: number;
  situacao: SituacaoRetorno;
};

const MS_DIA = 86_400_000;
const utc = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d); };

export function diasEntre(de: string, ate: string): number {
  return Math.round((utc(ate) - utc(de)) / MS_DIA);
}

export function somarDias(iso: string, dias: number): string {
  return new Date(utc(iso) + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Dia local (aaaa-mm-dd) de um instante. */
export function diaLocal(instante: string | Date): string {
  const d = typeof instante === 'string' ? new Date(instante) : instante;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Retorno previsto: ciclo do serviço (o menor do último atendimento); sem ciclo, o intervalo
 * médio da própria cliente; sem histórico, o padrão (45 dias).
 */
export function retornoDaCliente(
  c: Pick<ClienteReativacao, 'ultimo_atendimento' | 'retorno_ciclo_dias' | 'intervalo_medio_dias'>,
  hoje: string,
  lim: Limites = LIMITES_PADRAO,
): Retorno {
  const ultimoDia = diaLocal(c.ultimo_atendimento);
  const media = c.intervalo_medio_dias ? Math.round(Number(c.intervalo_medio_dias)) : null;
  const [cicloDias, origemCiclo]: [number, OrigemCiclo] = c.retorno_ciclo_dias
    ? [c.retorno_ciclo_dias, 'servico']
    : media && media > 0 ? [media, 'media'] : [lim.cicloPadraoDias, 'padrao'];
  const previsto = somarDias(ultimoDia, cicloDias);
  const diasSemVir = diasEntre(ultimoDia, hoje);
  const faltam = diasEntre(hoje, previsto);
  const situacao: SituacaoRetorno =
    diasSemVir > lim.perdidaDias ? 'perdida'
      : diasSemVir > lim.inativaDias ? 'inativa'
        : faltam < 0 ? 'vencido'
          : faltam <= lim.proximoDias ? 'proximo' : 'em_dia';
  return { ultimoDia, previsto, cicloDias, origemCiclo, atrasoDias: Math.max(0, -faltam), diasSemVir, situacao };
}

export type ClienteComRetorno = ClienteReativacao & { retorno: Retorno };

export type FiltrosReativar = { situacoes: SituacaoRetorno[]; semAgendamentoFuturo: boolean; busca: string };

export const FILTROS_REATIVAR_PADRAO: FiltrosReativar = { situacoes: ['vencido', 'proximo', 'inativa'], semAgendamentoFuturo: true, busca: '' };

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const digitos = (t: string) => t.replace(/\D/g, '');

function bateBusca(nome: string, telefone: string | null, busca: string): boolean {
  const t = normalizar(busca);
  if (!t) return true;
  const d = digitos(busca);
  return normalizar(nome).includes(t) || (d.length >= 3 && digitos(telefone ?? '').includes(d));
}

/** Ordem da especificação: retorno vencido primeiro, depois maior valor, depois mais dias sem vir. */
export function ordenarParaReativar(lista: ClienteComRetorno[]): ClienteComRetorno[] {
  return [...lista].sort((a, b) =>
    Number(b.retorno.atrasoDias > 0) - Number(a.retorno.atrasoDias > 0)
    || Number(b.total_12m) - Number(a.total_12m)
    || b.retorno.diasSemVir - a.retorno.diasSemVir);
}

export function clientesParaReativar(lista: ClienteReativacao[], f: FiltrosReativar, hoje: string, lim: Limites = LIMITES_PADRAO): ClienteComRetorno[] {
  const situacoes = new Set(f.situacoes);
  return ordenarParaReativar(lista
    .map((c) => ({ ...c, retorno: retornoDaCliente(c, hoje, lim) }))
    .filter((c) => (situacoes.size === 0 || situacoes.has(c.retorno.situacao))
      && (!f.semAgendamentoFuturo || !c.proximo_agendamento)
      && bateBusca(c.nome, c.telefone, f.busca)));
}

export function indicadoresRetorno(lista: ClienteReativacao[], hoje: string, lim: Limites = LIMITES_PADRAO) {
  const cont: Record<SituacaoRetorno, number> = { em_dia: 0, proximo: 0, vencido: 0, inativa: 0, perdida: 0 };
  for (const c of lista) cont[retornoDaCliente(c, hoje, lim).situacao]++;
  return { ativas: cont.em_dia + cont.proximo + cont.vencido, vencido: cont.vencido, inativas: cont.inativa, perdidas: cont.perdida };
}

// ----- Visão "Atendimentos" -----

export type Atalho = 'hoje' | '7dias' | 'mes' | 'mes_anterior' | 'personalizado';

export function periodoDoAtalho(atalho: Exclude<Atalho, 'personalizado'>, hoje: string): { de: string; ate: string } {
  const [a, m] = hoje.split('-').map(Number);
  const fimDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  switch (atalho) {
    case 'hoje': return { de: hoje, ate: hoje };
    case '7dias': return { de: somarDias(hoje, -6), ate: hoje };
    case 'mes': return { de: `${hoje.slice(0, 7)}-01`, ate: fimDoMes(a, m) };
    case 'mes_anterior': {
      const [ano, mes] = m === 1 ? [a - 1, 12] : [a, m - 1];
      return { de: `${ano}-${String(mes).padStart(2, '0')}-01`, ate: fimDoMes(ano, mes) };
    }
  }
}

export type LinhaHistorico = {
  id: string;
  start_time: string;
  status: StatusAgendamento;
  valor_cobrado: number | null;
  payment_method: string | null;
  professional_id: string | null;
  client_id: string | null;
  servico_id: string | null;
  cliente_nome: string;
  servico_nome: string;
  profissional_nome: string;
};

export type FiltrosAtendimentos = {
  profissional: string;
  servico: string;
  categoria: string;
  status: StatusAgendamento | '';
  forma: FormaPagamento | '';
  busca: string;
};

export const FILTROS_ATENDIMENTOS_PADRAO: FiltrosAtendimentos = { profissional: '', servico: '', categoria: '', status: '', forma: '', busca: '' };

export function filtrarAtendimentos(
  linhas: LinhaHistorico[],
  f: FiltrosAtendimentos,
  categoriaDoServico: Map<string, string>,
  telefoneDaCliente: Map<string, string | null>,
): LinhaHistorico[] {
  return linhas.filter((l) =>
    (!f.profissional || l.professional_id === f.profissional)
    && (!f.servico || l.servico_id === f.servico)
    && (!f.categoria || (l.servico_id !== null && categoriaDoServico.get(l.servico_id) === f.categoria))
    && (!f.status || l.status === f.status)
    && (!f.forma || l.payment_method === f.forma)
    && bateBusca(l.cliente_nome, l.client_id ? telefoneDaCliente.get(l.client_id) ?? null : null, f.busca));
}

/** Totais como no relatório de comissões: só atendimentos concluídos entram no faturamento. */
export function totaisAtendimentos(linhas: LinhaHistorico[]) {
  const realizados = linhas.filter((l) => l.status === 'completed');
  const faturamento = Math.round(realizados.reduce((s, l) => s + Number(l.valor_cobrado ?? 0), 0) * 100) / 100;
  return {
    quantidade: linhas.length,
    realizados: realizados.length,
    faturamento,
    ticketMedio: realizados.length ? Math.round((faturamento / realizados.length) * 100) / 100 : 0,
  };
}

export const ROTULO_STATUS_ATENDIMENTO: Record<StatusAgendamento, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  completed: 'Realizado',
  cancelled: 'Cancelado',
  no_show: 'Faltou',
};
