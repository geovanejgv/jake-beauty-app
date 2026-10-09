import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, ChevronLeft, ChevronRight, ChevronDown, SquareKanban, Plus, SquareCheckBig, CalendarPlus, UserPlus, Lock, Building2, Gem, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { useInatividadeAdmin } from '../hooks/useInatividadeAdmin';
import { GRUPOS, ROTULO_PAPEL, moduloDaRota, modulosVisiveis, type IdGrupo, type Modulo } from '../features/acesso/modulos';
import { demoExpirada, diasRestantesDemo, moduloLiberadoNoPlano } from '../features/plano/plano';

const CHAVE_GRUPOS = 'jb-menu-grupos';

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { perfil, adminGlobal, nivel, signOut } = useAuth();
  // Aplica o tema salvo ao abrir o portal; a troca fica em Configurações.
  useTheme();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Estado que controla se o menu do PC está largo ou apenas com os ícones
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Administradora parada por 30 minutos sai do portal (L-09).
  useInatividadeAdmin(perfil?.role === 'admin', () => {
    void signOut().finally(() => navigate('/login?erro=inatividade', { replace: true }));
  });
  const estabelecimento = perfil?.estabelecimento ?? null;
  const demoVencida = !!estabelecimento && demoExpirada(estabelecimento);
  const diasDemo = estabelecimento ? diasRestantesDemo(estabelecimento) : null;
  const liberado = (m: Modulo) => moduloLiberadoNoPlano(m.id, estabelecimento);

  const papel = perfil?.role ?? 'professional';
  const modulos = useMemo(() => modulosVisiveis(papel, perfil?.preferencias_ui ?? { ocultar: [] }), [papel, perfil?.preferencias_ui]);
  const moduloAtual = moduloDaRota(location.pathname);

  // Grupos abertos/fechados (lembrado no navegador; o grupo da tela atual sempre abre).
  const [gruposFechados, setGruposFechados] = useState<IdGrupo[]>(() => {
    try { return JSON.parse(localStorage.getItem(CHAVE_GRUPOS) || '[]') as IdGrupo[]; } catch { return []; }
  });
  const alternarGrupo = (id: IdGrupo) => {
    setGruposFechados((atual) => {
      const novo = atual.includes(id) ? atual.filter((g) => g !== id) : [...atual, id];
      try { localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(novo)); } catch { /* preferência de tela; pode falhar */ }
      return novo;
    });
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

  // Botão + global: atalhos de criação (abre a tela já com a janela aberta)
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  useEffect(() => { setIsQuickAddOpen(false); }, [location.pathname, location.search]);
  const visivel = (id: Modulo['id']) => modulos.some((m) => m.id === id);
  const quickAddItems = [
    ...(visivel('agenda') ? [{ label: 'Agendamento', icon: CalendarPlus, to: '/agenda?novo=agendamento' }] : []),
    ...(visivel('clientes') && papel === 'admin' ? [{ label: 'Cliente', icon: UserPlus, to: '/clientes?nova=cliente' }] : []),
    ...(visivel('tarefas') ? [
      { label: 'Tarefa', icon: SquareCheckBig, to: '/tarefas?nova=tarefa' },
      { label: 'Novo quadro', icon: SquareKanban, to: '/tarefas?nova=quadro' },
    ] : []),
  ];
  const quickAddMenu = (alignClass: string) => isQuickAddOpen && (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setIsQuickAddOpen(false)} />
      <div role="menu" className={`absolute z-50 top-full mt-2 ${alignClass} w-48 bg-white border border-slate-200 rounded-xl shadow-xl p-1`}>
        {quickAddItems.map((item) => (
          <button key={item.to} type="button" role="menuitem" onClick={() => { setIsQuickAddOpen(false); navigate(item.to); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-600">
            <item.icon size={16} /> {item.label}
          </button>
        ))}
      </div>
    </>
  );

  const ativo = (m: Modulo) => moduloAtual?.id === m.id;

  /** Itens do menu agrupados como no sistema de referência (Meu Estabelecimento, Financeiro, Relatórios). */
  const renderNav = (modo: 'lateral' | 'gaveta') => {
    const compacto = modo === 'lateral' && isCollapsed;
    const link = (m: Modulo, recuado: boolean) => {
      const Icon = m.icone;
      const isActive = ativo(m);
      // Demonstração vencida: o item fica com cadeado e leva à página do plano.
      const bloqueado = !liberado(m);
      return (
        <Link
          key={m.id}
          to={bloqueado ? '/plano' : m.caminho}
          title={compacto ? m.rotulo : ''}
          aria-current={isActive ? 'page' : undefined}
          onClick={() => setIsMobileMenuOpen(false)}
          className={`flex items-center rounded-xl transition-all duration-200 group ${
            isActive ? 'bg-rose-50 text-rose-600 font-bold' : `${modo === 'gaveta' ? 'text-slate-700 font-medium' : 'text-slate-500'} hover:bg-slate-50 hover:text-rose-500`
          } ${compacto ? 'justify-center py-3' : `${recuado ? 'pl-9 pr-3' : 'px-4'} py-2.5 space-x-3`}`}
        >
          <Icon size={recuado ? 18 : 22} className={`shrink-0 ${isActive ? 'text-rose-600' : 'text-slate-400 group-hover:text-rose-500'}`} />
          {!compacto && <span className={`text-sm leading-tight ${recuado ? 'min-w-0' : 'whitespace-nowrap'} ${bloqueado ? 'opacity-60' : ''}`}>{m.rotulo}</span>}
          {!compacto && bloqueado && <Lock size={14} className="ml-auto shrink-0 text-slate-400" aria-label="Requer plano" />}
        </Link>
      );
    };

    const linkGlobal = adminGlobal && (
      <Link key="admin-global" to="/admin-global" title={compacto ? 'Administração global' : ''} onClick={() => setIsMobileMenuOpen(false)}
        aria-current={location.pathname.startsWith('/admin-global') ? 'page' : undefined}
        className={`flex items-center rounded-xl transition-all duration-200 group ${location.pathname.startsWith('/admin-global') ? 'bg-rose-50 text-rose-600 font-bold' : 'text-slate-500 hover:bg-slate-50 hover:text-rose-500'} ${compacto ? 'justify-center py-3' : 'px-4 py-2.5 space-x-3'}`}>
        <Building2 size={22} className="shrink-0" />
        {!compacto && <span className="text-sm leading-tight whitespace-nowrap">Administração global</span>}
      </Link>
    );
    return [...GRUPOS.map((g) => {
      const itens = modulos.filter((m) => m.grupo === g.id);
      if (!itens.length) return null;
      if (!g.rotulo || compacto) {
        return <div key={g.id} className="space-y-1">{itens.map((m) => link(m, false))}</div>;
      }
      const temAtivo = itens.some(ativo);
      const aberto = temAtivo || !gruposFechados.includes(g.id);
      const GIcon = g.icone!;
      return (
        <div key={g.id} className="space-y-1">
          <button
            type="button"
            onClick={() => alternarGrupo(g.id)}
            aria-expanded={aberto}
            className={`w-full flex items-center px-4 py-2.5 rounded-xl text-sm space-x-3 transition-colors ${temAtivo ? 'text-rose-600 font-bold' : 'text-slate-600 font-semibold hover:bg-slate-50'}`}
          >
            <GIcon size={22} className={`shrink-0 ${temAtivo ? 'text-rose-600' : 'text-slate-400'}`} />
            <span className="flex-1 text-left whitespace-nowrap">{g.rotulo}</span>
            <ChevronDown size={16} className={`shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
          </button>
          {aberto && <div className="space-y-1">{itens.map((m) => link(m, true))}</div>}
        </div>
      );
    }), linkGlobal];
  };

  // Faixa da demonstração (RF-10): dias restantes; vencida, explica o que segue funcionando.
  const faixaPlano = estabelecimento?.plano === 'demonstracao' && estabelecimento.demo_expira_em && (
    <Link to="/plano" className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-center ${demoVencida ? 'bg-red-50 text-red-700 border-b border-red-100' : 'bg-amber-50 text-amber-800 border-b border-amber-100'}`}>
      <Gem size={14} className="shrink-0" />
      {demoVencida
        ? 'A demonstração terminou: agenda, clientes e cadastros seguem funcionando. Veja como liberar o restante.'
        : `Demonstração com acesso completo: ${diasDemo === 1 ? 'falta 1 dia' : `faltam ${diasDemo} dias`}.`}
    </Link>
  );

  const identificacao = perfil && (
    <div className="min-w-0">
      <p className="text-sm font-bold text-slate-800 truncate">{perfil.name}</p>
      <p className="text-[11px] font-semibold text-rose-600 truncate">{ROTULO_PAPEL[perfil.role]}</p>
    </div>
  );

  return (
    <div className="app-shell flex h-screen font-sans overflow-hidden">

      {/* MENU LATERAL DESKTOP (Esconde no celular e tablet, exibe no PC a partir de 1024px) */}
      <aside
        className={`glass hidden lg:flex flex-col bg-white border-r border-slate-200 shadow-sm transition-all duration-300 ease-in-out z-20 ${isCollapsed ? 'w-20' : 'w-64'}`}
      >
        {/* Topo / Logo */}
        <div className="h-20 flex flex-col items-center justify-center border-b border-slate-100 shrink-0 px-3">
          <h1 className={`font-black text-rose-600 transition-all duration-300 ${isCollapsed ? 'text-xl' : 'text-2xl'}`}>
            {isCollapsed ? 'JB' : 'Jake Beauty'}
          </h1>
          {!isCollapsed && perfil && <p className="text-[11px] text-slate-500 truncate max-w-full">{perfil.name} · {ROTULO_PAPEL[perfil.role]}</p>}
        </div>

        {/* Botão + global (atalhos de criação) */}
        {quickAddItems.length > 0 && (
          <div className="relative px-3 pt-4">
            <button
              type="button"
              onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
              title={isCollapsed ? 'Novo' : ''}
              aria-haspopup="menu"
              aria-expanded={isQuickAddOpen}
              className={`flex items-center w-full bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm transition-colors font-bold ${isCollapsed ? 'justify-center py-3' : 'px-4 py-3 space-x-3'}`}
            >
              <Plus size={22} className="shrink-0" />
              {!isCollapsed && <span className="whitespace-nowrap">Novo</span>}
            </button>
            {quickAddMenu('left-3')}
          </div>
        )}

        {/* Links de Navegação */}
        <nav aria-label="Menu principal" className="flex-1 px-3 py-5 space-y-2 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {renderNav('lateral')}
        </nav>

        {/* Rodapé: recolher menu (tema, senha e sair ficam em Configurações) */}
        <div className="p-4 border-t border-slate-100 space-y-2 shrink-0">
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
        <header className="glass bg-white px-2 sm:px-4 h-16 flex items-center justify-between border-b border-slate-200 shadow-sm lg:hidden shrink-0 z-30">
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
              {moduloAtual && <p className="text-xs text-slate-500 truncate leading-tight">{moduloAtual.rotulo}</p>}
            </div>
          </div>
          <div className="relative flex items-center">
            {quickAddItems.length > 0 && (
              <button onClick={() => setIsQuickAddOpen(!isQuickAddOpen)} className="ml-1 p-2 bg-rose-600 text-white rounded-lg" aria-label="Novo" aria-haspopup="menu" aria-expanded={isQuickAddOpen}>
                <Plus size={22} />
              </button>
            )}
            {quickAddMenu('right-0')}
          </div>
        </header>

        {/* Menu sanduíche (gaveta lateral) do celular e tablet */}
        <div className={`lg:hidden fixed inset-0 z-50 ${isMobileMenuOpen ? '' : 'pointer-events-none'}`} aria-hidden={!isMobileMenuOpen}>
          {/* Fundo escurecido: toque fora fecha o menu */}
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'}`}
          />

          <aside
            className={`glass glass-forte absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white flex flex-col transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
          >
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 shrink-0 gap-2">
              {identificacao ?? <h2 className="text-xl font-black text-rose-600">Jake Beauty</h2>}
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg shrink-0" aria-label="Fechar menu">
                <X size={24} />
              </button>
            </div>

            <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
              {renderNav('gaveta')}
            </nav>

          </aside>
        </div>

        {faixaPlano}
        {perfil?.role === 'admin' && nivel.atual !== 'aal2' && (
          <Link to="/configuracoes#seguranca" className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-center bg-amber-50 text-amber-800 border-b border-amber-100">
            <ShieldAlert size={14} className="shrink-0" />
            {nivel.proximo === 'aal2'
              ? 'Confirme o código do autenticador para criar acessos, alterar a equipe e ver os logs.'
              : 'Ative a verificação em duas etapas: é obrigatória para criar acessos, alterar a equipe e ver os logs.'}
          </Link>
        )}

        {/* Tela que renderiza as páginas (Agenda, Dashboard, etc) */}
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
