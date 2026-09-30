import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, ShoppingCart, Users, LogOut, DollarSign, Menu, X, ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const themeLabel = isDark ? 'Modo Claro' : 'Modo Escuro';
  const ThemeIcon = isDark ? Sun : Moon;
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Estado que controla se o menu do PC está largo ou apenas com os ícones
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  // Fecha o menu sanduíche ao trocar de tela
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Fecha o menu sanduíche com a tecla Esc
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsMobileMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobileMenuOpen]);

  const navItems = [
    { path: '/dashboard', label: 'Resumo Diário', icon: LayoutDashboard },
    { path: '/agenda', label: 'Agenda', icon: CalendarDays },
    { path: '/clientes', label: 'Clientes', icon: Users },
    { path: '/financas', label: 'Finanças', icon: DollarSign },
    { path: '/pdv', label: 'Checkout PDV', icon: ShoppingCart },
  ];

  const currentPage = navItems.find((item) => item.path === location.pathname);

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      
      {/* MENU LATERAL DESKTOP (Esconde no celular e tablet, exibe no PC a partir de 1024px) */}
      <aside 
        className={`hidden lg:flex flex-col bg-white border-r border-slate-200 shadow-sm transition-all duration-300 ease-in-out z-20 ${isCollapsed ? 'w-20' : 'w-64'}`}
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
            onClick={toggleTheme} 
            title={isCollapsed ? themeLabel : ""}
            className={`flex items-center w-full text-slate-500 hover:bg-slate-100 rounded-xl transition-colors ${isCollapsed ? 'justify-center py-3' : 'px-4 py-3 space-x-3'}`}
          >
            <ThemeIcon size={22} className="shrink-0" /> 
            {!isCollapsed && <span className="whitespace-nowrap font-medium">{themeLabel}</span>}
          </button>

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
        
        {/* Cabeçalho que aparece no celular e no tablet */}
        <header className="bg-white px-2 sm:px-4 h-16 flex items-center justify-between border-b border-slate-200 shadow-sm lg:hidden shrink-0 z-30">
          <div className="flex items-center min-w-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              aria-label="Abrir menu"
              aria-expanded={isMobileMenuOpen}
            >
              <Menu size={24} />
            </button>
            <div className="ml-2 min-w-0">
              <h1 className="text-lg font-black text-rose-600 leading-tight">Jake Beauty</h1>
              {currentPage && <p className="text-xs text-slate-500 truncate leading-tight">{currentPage.label}</p>}
            </div>
          </div>
          <button onClick={toggleTheme} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title={themeLabel} aria-label={themeLabel}>
            <ThemeIcon size={22} />
          </button>
        </header>

        {/* Menu sanduíche (gaveta lateral) do celular e tablet */}
        <div className={`lg:hidden fixed inset-0 z-50 ${isMobileMenuOpen ? '' : 'pointer-events-none'}`} aria-hidden={!isMobileMenuOpen}>
          {/* Fundo escurecido: toque fora fecha o menu */}
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'}`}
          />

          <aside
            className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white flex flex-col transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
          >
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 shrink-0">
              <h2 className="text-xl font-black text-rose-600">Jake Beauty</h2>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg" aria-label="Fechar menu">
                <X size={24} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                      isActive ? 'bg-rose-50 text-rose-600 font-bold' : 'text-slate-700 font-medium hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={22} className={`shrink-0 ${isActive ? 'text-rose-600' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="p-3 border-t border-slate-100 space-y-1 shrink-0">
              <button onClick={toggleTheme} className="flex items-center space-x-3 px-4 py-3 w-full text-left text-slate-600 font-medium hover:bg-slate-100 rounded-xl">
                <ThemeIcon size={22} className="shrink-0" /> <span>{themeLabel}</span>
              </button>
              <button onClick={handleLogout} className="flex items-center space-x-3 px-4 py-3 w-full text-left text-red-500 font-medium hover:bg-red-50 rounded-xl">
                <LogOut size={22} className="shrink-0" /> <span>Sair do Sistema</span>
              </button>
            </div>
          </aside>
        </div>

        {/* Tela que renderiza as páginas (Agenda, Dashboard, etc) */}
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 relative z-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}