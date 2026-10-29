// Convite de reativação por WhatsApp (fase 2): envio assistido pelo link wa.me.
// O sistema não sabe se a cliente respondeu: o resultado é marcado à mão, exceto
// "agendou", que o banco marca sozinho quando há agendamento em até 30 dias.

export type ResultadoConvite = 'enviado' | 'respondeu' | 'agendou' | 'sem_resposta' | 'nao_quer' | 'numero_errado';

export const ROTULO_RESULTADO: Record<ResultadoConvite, string> = {
  enviado: 'Enviado',
  respondeu: 'Respondeu',
  agendou: 'Agendou',
  sem_resposta: 'Sem resposta',
  nao_quer: 'Não quer contato',
  numero_errado: 'Número errado',
};

/** Resultados que a equipe marca (agendou também pode ser marcado à mão). */
export const RESULTADOS_MANUAIS: ResultadoConvite[] = ['respondeu', 'agendou', 'sem_resposta', 'nao_quer', 'numero_errado'];

export type ModeloMensagem = { id: string | null; nome: string; texto: string; padrao: boolean };

/** Sugestões até a clínica salvar os próprios modelos (sem {dias_desde}: soa como cobrança). */
export const MODELOS_SUGERIDOS: ModeloMensagem[] = [
  { id: null, nome: 'Hora de renovar', padrao: true,
    texto: 'Oi, {primeiro_nome}! Tudo bem? Aqui é da {nome_clinica}. Seu último {ultimo_servico} foi em {data_ultimo_servico}, e já está chegando a hora de renovar. Quer que eu reserve um horário com a {profissional} para você?' },
  { id: null, nome: 'Saudade', padrao: false,
    texto: 'Oi, {primeiro_nome}! Estamos com saudade de você aqui na {nome_clinica}. Quer marcar um horário? É só me responder por aqui.' },
  { id: null, nome: 'Promoção do mês', padrao: false,
    texto: 'Oi, {primeiro_nome}! Este mês a {nome_clinica} preparou uma condição especial para clientes como você. Quer saber mais e já garantir seu horário?' },
];

export const VARIAVEIS = ['primeiro_nome', 'ultimo_servico', 'data_ultimo_servico', 'dias_desde', 'profissional', 'nome_clinica', 'link_agendamento'] as const;
export type Variavel = (typeof VARIAVEIS)[number];
export type DadosConvite = Record<Variavel, string>;

export const DADOS_EXEMPLO: DadosConvite = {
  primeiro_nome: 'Ana', ultimo_servico: 'coloração', data_ultimo_servico: '12/09/2026', dias_desde: '47',
  profissional: 'Carol', nome_clinica: 'Jake Beauty', link_agendamento: '',
};

