// Regras da agenda usadas pela tela (o banco confere tudo de novo: trava de conflito,
// valores do catálogo e permissões por profissional).

export type Evento = {
  id: string;
  start_time: string;
  end_time: string;
  status: string | null;
  professional_id: string | null;
  is_block?: boolean | null;
  is_manual_reminder?: boolean | null;
};

const ATIVOS = new Set(['scheduled', 'confirmed', 'completed']);

/** Mesma regra da restrição appointments_sem_conflito: intervalos [início, fim) sobrepostos do mesmo profissional. */
export function conflitoLocal(eventos: Evento[], profissionalId: string, inicio: Date, fim: Date, ignorarId?: string): Evento | null {
  return eventos.find((e) =>
    e.professional_id === profissionalId
    && e.id !== ignorarId
    && !e.is_manual_reminder
    && ATIVOS.has(e.status ?? 'scheduled')
    && new Date(e.start_time) < fim
    && new Date(e.end_time) > inicio) ?? null;
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
