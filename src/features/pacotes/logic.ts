// Pacotes de sessões: prévia do rateio (espelho de public.vender_pacote), situação do
// pacote e mensagens para a cliente. O que vale é o gravado pelo banco (VAL-07).

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const trunc2 = (n: number) => Math.trunc((n + Number.EPSILON) * 100) / 100;

export type FormaVenda = 'pix' | 'dinheiro' | 'debito' | 'credito' | 'outro';

export const ROTULO_FORMA_VENDA: Record<FormaVenda, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', outro: 'Outro',
};

export const VALIDADE_PADRAO_MESES = 12;

/** Data (YYYY-MM-DD) somando meses; dia 31 vira o último dia do mês de destino. */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/** Dias entre duas datas YYYY-MM-DD (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export type ItemVenda = { precoBase: number; sessoes: number };
export type ItemRateado = { valorItem: number; valorSessao: number; valorUltima: number };

/** Rateio do valor total pelo preço de tabela x sessões; o último item fecha o centavo. */
export function ratearPacote(total: number, itens: ItemVenda[]): ItemRateado[] {
  if (!itens.length) return [];
  let pesos = itens.map((i) => i.precoBase * i.sessoes);
  if (pesos.every((p) => p === 0)) pesos = itens.map((i) => i.sessoes);
  const soma = pesos.reduce((s, p) => s + p, 0);
  let acumulado = 0;
  return itens.map((i, k) => {
    const valorItem = k === itens.length - 1 ? r2(total - acumulado) : r2((total * pesos[k]) / soma);
    acumulado = r2(acumulado + valorItem);
    const valorSessao = trunc2(valorItem / i.sessoes);
    return { valorItem, valorSessao, valorUltima: r2(valorItem - valorSessao * (i.sessoes - 1)) };
  });
}

export type PagamentoVenda = { forma: FormaVenda; parcelas: number; valor: number };

/** Taxa média ponderada pelas formas de pagamento (mesma conta do banco). */
export function taxaMedia(pagamentos: PagamentoVenda[], taxas: Partial<Record<string, number>>): number {
  const total = pagamentos.reduce((s, p) => s + p.valor, 0);
  if (total <= 0) return 0;
  return r2(pagamentos.reduce((s, p) => s + p.valor * Number(taxas[p.forma] ?? 0), 0) / total);
}

export type Situacao = 'ativo' | 'a_vencer' | 'vencido' | 'esgotado' | 'anulado';

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  ativo: 'Ativo', a_vencer: 'Vence em breve', vencido: 'Vencido', esgotado: 'Concluído', anulado: 'Anulado',
};

export const COR_SITUACAO: Record<Situacao, string> = {
  ativo: 'bg-emerald-100 text-emerald-800',
  a_vencer: 'bg-amber-100 text-amber-800',
  vencido: 'bg-slate-200 text-slate-600',
  esgotado: 'bg-indigo-100 text-indigo-800',
  anulado: 'bg-slate-100 text-slate-400 line-through',
};

export const DIAS_ALERTA = 30;

/** Situação do pacote: anulado, vencido, sem saldo, vence em até 30 dias ou ativo. */
export function situacaoPacote(p: { status: string; validade: string; restantes: number }, hoje: string): Situacao {
  if (p.status === 'anulado') return 'anulado';
  if (p.validade < hoje) return 'vencido';
  if (p.restantes <= 0) return 'esgotado';
  if (diasEntre(hoje, p.validade) <= DIAS_ALERTA) return 'a_vencer';
  return 'ativo';
}

export type LinhaSaldo = {
  pacote_id: string; cliente_id: string; pacote_nome: string; status: string; validade: string; vencido: boolean;
  vendido_em: string; item_id: string; servico_id: string; servico_nome: string; sessoes: number; usadas: number;
  faltas: number; reservadas: number; disponiveis: number; valor_sessao: number | null; valor_restante: number | null;
  comissao_percentual: number | null;
};

export type PacoteAgrupado = {
  pacote_id: string; cliente_id: string; nome: string; status: string; validade: string; vendido_em: string;
  itens: LinhaSaldo[]; sessoes: number; consumidas: number; reservadas: number; restantes: number; valorRestante: number;
};

/** Junta as linhas de saldo (uma por serviço) em pacotes. */
export function agruparSaldos(linhas: LinhaSaldo[]): PacoteAgrupado[] {
  const mapa = new Map<string, PacoteAgrupado>();
  for (const l of linhas) {
    const p = mapa.get(l.pacote_id) ?? {
      pacote_id: l.pacote_id, cliente_id: l.cliente_id, nome: l.pacote_nome, status: l.status, validade: l.validade,
      vendido_em: l.vendido_em, itens: [], sessoes: 0, consumidas: 0, reservadas: 0, restantes: 0, valorRestante: 0,
    };
    p.itens.push(l);
    p.sessoes += l.sessoes;
    p.consumidas += l.usadas + l.faltas;
    p.reservadas += l.reservadas;
    p.restantes += l.sessoes - l.usadas - l.faltas;
    p.valorRestante = r2(p.valorRestante + Number(l.valor_restante ?? 0));
    mapa.set(l.pacote_id, p);
  }
  return [...mapa.values()];
}

/** Item que deve ser abatido: do serviço pedido, com saldo, vencendo primeiro. */
export function itemParaAbater(linhas: LinhaSaldo[], servicoId: string | null | undefined): LinhaSaldo | null {
  if (!servicoId) return null;
  return linhas
    .filter((l) => l.servico_id === servicoId && l.status === 'ativo' && !l.vencido && l.disponiveis > 0)
    .sort((a, b) => a.validade.localeCompare(b.validade))[0] ?? null;
}

const dataBR = (iso: string) => iso.split('-').reverse().join('/');
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || 'cliente';

/** Mensagem enviada à titular depois da baixa de uma sessão. */
export function mensagemBaixa(d: { cliente: string; servico: string; pacote: string; restantes: number; validade: string; falta?: boolean }): string {
  const restam = d.restantes === 1 ? 'Resta 1 sessão' : `Restam ${d.restantes} sessões`;
  const acao = d.falta ? `registramos a falta na sessão de ${d.servico}, que foi descontada` : `você utilizou 1 sessão de ${d.servico}`;
  return `Olá, ${primeiroNome(d.cliente)}! Hoje ${acao} do seu pacote "${d.pacote}". ${restam} deste serviço, válidas até ${dataBR(d.validade)}. Qualquer dúvida, é só responder esta mensagem.`;
}

/** Extrato resumido do pacote para enviar à cliente. */
export function mensagemExtrato(cliente: string, p: PacoteAgrupado): string {
  const linhas = p.itens.map((i) => `${i.servico_nome}: ${i.usadas + i.faltas} de ${i.sessoes} usadas, ${i.sessoes - i.usadas - i.faltas} restantes`);
  return `Olá, ${primeiroNome(cliente)}! Segue o saldo do seu pacote "${p.nome}", válido até ${dataBR(p.validade)}:\n${linhas.join('\n')}`;
}

/** Link do WhatsApp com DDI 55 para números nacionais; null se o telefone não serve. */
export function linkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  let n = (telefone ?? '').replace(/\D/g, '');
  if (n.length === 10 || n.length === 11) n = `55${n}`;
  if (n.length < 12) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}`;
}
