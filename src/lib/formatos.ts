// Formatos usados nas telas de gestão (moeda, percentual, datas no fuso de São Paulo).

export const FUSO = 'America/Sao_Paulo';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const brl = (v: number | string | null | undefined) => moeda.format(Number(v ?? 0) || 0);

export const pct = (v: number | string | null | undefined) =>
  `${(Number(v ?? 0) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** "65,00", "65.5", "1.234,56" -> número; texto inválido -> null. */
export function lerValor(texto: string): number | null {
  const t = texto.trim().replace(/\s|R\$/g, '');
  if (!t) return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return Number(normal);
}

/** Número -> "65,00" para campos de texto. */
export const valorParaCampo = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? '' : Number(v).toFixed(2).replace('.', ',');

/** Data local (YYYY-MM-DD) no fuso de São Paulo. */
export function dataLocal(d: Date | string = new Date()): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
}

export const dataBR = (d: Date | string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' }).format(typeof d === 'string' ? new Date(d) : d);

export const horaBR = (d: Date | string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(typeof d === 'string' ? new Date(d) : d);

export const dataHoraBR = (d: Date | string) => `${dataBR(d)} ${horaBR(d)}`;

/** "2026-10-04" -> "04/10/2026" sem passar por fuso. */
export const isoParaBR = (iso: string) => iso.split('-').reverse().join('/');

/** Primeiro e último dia do mês da data (YYYY-MM-DD). */
export function mesDe(iso: string): { inicio: string; fim: string } {
  const [a, m] = iso.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { inicio: `${a}-${mm}-01`, fim: `${a}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

/** Início (00:00) e fim exclusivo (00:00 do dia seguinte) de um período local, em ISO com fuso -03:00. */
export function intervaloLocal(inicio: string, fim: string): { de: string; ate: string } {
  const dia = new Date(`${fim}T12:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() + 1);
  return { de: `${inicio}T00:00:00-03:00`, ate: `${dia.toISOString().slice(0, 10)}T00:00:00-03:00` };
}

/** Só dígitos. */
export const digitos = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '');

export function formatarCpf(t: string | null | undefined): string {
  const d = digitos(t).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function formatarCnpj(t: string | null | undefined): string {
  const d = digitos(t).slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

export function formatarTelefone(t: string | null | undefined): string {
  let v = digitos(t).slice(0, 11);
  if (v.length > 2) v = `(${v.substring(0, 2)}) ${v.substring(2)}`;
  if (v.length > 10) v = `${v.substring(0, 10)}-${v.substring(10)}`;
  return v;
}

/** Mesmas regras do banco (public.cpf_valido): a tela avisa antes de salvar. */
export function cpfValido(t: string | null | undefined): boolean {
  const d = digitos(t);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    return ((soma * 10) % 11) % 10;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Mesmas regras do banco (public.cnpj_valido), inclusive para MEI. */
export function cnpjValido(t: string | null | undefined): boolean {
  const d = digitos(t);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (pesos: number[]) => {
    const soma = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    return soma % 11 < 2 ? 0 : 11 - (soma % 11);
  };
  return calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[12])
    && calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[13]);
}
