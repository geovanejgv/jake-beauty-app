import { supabase } from '../supabase';
import { logger } from './logger';

/**
 * Trilha de auditoria (LOG-05, A-01 do login) pelo lado da tela. Quem, quando, IP e navegador são
 * gravados pelo próprio banco (função registrar_auditoria, a partir da sessão e
 * dos cabeçalhos da requisição); a tela só informa a ação. Exclusões, alterações
 * de cliente/finanças e mudanças de permissão são gravadas por gatilho no banco,
 * sem depender da tela. A tabela não aceita update nem delete (LOG-06).
 *
 * Nunca envie dado pessoal em "detalhes" (LOG-04).
 */

export type AcaoTela = 'login' | 'login_negado' | 'logout' | 'mfa_ativado' | 'mfa_verificado' | 'mfa_falhou' | 'mfa_removido';

export async function registrarAuditoria(acao: AcaoTela, detalhes?: Record<string, string | number | boolean | null>) {
  try {
    const { error } = await supabase.rpc('registrar_auditoria', { p_acao: acao, p_detalhes: detalhes ?? null });
    if (error) logger.warn('Falha ao gravar auditoria', { acao, codigo: error.code });
  } catch (e) {
    // Auditoria não pode derrubar a operação principal, mas a falha é registrada.
    logger.warn('Falha ao gravar auditoria', { acao, erro: e });
  }
}
