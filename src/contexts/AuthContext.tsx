import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { registrarAuditoria } from '../lib/seguranca/auditoria';
import { mensagemDeErro } from '../lib/seguranca/erros';

/** Perfil do app (public.users). Papel e status vêm do banco, nunca da tela (AUZ-06). */
export type Perfil = { id: string; name: string; role: 'admin' | 'professional' };

/**
 * liberado: tem perfil ativo; negado: logou, mas não tem perfil ativo (acesso ainda não
 * liberado: o app não cria perfil sozinho); erro: falha ao consultar o perfil.
 */
export type SituacaoAcesso = 'carregando' | 'sem_sessao' | 'liberado' | 'negado' | 'erro';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  perfil: Perfil | null;
  acesso: SituacaoAcesso;
  erroAcesso: string | null;
  recarregarPerfil: () => void;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null, user: null, perfil: null, acesso: 'carregando', erroAcesso: null,
  recarregarPerfil: () => {}, signOut: async () => {}, loading: true,
});

/** Busca o perfil ATIVO do usuário logado. null = sem perfil ativo. */
export async function buscarPerfilAtivo(authId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('auth_id', authId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return (data as Perfil | null) ?? null;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [acesso, setAcesso] = useState<SituacaoAcesso>('carregando');
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setPerfil(null);
      setAcesso('sem_sessao');
      return;
    }
    let cancelado = false;
    setAcesso('carregando');
    buscarPerfilAtivo(userId)
      .then((p) => {
        if (cancelado) return;
        setPerfil(p);
        setAcesso(p ? 'liberado' : 'negado');
      })
      .catch((e) => {
        if (cancelado) return;
        setPerfil(null);
        setErroAcesso(mensagemDeErro(e, 'Não foi possível conferir seu acesso.', 'perfil'));
        setAcesso('erro');
      });
    return () => { cancelado = true; };
  }, [userId, loading, tentativa]);

  const recarregarPerfil = useCallback(() => setTentativa((n) => n + 1), []);

  const signOut = async () => {
    await registrarAuditoria('logout');
    // Revoga a sessão no servidor de autenticação (SES-04); 'local' encerra só este aparelho.
    await supabase.auth.signOut({ scope: 'local' });
  };

  return (
    <AuthContext.Provider value={{ session, user, perfil, acesso, erroAcesso, recarregarPerfil, signOut, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
