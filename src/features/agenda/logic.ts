// Regras da agenda usadas pela tela (o banco confere de novo valores do catálogo e
// permissões por profissional; bloqueio e horário ocupado só pedem confirmação na tela).

export type Evento = {
  id: string;
  start_time: string;
  end_time: string;
  status: string | null;
  professional_id: string | null;
  is_block?: boolean | null;
  block_reason?: string | null;
  is_manual_reminder?: boolean | null;
};

const ATIVOS = new Set(['scheduled', 'confirmed', 'completed']);

const sobrepoe = (e: Evento, profissionalId: string, inicio: Date, fim: Date, ignorarId?: string) =>
  e.professional_id === profissionalId
  && e.id !== ignorarId
  && !e.is_manual_reminder
  && ATIVOS.has(e.status ?? 'scheduled')
  && new Date(e.start_time) < fim
  && new Date(e.end_time) > inicio;

/**
 * Intervalos [início, fim) sobrepostos do mesmo profissional entre atendimento e bloqueio.
 * É só aviso: a tela pede confirmação e o banco aceita.
 */
export function conflitoLocal(eventos: Evento[], profissionalId: string, inicio: Date, fim: Date, ignorarId?: string, ehBloqueio = false): Evento | null {
  return eventos.find((e) => !!e.is_block !== ehBloqueio && sobrepoe(e, profissionalId, inicio, fim, ignorarId)) ?? null;
}

/** Atendimentos ativos no mesmo intervalo (permitido; a tela só avisa). */
export function atendimentosNoHorario(eventos: Evento[], profissionalId: string, inicio: Date, fim: Date, ignorarId?: string): Evento[] {
  return eventos.filter((e) => !e.is_block && sobrepoe(e, profissionalId, inicio, fim, ignorarId));
}

/** Mensagem amigável para erros de agenda vindos do banco. */
export function mensagemAgenda(e: unknown): string | null {
  const erro = e as { code?: string; message?: string };
  if (erro?.code === '23P01' || /appointments_sem_conflito/.test(erro?.message ?? '')) {
    return 'Conflito de horário: este profissional já tem atendimento ou bloqueio nesse intervalo.';
  }
  if (erro?.code === '23514' && /appointments_horario_check/.test(erro?.message ?? '')) return 'O horário final deve ser depois do inicial.';
  return null;
}

export type Faixa = { inicioMin: number; fimMin: number };

/** Posição do evento na linha do tempo do dia (em minutos desde a meia-noite local), recortada à janela visível. */
export function posicaoNaLinha(inicio: Date, fim: Date, janela: Faixa): { topo: number; altura: number } | null {
  const ini = inicio.getHours() * 60 + inicio.getMinutes();
  const fi = fim.getDate() !== inicio.getDate() ? 24 * 60 : fim.getHours() * 60 + fim.getMinutes();
  const a = Math.max(ini, janela.inicioMin);
  const b = Math.min(fi, janela.fimMin);
  if (b <= a) return null;
  const total = janela.fimMin - janela.inicioMin;
  return { topo: ((a - janela.inicioMin) / total) * 100, altura: ((b - a) / total) * 100 };
}

/** Distribui eventos sobrepostos (ex.: lembretes) lado a lado na mesma coluna. */
export function colunasSobrepostas<T extends { start_time: string; end_time: string }>(lista: T[]): (T & { faixa: number; faixas: number })[] {
  const ordenados = [...lista].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const saida: (T & { faixa: number; faixas: number })[] = [];
  let grupo: (T & { faixa: number; faixas: number })[] = [];
  let fimGrupo = 0;
  const fecha = () => { const n = Math.max(...grupo.map((g) => g.faixa)) + 1; grupo.forEach((g) => { g.faixas = n; }); saida.push(...grupo); grupo = []; };
  for (const e of ordenados) {
    const ini = new Date(e.start_time).getTime();
    if (grupo.length && ini >= fimGrupo) fecha();
    const ocupadas = new Set(grupo.filter((g) => new Date(g.end_time).getTime() > ini).map((g) => g.faixa));
    let faixa = 0;
    while (ocupadas.has(faixa)) faixa++;
    grupo.push({ ...e, faixa, faixas: 1 });
    fimGrupo = Math.max(fimGrupo, new Date(e.end_time).getTime());
  }
  if (grupo.length) fecha();
  return saida;
}

/** Ocupa a agenda: atendimento ativo ou bloqueio, nunca lembrete. */
export const ocupaAgenda = (e: Evento) => !e.is_manual_reminder && ATIVOS.has(e.status ?? 'scheduled');

/** Serviço ainda não salvo do agendamento com vários serviços (data e hora locais, "AAAA-MM-DD" e "HH:MM"). */
export type ItemAgendamento = {
  chave: string;
  profissionalId: string;
  servicoId: string | null;
  servicoNome: string;
  data: string;
  hora: string;
  minutos: number;
  valor: number | null;
  valorExibido: number | null;
  pacoteItemId: string | null;
};

