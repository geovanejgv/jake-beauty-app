// Verificação em duas etapas (MFA, código TOTP de aplicativo autenticador) pelo próprio
// Supabase Auth. A sessão que confirma o código passa a "aal2", que o banco confere na
// claim "aal" do token: quem tem autenticador não vê dados antes do código (M-06),
// permissões da equipe e logs exigem aal2 (M-01) e a administração global também.
import { supabase } from '../../lib/supabase';

export type Nivel = 'aal1' | 'aal2';
export type Fator = { id: string; nome: string | null; verificado: boolean };

export async function nivelMfa(): Promise<{ atual: Nivel; proximo: Nivel }> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return { atual: (data.currentLevel ?? 'aal1') as Nivel, proximo: (data.nextLevel ?? 'aal1') as Nivel };
}

export async function fatoresTotp(): Promise<Fator[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data.all ?? [])
    .filter((f) => f.factor_type === 'totp')
    .map((f) => ({ id: f.id, nome: f.friendly_name ?? null, verificado: f.status === 'verified' }));
}

/** Confirma o código de 6 dígitos de um autenticador já cadastrado (sessão vira aal2). */
export async function confirmarCodigo(fatorId: string, codigo: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: codigo.replace(/\s/g, '') });
  if (error) throw error;
}

/** Começa o cadastro: devolve o QR code e o segredo para o aplicativo autenticador. */
export async function iniciarCadastro(): Promise<{ fatorId: string; qr: string; segredo: string }> {
  // Cadastros abandonados (não verificados) atrapalham um novo: saem antes.
  for (const f of await fatoresTotp()) {
    if (!f.verificado) await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  // O nome precisa ser único por conta: leva data e hora do cadastro.
  const quando = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16);
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Autenticador ${quando}` });
  if (error) throw error;
  return { fatorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
}

export async function removerFator(fatorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId: fatorId });
  if (error) throw error;
}

/** Regra para remover um autenticador (M-03). null = pode; texto = por que não. */
export function podeRemover({ ehAdmin, aal2, verificados }: { ehAdmin: boolean; aal2: boolean; verificados: number }): string | null {
  if (!aal2) return 'Confirme o código do autenticador antes de remover.';
  if (ehAdmin && verificados <= 1) return 'Administradoras precisam manter ao menos um autenticador.';
  return null;
}

export const codigoValido = (codigo: string) => /^\d{6}$/.test(codigo.replace(/\s/g, ''));

/** Mensagens do Supabase Auth no MFA que são seguras para a tela. */
export function mensagemMfa(codigo: string | undefined): string | null {
  switch (codigo) {
    case 'mfa_verification_failed':
    case 'invalid_credentials':
      return 'Código incorreto ou vencido. Confira o aplicativo e tente de novo.';
    case 'mfa_challenge_expired':
      return 'O código expirou. Digite o código atual do aplicativo.';
    case 'insufficient_aal':
      return 'Confirme um código do autenticador antes de remover a verificação.';
    case 'mfa_totp_enroll_not_enabled':
    case 'mfa_totp_enroll_disabled':
      return 'A verificação em duas etapas está desligada no Supabase (Authentication > MFA).';
    case 'over_request_rate_limit':
      return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    default:
      return null;
  }
}
