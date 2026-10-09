import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import Clientes from './pages/Clientes';
import Financeiro from './pages/Financeiro';
import PDV from './pages/PDV';
import Pacotes from './pages/Pacotes';
import Login from './pages/Login';
import Tarefas from './pages/Tarefas';
import Configuracoes from './pages/Configuracoes';
import Profissionais from './pages/Profissionais';
import Servicos from './pages/Servicos';
import MeuPainel from './pages/MeuPainel';
import PagamentoProfissionais from './pages/PagamentoProfissionais';
import RelatorioComissoes from './pages/RelatorioComissoes';
import ImprimirComissoes from './pages/ImprimirComissoes';
import Plano from './pages/Plano';
import AdminGlobal from './pages/AdminGlobal';
import AuthCallback from './pages/AuthCallback';
import Verificacao from './pages/Verificacao';
import { registrarAuditoria } from './lib/seguranca/auditoria';
import { supabase } from './lib/supabase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { moduloVisivel, rotaInicial, type IdModulo } from './features/acesso/modulos';
import { moduloLiberadoNoPlano } from './features/plano/plano';

/**
 * Negação por padrão (AUZ-01): sem sessão vai para /login (guardando o destino, L-05);
 * autenticador ativo sem o código desta sessão vê a verificação (M-06); sem perfil
 * ativo a sessão é encerrada (L-04).
 */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, acesso } = useAuth();
  const location = useLocation();
  if (loading || (user && acesso === 'carregando')) return <div className="h-screen flex items-center justify-center">Carregando...</div>;
  if (!user) {
    const destino = `${location.pathname}${location.search}`;
    return <Navigate to={destino === '/' ? '/login' : `/login?redirectTo=${encodeURIComponent(destino)}`} replace />;
  }
  if (acesso === 'mfa_pendente') return <Verificacao />;
  if (acesso === 'inativo') return <EstabelecimentoInativo />;
  if (acesso === 'negado') return <SemAcesso />;
  if (acesso !== 'liberado') return <AcessoNaoLiberado />;
  return <>{children}</>;
}

/** Entrou, mas não tem perfil ativo (nunca cadastrado ou desativado): sai na hora (L-04). */
function SemAcesso() {
  const navigate = useNavigate();
  useEffect(() => {
    void (async () => {
      await registrarAuditoria('login_negado', { motivo: 'sem_perfil' });
      await supabase.auth.signOut({ scope: 'local' });
      navigate('/login?erro=sem-acesso', { replace: true });
    })();
  }, [navigate]);
  return <div className="h-screen flex items-center justify-center">Encerrando a sessão...</div>;
}

/**
 * Rota de um módulo: só abre se o papel permite e o módulo não foi escondido nas
 * preferências. É conveniência de interface; o banco barra o dado (AUZ-07).
 */
function RotaModulo({ id, children }: { id: IdModulo; children: React.ReactNode }) {
  const { perfil } = useAuth();
  if (!perfil) return null;
  if (!moduloVisivel(id, perfil.role, perfil.preferencias_ui)) return <Navigate to={rotaInicial(perfil.role, perfil.preferencias_ui)} replace />;
  // Demonstração vencida: telas dos módulos pagos levam à página do plano (o banco também trava a gravação).
  if (!moduloLiberadoNoPlano(id, perfil.estabelecimento)) return <Navigate to="/plano" replace />;
  return <>{children}</>;
}

/** Só quem está na lista de administradores globais; a tela confere o MFA e o banco confere de novo. */
function RotaAdminGlobal({ children }: { children: React.ReactNode }) {
  const { adminGlobal } = useAuth();
  return adminGlobal ? <>{children}</> : <Navigate to="/" replace />;
}

/** Estabelecimento desativado ou excluído: encerra a sessão e explica no login (RF-17, RF-18). */
function EstabelecimentoInativo() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    void signOut().finally(() => navigate('/login?erro=estabelecimento-inativo', { replace: true }));
  }, [signOut, navigate]);
  return <div className="h-screen flex items-center justify-center">Encerrando a sessão...</div>;
}

function Inicio() {
  const { perfil } = useAuth();
  return perfil ? <Navigate to={rotaInicial(perfil.role, perfil.preferencias_ui)} replace /> : null;
}

/** Quem já está logado não fica na tela de login (com ?erro= a mensagem aparece). */
function SomenteSemSessao({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [params] = useSearchParams();
  return user && !params.get('erro') ? <Navigate to="/" replace /> : <>{children}</>;
}

/** Falhou ao conferir o perfil (rede ou banco). */
function AcessoNaoLiberado() {
  const { erroAcesso, recarregarPerfil, signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Não foi possível conferir seu acesso</h1>
        <p className="text-slate-500 text-sm">{erroAcesso}</p>
        <div className="flex gap-2 justify-center">
          <button onClick={recarregarPerfil} className="px-4 py-2 rounded-lg bg-slate-200 text-slate-800 font-medium">Tentar de novo</button>
          <button onClick={() => { void signOut(); }} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-medium">Sair</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<SomenteSemSessao><Login /></SomenteSemSessao>} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          
          <Route path="/" element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }>
            <Route index element={<Inicio />} />
            <Route path="dashboard" element={<RotaModulo id="resumo"><Dashboard /></RotaModulo>} />
            <Route path="meu-painel" element={<RotaModulo id="meu_painel"><MeuPainel /></RotaModulo>} />
            <Route path="agenda" element={<RotaModulo id="agenda"><Agenda /></RotaModulo>} />
            <Route path="tarefas" element={<RotaModulo id="tarefas"><Tarefas /></RotaModulo>} />
            <Route path="clientes" element={<RotaModulo id="clientes"><Clientes /></RotaModulo>} />
            <Route path="profissionais" element={<RotaModulo id="profissionais"><Profissionais /></RotaModulo>} />
            <Route path="servicos" element={<RotaModulo id="servicos"><Servicos /></RotaModulo>} />
            <Route path="financas" element={<RotaModulo id="financas"><Financeiro /></RotaModulo>} />
            <Route path="pagamentos" element={<RotaModulo id="pagamentos"><PagamentoProfissionais /></RotaModulo>} />
            <Route path="pdv" element={<RotaModulo id="pdv"><PDV /></RotaModulo>} />
            <Route path="pacotes" element={<RotaModulo id="pacotes"><Pacotes /></RotaModulo>} />
            <Route path="relatorios/comissoes" element={<RotaModulo id="relatorio_comissoes"><RelatorioComissoes /></RotaModulo>} />
            <Route path="configuracoes" element={<RotaModulo id="configuracoes"><Configuracoes /></RotaModulo>} />
            <Route path="plano" element={<RotaModulo id="plano"><Plano /></RotaModulo>} />
            <Route path="admin-global" element={<RotaAdminGlobal><AdminGlobal /></RotaAdminGlobal>} />
          </Route>

          {/* Relatório para imprimir/salvar em PDF: página limpa, sem o menu */}
          <Route path="/relatorios/comissoes/imprimir" element={
            <PrivateRoute>
              <RotaModulo id="relatorio_comissoes"><ImprimirComissoes /></RotaModulo>
            </PrivateRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}