import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { registrarAuditoria } from '../lib/seguranca/auditoria';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { normalizarPreferencias, type Papel, type PreferenciasUi } from '../features/acesso/modulos';
import type { Plano, Situacao } from '../features/plano/plano';

export type EstabelecimentoDoPerfil = { id: string; nome: string; plano: Plano; status: Situacao; demo_expira_em: string | null };

/** Perfil do app (public.users). Papel e status vêm do banco, nunca da tela (AUZ-06). */
export type Perfil = { id: string; name: string; role: Papel; preferencias_ui: PreferenciasUi; estabelecimento: EstabelecimentoDoPerfil | null };

/**
 * liberado: tem perfil ativo; negado: logou, mas não tem perfil ativo (acesso ainda não
 * liberado: o app não cria perfil sozinho); inativo: o estabelecimento foi desativado ou
 * excluído (o RLS já não mostra nada); erro: falha ao consultar o perfil.
 */
export type SituacaoAcesso = 'carregando' | 'sem_sessao' | 'liberado' | 'negado' | 'inativo' | 'erro';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  perfil: Perfil | null;
  acesso: SituacaoAcesso;
  erroAcesso: string | null;
  /** Está na lista de administradores globais (só para o menu; o banco confere com MFA). */
  adminGlobal: boolean;
  recarregarPerfil: () => void;
  /** Grava as preferências de interface do próprio usuário (menu e rotas). */
  salvarPreferencias: (prefs: PreferenciasUi) => Promise<void>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null, user: null, perfil: null, acesso: 'carregando', erroAcesso: null, adminGlobal: false,
  recarregarPerfil: () => {}, salvarPreferencias: async () => {}, signOut: async () => {}, loading: true,
});

/** Busca o perfil ATIVO do usuário logado. null = sem perfil ativo. */
export async function buscarPerfilAtivo(authId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, preferencias_ui, estabelecimento:estabelecimentos(id, nome, plano, status, demo_expira_em)')
    .eq('auth_id', authId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const linha = data as unknown as { id: string; name: string; role: Papel; preferencias_ui?: unknown; estabelecimento?: EstabelecimentoDoPerfil | null };
  return {
    id: linha.id, name: linha.name, role: linha.role, preferencias_ui: normalizarPreferencias(linha.preferencias_ui),
    estabelecimento: linha.estabelecimento ?? null,
  };
}

/** Sem perfil visível: confere se é porque o estabelecimento está desativado ou excluído. */
export async function estabelecimentoInativo(): Promise<boolean> {
  const { data, error } = await supabase.rpc('minha_situacao_estabelecimento');
  if (error) throw error;
  const linha = (Array.isArray(data) ? data[0] : data) as { status?: string } | undefined;
  return !!linha?.status && linha.status !== 'ativo';
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [acesso, setAcesso] = useState<SituacaoAcesso>('carregando');
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);
  const [adminGlobal, setAdminGlobal] = useState(false);
  // Conferência em segundo plano (ao voltar para a aba): não mostra "carregando".
  const silencioso = useRef(false);
  const perfilRef = useRef<Perfil | null>(null);
  perfilRef.current = perfil;
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
    if (!silencioso.current) setAcesso('carregando');
    silencioso.current = false;
    buscarPerfilAtivo(userId)
      .then(async (p) => {
        const inativo = p ? false : await estabelecimentoInativo().catch(() => false);
        const global = p ? await supabase.rpc('eh_admin_global_cadastrado').then((r) => r.data === true, () => false) : false;
        if (cancelado) return;
        setPerfil(p);
        setAdminGlobal(global);
        setAcesso(p ? 'liberado' : inativo ? 'inativo' : 'negado');
      })
      .catch((e) => {
        if (cancelado) return;
        // Falha passageira numa conferência em segundo plano não derruba a tela aberta.
        if (perfilRef.current) return;
        setPerfil(null);
        setErroAcesso(mensagemDeErro(e, 'Não foi possível conferir seu acesso.', 'perfil'));
        setAcesso('erro');
      });
    return () => { cancelado = true; };
  }, [userId, loading, tentativa]);

  const recarregarPerfil = useCallback(() => setTentativa((n) => n + 1), []);

  // Estabelecimento desativado com a pessoa já logada: ao voltar para a aba, confere de novo (RF-18).
  useEffect(() => {
    if (!userId) return;
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return;
      silencioso.current = true;
      setTentativa((n) => n + 1);
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [userId]);

  const salvarPreferencias = useCallback(async (prefs: PreferenciasUi) => {
    const limpas = normalizarPreferencias(prefs);
    const { error } = await supabase.rpc('salvar_preferencias_ui', { p_preferencias: limpas });
    if (error) throw error;
    setPerfil((atual) => (atual ? { ...atual, preferencias_ui: limpas } : atual));
  }, []);

  const signOut = useCallback(async () => {
    await registrarAuditoria('logout');
    // Revoga a sessão no servidor de autenticação (SES-04); 'local' encerra só este aparelho.
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, perfil, acesso, erroAcesso, adminGlobal, recarregarPerfil, salvarPreferencias, signOut, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