export const inicioDoItem = (it: Pick<ItemAgendamento, 'data' | 'hora'>) => new Date(`${it.data}T${it.hora}:00`);
export const fimDoItem = (it: Pick<ItemAgendamento, 'data' | 'hora' | 'minutos'>) => new Date(inicioDoItem(it).getTime() + it.minutos * 60000);
export const hhmmLocal = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Itens da lista como eventos da agenda, para conferir conflito entre eles e mostrar na grade. */
export const itensComoEventos = (itens: ItemAgendamento[]): Evento[] => itens.map((it) => ({
  id: `item:${it.chave}`, start_time: inicioDoItem(it).toISOString(), end_time: fimDoItem(it).toISOString(),
  status: 'scheduled', professional_id: it.profissionalId,
}));

/** Bloqueio no horário do item (permitido; a tela pede confirmação). */
export function conflitoDoItem(eventos: Evento[], item: ItemAgendamento): Evento | null {
  return conflitoLocal(eventos, item.profissionalId, inicioDoItem(item), fimDoItem(item));
}

/** Itens que caem em horário já ocupado por atendimento (da agenda ou de outro item da lista), para avisar. */
export function itensSobrepostos(eventos: Evento[], itens: ItemAgendamento[]): ItemAgendamento[] {
  return itens.filter((it) => {
    const outros = itensComoEventos(itens.filter((x) => x.chave !== it.chave));
    return atendimentosNoHorario([...eventos, ...outros], it.profissionalId, inicioDoItem(it), fimDoItem(it)).length > 0;
  });
}

/** Intervalos livres da janela, descontando os ocupados; só os que comportam `minimoMin`. */
export function intervalosLivres(ocupados: { inicio: Date; fim: Date }[], janelaIni: Date, janelaFim: Date, minimoMin: number): { inicio: Date; fim: Date }[] {
  const ordenados = [...ocupados].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const livres: { inicio: Date; fim: Date }[] = [];
  let cursor = janelaIni.getTime();
  const fecha = (ate: number) => {
    if (ate - cursor >= minimoMin * 60000) livres.push({ inicio: new Date(cursor), fim: new Date(ate) });
  };
  for (const o of ordenados) {
    const a = o.inicio.getTime(); const b = o.fim.getTime();
    if (b <= cursor) continue;
    if (a >= janelaFim.getTime()) break;
    if (a > cursor) fecha(Math.min(a, janelaFim.getTime()));
    cursor = Math.max(cursor, b);
  }
  if (cursor < janelaFim.getTime()) fecha(janelaFim.getTime());
  return livres;
}

/** Repetição do bloqueio de horário. Mensal mantém o dia do mês (ou o último dia, se o mês for menor). */
export type RepeticaoBloqueio = 'nao' | 'diaria' | 'semanal' | 'mensal';
export type TerminoRepeticao = { tipo: 'data'; ate: string } | { tipo: 'vezes'; vezes: number };
/** Limite de bloqueios criados de uma vez (um ano de bloqueio diário). */
export const BLOQUEIO_MAX_REPETICOES = 366;

const pad2 = (n: number) => String(n).padStart(2, '0');

function dataDaVez(inicio: string, freq: Exclude<RepeticaoBloqueio, 'nao'>, i: number): string {
  const [ano, mes, dia] = inicio.split('-').map(Number);
  if (freq === 'mensal') {
    const m0 = mes - 1 + i;
    const a = ano + Math.floor(m0 / 12);
    const m = (m0 % 12) + 1;
    return `${a}-${pad2(m)}-${pad2(Math.min(dia, new Date(a, m, 0).getDate()))}`;
  }
  const d = new Date(Date.UTC(ano, mes - 1, dia + i * (freq === 'semanal' ? 7 : 1)));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Datas (AAAA-MM-DD) do bloqueio, a primeira incluída. Termina numa data (inclusive) ou após N vezes.
 * Devolve uma mensagem quando o término é inválido ou passa do limite.
 */
export function datasDoBloqueio(inicio: string, freq: RepeticaoBloqueio, termino: TerminoRepeticao): string[] | string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return 'Informe a data.';
  if (freq === 'nao') return [inicio];
  if (termino.tipo === 'vezes') {
    if (!Number.isInteger(termino.vezes) || termino.vezes < 2) return 'Repita pelo menos 2 vezes.';
    if (termino.vezes > BLOQUEIO_MAX_REPETICOES) return `No máximo ${BLOQUEIO_MAX_REPETICOES} repetições por vez.`;
    return Array.from({ length: termino.vezes }, (_, i) => dataDaVez(inicio, freq, i));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(termino.ate)) return 'Informe quando a repetição termina.';
  if (termino.ate <= inicio) return 'A data final da repetição deve ser depois da data do bloqueio.';
  const datas: string[] = [];
  for (let i = 0; ; i++) {
    const d = dataDaVez(inicio, freq, i);
    if (d > termino.ate) break;
    if (datas.length === BLOQUEIO_MAX_REPETICOES) return `No máximo ${BLOQUEIO_MAX_REPETICOES} repetições por vez; escolha uma data final mais próxima.`;
    datas.push(d);
  }
  return datas;
}

