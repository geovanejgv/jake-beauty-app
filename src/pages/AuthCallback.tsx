import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { registrarAuditoria } from '../lib/seguranca/auditoria';
import { retirarDestino } from '../lib/seguranca/redirecionamento';
import { supabase } from '../lib/supabase';
import { marcarAtividade } from '../features/acesso/inatividade';

/** Erro devolvido pelo Supabase/Google na própria URL de retorno -> código da tela de login. */
export function erroDoRetorno(busca: string, fragmento: string): string | null {
  const p = new URLSearchParams(busca);
  const h = new URLSearchParams(fragmento.replace(/^#/, ''));
  const erro = p.get('error') ?? h.get('error');
  if (!erro) return null;
  const detalhe = `${p.get('error_code') ?? h.get('error_code') ?? ''} ${p.get('error_description') ?? h.get('error_description') ?? ''}`;
  if (/rate.?limit|too many/i.test(detalhe)) return 'limite';
  // Cadastro aberto desligado: conta Google que a administradora não cadastrou.
  if (/sign.?ups?\s+not\s+allowed|signup_disabled/i.test(detalhe)) return 'sem-acesso';
  return 'falha';
}

/**
 * Retorno do Google (/auth/callback, L-04). O supabase-js troca o código pela sessão
 * (PKCE) ao abrir a página; aqui só se decide o que fazer com ela:
 * - perfil ativo de estabelecimento ativo -> destino;
 * - estabelecimento desativado -> encerra a sessão e explica;
 * - sem perfil ativo -> encerra a sessão na hora, com mensagem neutra.
 */
export default function AuthCallback() {
  const { user, loading, acesso } = useAuth();
  const navigate = useNavigate();
  const feito = useRef(false);

  useEffect(() => {
    if (loading || feito.current) return;
    const sair = async (codigo: string, motivo?: string) => {
      feito.current = true;
      if (motivo) await registrarAuditoria('login_negado', { motivo });
      await supabase.auth.signOut({ scope: 'local' });
      navigate(`/login?erro=${codigo}`, { replace: true });
    };
    if (!user) {
      feito.current = true;
      navigate(`/login?erro=${erroDoRetorno(window.location.search, window.location.hash) ?? 'falha'}`, { replace: true });
      return;
    }
    if (acesso === 'carregando') return;
    if (acesso === 'liberado') {
      feito.current = true;
      marcarAtividade(); // login novo começa do zero, sem herdar tempo parado antigo
      void registrarAuditoria('login')
        .finally(() => navigate(retirarDestino(), { replace: true }));
      return;
    }
    if (acesso === 'inativo') { void sair('estabelecimento-inativo', 'estabelecimento_inativo'); return; }
    if (acesso === 'negado') { void sair('sem-acesso', 'sem_perfil'); return; }
    void sair('falha');
  }, [loading, user, acesso, navigate]);

  return <div className="h-screen flex items-center justify-center text-slate-600">Entrando...</div>;
}
