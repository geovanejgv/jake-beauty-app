// Regras de plano do estabelecimento (demonstração, básico e premium) do lado da tela.
// Quem barra de verdade é o banco: limites e demonstração vencida por gatilho, RLS para
// estabelecimento desativado. Aqui só o que a interface mostra e para onde leva.
import type { IdModulo } from '../acesso/modulos';

export const PLANOS = ['demonstracao', 'basico', 'premium'] as const;
export type Plano = (typeof PLANOS)[number];
export const SITUACOES = ['ativo', 'desativado', 'excluido'] as const;
export type Situacao = (typeof SITUACOES)[number];

export const ROTULO_PLANO: Record<Plano, string> = { demonstracao: 'Demonstração', basico: 'Básico', premium: 'Premium' };
export const ROTULO_SITUACAO: Record<Situacao, string> = { ativo: 'Ativo', desativado: 'Desativado', excluido: 'Excluído' };

export const DIAS_DEMONSTRACAO = 30;
export type Limites = { max_profissionais: number | null; max_clientes: number | null };
export const LIMITES_PADRAO: Record<Plano, Limites> = {
  demonstracao: { max_profissionais: 2, max_clientes: null },
  basico: { max_profissionais: 3, max_clientes: 300 },
  premium: { max_profissionais: null, max_clientes: null },
};

/** Telas que seguem funcionando com a demonstração vencida (as demais pedem plano). */
export const MODULOS_SEM_PLANO: readonly IdModulo[] = [
  'resumo', 'meu_painel', 'agenda', 'clientes', 'profissionais', 'servicos', 'configuracoes', 'plano',
];

export type SituacaoPlano = { plano: Plano; demo_expira_em: string | null };

const DIA_MS = 86_400_000;

export function demoExpirada(s: SituacaoPlano, agora = new Date()): boolean {
  if (s.plano !== 'demonstracao' || !s.demo_expira_em) return false;
  return new Date(s.demo_expira_em).getTime() <= agora.getTime();
}

/** Dias que faltam (arredonda para cima, nunca negativo); null fora da demonstração. */
export function diasRestantesDemo(s: SituacaoPlano, agora = new Date()): number | null {
  if (s.plano !== 'demonstracao' || !s.demo_expira_em) return null;
  return Math.max(0, Math.ceil((new Date(s.demo_expira_em).getTime() - agora.getTime()) / DIA_MS));
}

export function moduloLiberadoNoPlano(id: IdModulo, s: SituacaoPlano | null, agora = new Date()): boolean {
  if (!s || !demoExpirada(s, agora)) return true;
  return MODULOS_SEM_PLANO.includes(id);
}

/** Travas gravadas pelos gatilhos do banco -> texto para a tela (RF-15). */
export const MENSAGENS_PLANO = {
  limite_plano_profissional: 'O plano do estabelecimento chegou ao limite de profissionais. Peça ao suporte para ampliar.',
  limite_plano_cliente: 'O plano do estabelecimento chegou ao limite de clientes. Peça ao suporte para ampliar.',
  plano_sem_compartilhamento: 'No plano Básico, o Kanban não permite compartilhar quadros.',
  plano_demonstracao_encerrada: 'O período de demonstração terminou. Esta função volta com um plano Básico ou Premium.',
} as const;

export function travaDoPlano(mensagem: string | null | undefined): keyof typeof MENSAGENS_PLANO | null {
  if (!mensagem) return null;
  return (Object.keys(MENSAGENS_PLANO) as (keyof typeof MENSAGENS_PLANO)[]).find((k) => mensagem.includes(k)) ?? null;
}

/** "usados / limite" para a tela; ∞ quando ilimitado. */
export function usoLimite(usados: number, limite: number | null): string {
  return `${usados} / ${limite === null ? '∞' : limite}`;
}
