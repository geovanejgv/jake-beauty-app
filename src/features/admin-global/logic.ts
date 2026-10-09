// Regras dos formulários da administração global (a Edge Function e o banco validam de novo).
import { PLANOS, SITUACOES, type Plano, type Situacao } from '../plano/plano';

export type EstabelecimentoGlobal = {
  id: string; nome: string; plano: Plano; status: Situacao; demo_expira_em: string | null; created_at: string;
  desativado_em: string | null; excluido_em: string | null;
  max_profissionais: number | null; max_clientes: number | null;
  profissionais: number; administradoras: number; clientes: number; proprio: boolean;
};

export type NovoEstabelecimento = {
  nome: string; plano: Plano; admin_nome: string; admin_email: string;
  max_profissionais: number | null; max_clientes: number | null;
};

export type EdicaoEstabelecimento = {
  nome: string; plano: Plano; status: Situacao;
  /** AAAA-MM-DD (fim do dia em Brasília); obrigatória na demonstração. */
  demo_expira_em: string | null;
  max_profissionais: number | null; max_clientes: number | null;
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function limiteInvalido(v: number | null, max: number) {
  return v !== null && (!Number.isInteger(v) || v < 0 || v > max);
}

export function validarNovoEstabelecimento(d: NovoEstabelecimento): string | null {
  const nome = d.nome.trim();
  if (nome.length < 2 || nome.length > 200) return 'Informe o nome do estabelecimento (2 a 200 caracteres).';
  if (!PLANOS.includes(d.plano)) return 'Escolha o plano.';
  if (limiteInvalido(d.max_profissionais, 10_000)) return 'Limite de profissionais inválido.';
  if (limiteInvalido(d.max_clientes, 1_000_000)) return 'Limite de clientes inválido.';
  const adm = d.admin_nome.trim();
  if (adm.length < 2 || adm.length > 200) return 'Informe o nome da administradora (2 a 200 caracteres).';
  const email = d.admin_email.trim();
  if (email.length > 200 || !EMAIL.test(email)) return 'Informe um e-mail válido para a administradora.';
  return null;
}

/** Corpo exato enviado à Edge Function (que recusa qualquer campo a mais, como senha). */
export function corpoNovoEstabelecimento(d: NovoEstabelecimento) {
  return {
    acao: 'criar_estabelecimento' as const,
    nome: d.nome.trim(),
    plano: d.plano,
    admin_nome: d.admin_nome.trim(),
    admin_email: d.admin_email.trim().toLowerCase(),
    max_profissionais: d.max_profissionais,
    max_clientes: d.max_clientes,
  };
}

export function validarEdicao(d: EdicaoEstabelecimento): string | null {
  const nome = d.nome.trim();
  if (nome.length < 2 || nome.length > 200) return 'Informe o nome do estabelecimento (2 a 200 caracteres).';
  if (!PLANOS.includes(d.plano)) return 'Escolha o plano.';
  if (!SITUACOES.includes(d.status)) return 'Situação inválida.';
  if (d.plano === 'demonstracao' && (!d.demo_expira_em || !DATA.test(d.demo_expira_em))) return 'Informe até quando vai a demonstração.';
  if (limiteInvalido(d.max_profissionais, 10_000)) return 'Limite de profissionais inválido.';
  if (limiteInvalido(d.max_clientes, 1_000_000)) return 'Limite de clientes inválido.';
  return null;
}

/** Fim da demonstração gravado no fim do dia, horário de Brasília. */
export function fimDemoParaBanco(data: string | null): string | null {
  return data && DATA.test(data) ? `${data}T23:59:59-03:00` : null;
}

/** Data (AAAA-MM-DD, Brasília) de um timestamp do banco, para o campo de data. */
export function dataLocal(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Campo numérico do formulário: vazio = ilimitado. */
export function lerLimite(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Mensagens das travas do painel vindas do banco. */
export function mensagemPainel(msg: string | null | undefined): string | null {
  if (!msg) return null;
  if (msg.includes('nao_desativa_o_proprio')) return 'Você não pode desativar nem excluir o seu próprio estabelecimento.';
  if (msg.includes('estabelecimento_nao_encontrado')) return 'Estabelecimento não encontrado.';
  if (msg.includes('so_admin_global')) return 'Confirme o segundo fator (MFA) para usar a administração global.';
  if (msg.includes('mfa_codigo_requerido')) return 'Digite o código atual do autenticador para confirmar a exclusão.';
  return null;
}
