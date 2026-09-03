import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, ShoppingCart, Users, LogOut, DollarSign, Menu, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Estado que controla se o menu do PC está largo ou apenas com os ícones
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', label: 'Resumo Diário', icon: LayoutDashboard },
    { path: '/agenda', label: 'Agenda', icon: CalendarDays },
    { path: '/clientes', label: 'Clientes', icon: Users },
    { path: '/financas', label: 'Finanças', icon: DollarSign },
    { path: '/pdv', label: 'Checkout PDV', icon: ShoppingCart },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      
      {/* MENU LATERAL DESKTOP (Esconde no celular, exibe no PC) */}
      <aside 
        className={`hidden md:flex flex-col bg-white border-r border-slate-200 shadow-sm transition-all duration-300 ease-in-out z-20 ${isCollapsed ? 'w-20' : 'w-64'}`}
      >
        {/* Topo / Logo */}
        <div className="h-20 flex items-center justify-center border-b border-slate-100 shrink-0">
          <h1 className={`font-black text-rose-600 transition-all duration-300 ${isCollapsed ? 'text-xl' : 'text-2xl'}`}>
            {isCollapsed ? 'JB' : 'Jake Beauty'}
          </h1>
        </div>
        
        {/* Links de Navegação */}
        <nav className="flex-1 px-3 py-6 space-y-3 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path} 
                to={item.path} 
                title={isCollapsed ? item.label : ''} // Exibe o nome ao passar o mouse se estiver encolhido
                className={`flex items-center rounded-xl transition-all duration-200 group ${
                  isActive ? 'bg-rose-50 text-rose-600 font-bold' : 'text-slate-500 hover:bg-slate-50 hover:text-rose-500'
                } ${isCollapsed ? 'justify-center py-3' : 'px-4 py-3 space-x-3'}`}
              >
                <Icon size={22} className={`shrink-0 ${isActive ? 'text-rose-600' : 'text-slate-400 group-hover:text-rose-500'}`} /> 
                {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Rodapé: Botões de Sair e Recolher */}
        <div className="p-4 border-t border-slate-100 space-y-2 shrink-0">
          <button 
            onClick={handleLogout} 
            title={isCollapsed ? "Sair do Sistema" : ""}
            className={`flex items-center w-full text-red-500 hover:bg-red-50 rounded-xl transition-colors ${isCollapsed ? 'justify-center py-3' : 'px-4 py-3 space-x-3'}`}
          >
            <LogOut size={22} className="shrink-0" /> 
            {!isCollapsed && <span className="whitespace-nowrap font-medium">Sair do Sistema</span>}
          </button>

          <button 
            onClick={() => setIsCollapsed(!isCollapsed)} 
            className={`flex items-center w-full text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors ${isCollapsed ? 'justify-center py-3' : 'px-4 py-3 space-x-3'}`}
            title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
          >
            {isCollapsed ? <ChevronRight size={22} className="shrink-0" /> : <ChevronLeft size={22} className="shrink-0" />}
            {!isCollapsed && <span className="whitespace-nowrap font-bold">Recolher Menu</span>}
          </button>
        </div>
      </aside>

      {/* CABEÇALHO MOBILE E ÁREA PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {/* Cabeçalho que aparece só no celular */}
        <header className="bg-white p-4 flex justify-between items-center border-b border-slate-200 shadow-sm md:hidden shrink-0 z-30">
          <h1 className="text-xl font-black text-rose-600">Jake Beauty</h1>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-600">
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </header>

        {/* Menu Dropdown do Celular */}
        {isMobileMenuOpen && (
          <nav className="md:hidden absolute top-[68px] left-0 w-full bg-white border-b border-slate-200 p-4 space-y-2 shadow-xl z-40 animate-in slide-in-from-top-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.path} to={item.path} onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center space-x-3 px-4 py-3 text-slate-700 font-medium hover:bg-rose-50 rounded-lg">
                  <Icon size={20} /> <span>{item.label}</span>
                </Link>
              );
            })}
            <button onClick={handleLogout} className="flex items-center space-x-3 px-4 py-3 w-full text-left text-red-500 font-medium hover:bg-red-50 rounded-lg mt-4 border-t border-slate-100 pt-4">
              <LogOut size={20} /> <span>Sair do Sistema</span>
            </button>
          </nav>
        )}

        {/* Tela que renderiza as páginas (Agenda, Dashboard, etc) */}
        <main className="flex-1 overflow-auto p-4 md:p-8 relative z-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}