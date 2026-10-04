import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import Clientes from './pages/Clientes';
import Financeiro from './pages/Financeiro';
import PDV from './pages/PDV';
import Login from './pages/Login';
import Tarefas from './pages/Tarefas';
import { AuthProvider, useAuth } from './contexts/AuthContext';

/** Negação por padrão (AUZ-01): sem sessão vai para /login; sem perfil ativo não entra. */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, acesso } = useAuth();
  if (loading || (user && acesso === 'carregando')) return <div className="h-screen flex items-center justify-center">Carregando...</div>;
  if (!user) return <Navigate to="/login" />;
  if (acesso !== 'liberado') return <AcessoNaoLiberado />;
  return <>{children}</>;
}

/** Quem já está logado não fica na tela de login. */
function SomenteSemSessao({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

/** Logou, mas não tem perfil ativo em public.users (ou falhou ao conferir). O app não cria perfil sozinho. */
function AcessoNaoLiberado() {
  const { acesso, erroAcesso, recarregarPerfil, signOut } = useAuth();
  const erro = acesso === 'erro';
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">{erro ? 'Não foi possível conferir seu acesso' : 'Acesso ainda não liberado'}</h1>
        <p className="text-slate-500 text-sm">
          {erro ? erroAcesso : 'Sua conta entrou, mas ainda não foi liberada no portal. Peça à administradora para ativar o seu cadastro.'}
        </p>
        <div className="flex gap-2 justify-center">
          {erro && (
            <button onClick={recarregarPerfil} className="px-4 py-2 rounded-lg bg-slate-200 text-slate-800 font-medium">Tentar de novo</button>
          )}
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
          
          <Route path="/" element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }>
            {/* AGORA REDIRECIONA DIRETO PARA A AGENDA AO ABRIR O PROGRAMA */}
            <Route index element={<Navigate to="/agenda" replace />} />
            
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="financas" element={<Financeiro />} />
            <Route path="pdv" element={<PDV />} />
            <Route path="tarefas" element={<Tarefas />} />
          </Route>

          <Route path="*" element={<Navigate to="/agenda" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}