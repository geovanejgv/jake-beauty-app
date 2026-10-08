/**
 * Regras da troca de senha (AUT-03). O hash e a verificação de senhas vazadas
 * são do Supabase Auth; aqui só a validação de usabilidade, repetida no painel
 * do Supabase (mínimo de caracteres).
 */

export const SENHA_MIN = 12;
/** O hash de senha do Supabase Auth só considera os primeiros 72 bytes. */
export const SENHA_MAX_BYTES = 72;

export type DadosTrocaSenha = { atual: string; nova: string; confirmacao: string };

/** Devolve a mensagem do primeiro problema, ou null se está tudo certo. Sem regra de composição (AUT-03). */
export function validarTrocaSenha({ atual, nova, confirmacao }: DadosTrocaSenha): string | null {
  if (!atual) return 'Informe a senha atual.';
  if ([...nova].length < SENHA_MIN) return `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (new TextEncoder().encode(nova).length > SENHA_MAX_BYTES) return 'A nova senha é longa demais (máximo de 72 caracteres simples).';
  if (nova.trim() !== nova) return 'A nova senha não pode começar nem terminar com espaço.';
  if (nova === atual) return 'A nova senha precisa ser diferente da atual.';
  if (nova !== confirmacao) return 'A confirmação não confere com a nova senha.';
  return null;
}

/** Primeira senha de quem entrou pelo convite por e-mail (não há senha atual). */
export function validarNovaSenha({ nova, confirmacao }: { nova: string; confirmacao: string }): string | null {
  if ([...nova].length < SENHA_MIN) return `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (new TextEncoder().encode(nova).length > SENHA_MAX_BYTES) return 'A nova senha é longa demais (máximo de 72 caracteres simples).';
  if (nova.trim() !== nova) return 'A nova senha não pode começar nem terminar com espaço.';
  if (nova !== confirmacao) return 'A confirmação não confere com a nova senha.';
  return null;
}

/** Mensagens do Supabase Auth na troca de senha que já são seguras para a tela. */
export function mensagemErroAuth(codigo: string | undefined): string | null {
  switch (codigo) {
    case 'invalid_credentials':
      return 'Senha atual incorreta.';
    case 'same_password':
      return 'A nova senha precisa ser diferente da atual.';
    case 'weak_password':
      return 'Senha fraca ou já vazada na internet. Escolha outra, de preferência uma frase longa.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    case 'reauthentication_needed':
    case 'session_not_found':
      return 'Sessão expirada. Entre novamente e repita a troca.';
    default:
      return null;
  }
}