/** Troca as variáveis; variável vazia some sem deixar espaço duplo nem pontuação solta. */
export function preencherMensagem(texto: string, dados: Partial<DadosConvite>): string {
  return texto
    .replace(/\{(\w+)\}/g, (_, nome: string) => ((VARIAVEIS as readonly string[]).includes(nome) ? (dados[nome as Variavel] ?? '') : `{${nome}}`))
    .replace(/[ \t]+([,.!?:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/:\s*$/g, '')
    .trim();
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? '';

/** Celular brasileiro: DDD + 8 ou 9 dígitos, com ou sem 55. */
export function telefoneWhatsapp(telefone: string | null | undefined): string | null {
  const d = (telefone ?? '').replace(/\D/g, '');
  const local = d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
  if (local.length < 10 || local.length > 11 || local.startsWith('0')) return null;
  return `55${local}`;
}

export function linkConvite(telefone: string, texto: string): string {
  return `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}`;
}

export type Contato = {
  id: string;
  client_id: string;
  enviado_em: string;
  enviado_por: string | null;
  modelo_id: string | null;
  texto_enviado: string;
  resultado: ResultadoConvite;
  resultado_em: string | null;
  agendamento_id: string | null;
};

export const DIAS_TRAVA_PADRAO = 15;

export type Trava = { bloqueia: boolean; mensagem: string };

/** Avisos antes de abrir o WhatsApp. Só "não quer contato" e telefone inválido impedem. */
export function travasDoConvite(c: {
  naoQuerContato: boolean; telefone: string | null; proximoAgendamento: string | null; ultimoConvite: Contato | null;
}, agora = new Date(), diasTrava = DIAS_TRAVA_PADRAO): Trava[] {
  const travas: Trava[] = [];
  if (c.naoQuerContato) travas.push({ bloqueia: true, mensagem: 'A cliente pediu para não receber contato.' });
  if (!telefoneWhatsapp(c.telefone)) travas.push({ bloqueia: true, mensagem: 'Telefone inválido. Corrija o cadastro da cliente.' });
  if (c.proximoAgendamento) travas.push({ bloqueia: false, mensagem: 'A cliente já tem horário marcado.' });
  if (c.ultimoConvite) {
    const dias = Math.floor((agora.getTime() - new Date(c.ultimoConvite.enviado_em).getTime()) / 86_400_000);
    if (dias < diasTrava) travas.push({ bloqueia: false, mensagem: `Já recebeu convite há ${dias} dia(s).` });
  }
  return travas;
}

/** Último convite de cada cliente (lista vem do mais novo para o mais antigo). */
export function ultimoPorCliente(contatos: Contato[]): Map<string, Contato> {
  const m = new Map<string, Contato>();
  for (const c of contatos) {
    const atual = m.get(c.client_id);
    if (!atual || c.enviado_em > atual.enviado_em) m.set(c.client_id, c);
  }
  return m;
}

/** Convites enviados (sem resultado) há mais de N dias: candidatos ao "sem resposta" em lote. */
export function convitesParados(contatos: Contato[], agora = new Date(), dias = 7): Contato[] {
  const limite = agora.getTime() - dias * 86_400_000;
  return contatos.filter((c) => c.resultado === 'enviado' && new Date(c.enviado_em).getTime() < limite);
}

/** Indicadores do período: taxa de resposta conta quem respondeu ou agendou. */
export function indicadoresConvites(contatos: Contato[], valorDoAgendamento: Map<string, number>) {
  const enviados = contatos.length;
  const responderam = contatos.filter((c) => c.resultado === 'respondeu' || c.resultado === 'agendou').length;
  const agendaram = contatos.filter((c) => c.resultado === 'agendou');
  const faturamento = agendaram.reduce((s, c) => s + (c.agendamento_id ? valorDoAgendamento.get(c.agendamento_id) ?? 0 : 0), 0);
  const pct = (n: number) => (enviados ? Math.round((n / enviados) * 1000) / 10 : 0);
  return { enviados, taxaResposta: pct(responderam), taxaReativacao: pct(agendaram.length), faturamentoReativado: Math.round(faturamento * 100) / 100 };
}

export type FiltroConvite = { convite: 'todos' | 'nunca' | 'antigo'; diasSemConvite: number; incluirNaoQuer: boolean };
export const FILTRO_CONVITE_PADRAO: FiltroConvite = { convite: 'todos', diasSemConvite: 30, incluirNaoQuer: false };

/** Períodos do filtro "sem mensagem há mais de...", em dias. */
export const PERIODOS_SEM_CONVITE = [7, 15, 30, 60, 90, 180, 365] as const;

/** Regra do filtro para uma cliente: quem pediu para sair fica fora, salvo pedido expresso. */
export function passaFiltroConvite(
  clienteId: string, ultimo: Map<string, Contato>, naoQuer: Set<string>, f: FiltroConvite, agora = new Date(),
): boolean {
  if (!f.incluirNaoQuer && naoQuer.has(clienteId)) return false;
  const u = ultimo.get(clienteId);
  if (f.convite === 'nunca') return !u;
  if (f.convite === 'antigo') return !u || new Date(u.enviado_em).getTime() < agora.getTime() - f.diasSemConvite * 86_400_000;
  return true;
}

/** Filtros de relacionamento na lista de reativação. */
export function filtrarPorConvite<T extends { cliente_id: string }>(
  lista: T[], ultimo: Map<string, Contato>, naoQuer: Set<string>, f: FiltroConvite, agora = new Date(),
): T[] {
  return lista.filter((c) => passaFiltroConvite(c.cliente_id, ultimo, naoQuer, f, agora));
}

/** No histórico de atendimentos o padrão mostra todas, inclusive quem não quer contato. */
export const FILTRO_CONVITE_ATENDIMENTOS: FiltroConvite = { convite: 'todos', diasSemConvite: 30, incluirNaoQuer: true };

/** Mesmo filtro nos atendimentos; atendimento sem cliente só aparece sem filtro de convite. */
export function filtrarAtendimentosPorConvite<T extends { client_id: string | null }>(
  lista: T[], ultimo: Map<string, Contato>, naoQuer: Set<string>, f: FiltroConvite, agora = new Date(),
): T[] {
  return lista.filter((l) => (l.client_id ? passaFiltroConvite(l.client_id, ultimo, naoQuer, f, agora) : f.convite === 'todos' && f.incluirNaoQuer));
}
