// Lançamentos recorrentes: datas semanais ou mensais a partir de uma data inicial.

export type Frequencia = 'semanal' | 'mensal';

/** Quantidade sugerida ao marcar "repetir" (o primeiro lançamento incluído). */
export const VEZES_PADRAO: Record<Frequencia, number> = { mensal: 12, semanal: 4 };
/** Limites de repetições numa série (evita criar centenas de linhas por engano). */
export const VEZES_MIN = 2;
export const VEZES_MAX = 60;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Datas mensais (YYYY-MM-DD) a partir de `inicio`, mantendo o mesmo dia do mês.
 * Quando o mês não tem esse dia (ex.: 31 em fevereiro), usa o último dia do mês.
 */
export function datasMensais(inicio: string, quantidade: number = VEZES_PADRAO.mensal): string[] {
  const [ano, mes, dia] = inicio.split('-').map(Number);
  const datas: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    const m0 = mes - 1 + i;
    const a = ano + Math.floor(m0 / 12);
    const m = (m0 % 12) + 1;
    const ultimoDia = new Date(a, m, 0).getDate();
    datas.push(`${a}-${pad(m)}-${pad(Math.min(dia, ultimoDia))}`);
  }
  return datas;
}

/** Datas semanais (YYYY-MM-DD) a partir de `inicio`, de 7 em 7 dias (sem efeito de fuso). */
export function datasSemanais(inicio: string, quantidade: number = VEZES_PADRAO.semanal): string[] {
  const [ano, mes, dia] = inicio.split('-').map(Number);
  return Array.from({ length: quantidade }, (_, i) => {
    const d = new Date(Date.UTC(ano, mes - 1, dia + i * 7));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  });
}

/** Repetições válidas: inteiro entre VEZES_MIN e VEZES_MAX (fora disso, null). */
export function vezesValidas(valor: string | number): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n >= VEZES_MIN && n <= VEZES_MAX ? n : null;
}

export function datasRecorrentes(inicio: string, frequencia: Frequencia, quantidade: number): string[] {
  return frequencia === 'semanal' ? datasSemanais(inicio, quantidade) : datasMensais(inicio, quantidade);
}

/** "2027-09-10" -> "09/2027" */
export const mesAno = (data: string) => `${data.slice(5, 7)}/${data.slice(0, 4)}`;
/** "2027-09-10" -> "10/09/2027" */
export const diaMesAno = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