/**
 * Repetição do lembrete manual: no mês seguinte, por 2 meses, todo mês (24 meses no total,
 * como antes) ou um número de meses escolhido. Os meses são contados depois do primeiro lembrete.
 */
export type RepeticaoLembrete = 'nao' | 'seguinte' | 'dois' | 'todo' | 'personalizado';
/** Total de lembretes numa série (o primeiro incluído); o banco aceita de 1 a 24. */
export const LEMBRETE_MAX_MESES = 24;

/** Quantidade total de lembretes (primeiro incluído) ou mensagem quando o número é inválido. */
export function mesesDoLembrete(rep: RepeticaoLembrete, personalizado: string | number = ''): number | string {
  if (rep === 'nao') return 1;
  if (rep === 'seguinte') return 2;
  if (rep === 'dois') return 3;
  if (rep === 'todo') return LEMBRETE_MAX_MESES;
  const n = Number(personalizado);
  if (!Number.isInteger(n) || n < 1 || n > LEMBRETE_MAX_MESES - 1) return `Repita por 1 a ${LEMBRETE_MAX_MESES - 1} meses.`;
  return n + 1;
}

/** Datas (AAAA-MM-DD) dos lembretes da série, mantendo o dia (ou o último dia do mês menor). */
export const datasDoLembrete = (inicio: string, meses: number): string[] =>
  Array.from({ length: meses }, (_, i) => dataDaVez(inicio, 'mensal', i));

export type CompromissoCliente = {
  id: string;
  start_time: string;
  client_id?: string | null;
  status?: string | null;
  is_block?: boolean | null;
  is_manual_reminder?: boolean | null;
  recurring_group_id?: string | null;
  return_reminder_date?: string | null;
};
export type CompromissoFuturo = { tipo: 'atendimento' | 'lembrete' | 'retorno'; data: Date | string; id: string; serie: number };

/**
 * Atendimentos, lembretes manuais e retornos da cliente a partir de `agora` (ordem de data),
 * para avisar antes de criar outro e evitar duplicidade. Série de lembretes aparece uma vez
 * (a próxima data), com o total restante em `serie`.
 */
export function compromissosFuturos(eventos: CompromissoCliente[], clienteId: string, agora: Date): CompromissoFuturo[] {
  const hoje = `${agora.getFullYear()}-${pad2(agora.getMonth() + 1)}-${pad2(agora.getDate())}`;
  const lista: CompromissoFuturo[] = [];
  const series = new Map<string, CompromissoFuturo>();
  for (const e of eventos) {
    if (e.client_id !== clienteId || e.is_block) continue;
    if (e.is_manual_reminder) {
      if (e.status === 'cancelled' || new Date(e.start_time) < agora) continue;
      const item: CompromissoFuturo = { tipo: 'lembrete', data: new Date(e.start_time), id: e.id, serie: 1 };
      const g = e.recurring_group_id;
      const ja = g ? series.get(g) : undefined;
      if (ja) { ja.serie++; if (item.data < ja.data) { ja.data = item.data; ja.id = item.id; } continue; }
      if (g) series.set(g, item);
      lista.push(item);
      continue;
    }
    if (ATIVOS.has(e.status ?? 'scheduled') && e.status !== 'completed' && new Date(e.start_time) >= agora) {
      lista.push({ tipo: 'atendimento', data: new Date(e.start_time), id: e.id, serie: 1 });
    }
    if (e.return_reminder_date && e.return_reminder_date >= hoje) {
      lista.push({ tipo: 'retorno', data: e.return_reminder_date, id: `ret-${e.id}`, serie: 1 });
    }
  }
  const chave = (c: CompromissoFuturo) => (typeof c.data === 'string' ? `${c.data}T00:00` : c.data.toISOString());
  return lista.sort((a, b) => chave(a).localeCompare(chave(b)));
}

/** Lembrete de retorno criado junto com o atendimento: em 1 mês, 2 meses ou outro número de meses. */
export type RetornoAtendimento = 'nao' | '1' | '2' | 'outro';
export const RETORNO_MAX_MESES = 24;

/** Meses até o retorno (0 = sem lembrete) ou mensagem quando o número é inválido. */
export function mesesDoRetorno(op: RetornoAtendimento, outro: string | number = ''): number | string {
  if (op === 'nao') return 0;
  if (op !== 'outro') return Number(op);
  const n = Number(outro);
  if (!Number.isInteger(n) || n < 1 || n > RETORNO_MAX_MESES) return `Retorno entre 1 e ${RETORNO_MAX_MESES} meses.`;
  return n;
}

/** Data (AAAA-MM-DD) do retorno: mesmo dia, N meses depois (último dia se o mês for menor). */
export const dataDoRetorno = (data: string, meses: number): string => dataDaVez(data, 'mensal', meses);
