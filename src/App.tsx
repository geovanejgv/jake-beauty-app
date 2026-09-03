import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import Clientes from './pages/Clientes';
import Financeiro from './pages/Financeiro';
import PDV from './pages/PDV';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center">Carregando...</div>;
  return user ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
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
          </Route>

          <Route path="*" element={<Navigate to="/agenda" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}