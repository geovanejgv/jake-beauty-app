// Backup em planilha: tipos, aviso mensal e formatação das células (regras puras).
// O banco libera o arquivo (registrar_backup exige administradora com aal2) e guarda a
// data de cada backup na trilha de auditoria, de onde sai o aviso "Backup mensal pendente".

export const TIPOS_BACKUP = ['clientes', 'agenda', 'financeiro', 'leads'] as const;
export type TipoBackup = (typeof TIPOS_BACKUP)[number];

export const ROTULO_BACKUP: Record<TipoBackup, string> = {
  clientes: 'Clientes',
  agenda: 'Agenda',
  financeiro: 'Financeiro',
  leads: 'Leads',
};

/** Em dia = houve backup a partir do dia 1 do mês corrente (compara "AAAA-MM"). */
export function backupEmDia(ultimo: string | null | undefined, hoje: string): boolean {
  if (!ultimo) return false;
  return ultimo.slice(0, 7) >= hoje.slice(0, 7);
}

/** backup-clientes-2026-10-18.xlsx */
export const nomeArquivoBackup = (tipo: TipoBackup, hoje: string) => `backup-${tipo}-${hoje}.xlsx`;

/** Valor em reais -> "1234,56" (planilha em pt-BR); vazio fica vazio. */
export function reais(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : '';
}

/** AAAA-MM-DD (ou ISO com hora) -> DD/MM/AAAA. */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : '';
}

export const simNao = (v: boolean | null | undefined) => (v ? 'Sim' : 'Não');

/** Total de linhas de dados (sem os cabeçalhos) de todas as abas. */
export const linhasDeDados = (abas: { linhas: string[][] }[]) => abas.reduce((s, a) => s + Math.max(0, a.linhas.length - 1), 0);
