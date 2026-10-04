// Lançamentos recorrentes: datas mensais a partir de uma data inicial.

/** Quantos meses são criados para um lançamento recorrente (o primeiro incluído). */
export const MESES_RECORRENCIA = 12;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Datas mensais (YYYY-MM-DD) a partir de `inicio`, mantendo o mesmo dia do mês.
 * Quando o mês não tem esse dia (ex.: 31 em fevereiro), usa o último dia do mês.
 */
export function datasMensais(inicio: string, quantidade: number = MESES_RECORRENCIA): string[] {
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

/** "2027-09-10" -> "09/2027" */
export const mesAno = (data: string) => `${data.slice(5, 7)}/${data.slice(0, 4)}`;
