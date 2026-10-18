import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, ChevronDown, ChevronUp, Lock, Building2, Gem, ShieldAlert, PanelLeftClose, PanelLeftOpen,
  Sparkles, Settings, UserRound, LogOut, Smartphone,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { GRUPOS, ROTULO_PAPEL, moduloDaRota, modulosVisiveis, type IdGrupo, type Modulo } from '../features/acesso/modulos';
import { modoComputadorNoCelular } from '../features/acesso/visual';
import { ROTULO_PLANO, demoExpirada, diasRestantesDemo, moduloLiberadoNoPlano } from '../features/plano/plano';

const CHAVE_GRUPOS = 'jb-menu-grupos';

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { perfil, user, adminGlobal, nivel, signOut } = useAuth();
  // Aplica o tema salvo ao abrir o portal; a troca fica em Configurações.
  useTheme();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Estado que controla se o menu do PC está largo ou apenas com os ícones
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Celular aberto como computador (Site para computador ou zoom reduzido): avisa como voltar ao
  // layout de celular, porque nesse modo o navegador ignora a configuração de tela do portal.
  const CHAVE_AVISO_CELULAR = 'jb-aviso-modo-computador';
  const [avisoCelular, setAvisoCelular] = useState(false);
  useEffect(() => {
    let dispensado = false;
    try { dispensado = localStorage.getItem(CHAVE_AVISO_CELULAR) === '1'; } catch { /* preferência de tela */ }
    if (dispensado) return;
    const conferir = () => setAvisoCelular(modoComputadorNoCelular({
      toque: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      telaLargura: window.screen?.width ?? 0,
      janelaLargura: window.innerWidth,
      escala: window.visualViewport?.scale ?? 1,
    }));
    conferir();
    window.addEventListener('resize', conferir);
    return () => window.removeEventListener('resize', conferir);
  }, []);
  const dispensarAvisoCelular = () => {
    setAvisoCelular(false);
    try { localStorage.setItem(CHAVE_AVISO_CELULAR, '1'); } catch { /* preferência de tela; pode falhar */ }
  };

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

  const ativo = (m: Modulo) => moduloAtual?.id === m.id;
  const sairDoSistema = async () => { setMenuConta(false); await signOut(); navigate('/login'); };

  // Menu da conta (rodapé): fecha ao trocar de tela, com Esc ou com clique fora.
  const [menuConta, setMenuConta] = useState(false);
  const refsConta = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => { setMenuConta(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuConta) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuConta(false); };
    const onClique = (e: MouseEvent) => {
      if (!refsConta.current.some((el) => el?.contains(e.target as Node))) setMenuConta(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClique);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClique); };
  }, [menuConta]);

  // Classes comuns dos itens: o ativo ganha fundo e borda rosa, como no modelo de referência.
  // grande: gaveta do celular, com letra maior e altura de toque de 48px.
  const classeItem = (isActive: boolean, compacto: boolean, extra = '', grande = false) =>
    `flex items-center rounded-xl border transition-all duration-200 group ${
      isActive ? 'bg-rose-50 border-rose-200 text-rose-600 font-bold shadow-sm' : 'border-transparent text-slate-600 font-medium hover:bg-slate-50 hover:text-rose-500'
    } ${compacto ? 'justify-center py-2.5' : `${grande ? 'gap-3.5 min-h-[48px] py-2.5' : 'gap-3 py-2'} ${extra || 'px-3'}`}`;

  /** Itens do menu: módulos soltos, grupos com setinha e, abaixo do divisor, os itens de sistema. */
  const renderNav = (compacto: boolean, grande = false) => {
    const texto = grande ? 'text-base' : 'text-sm';
    const link = (m: Modulo, recuado: boolean, discreto = false) => {
      const Icon = m.icone;
      const isActive = ativo(m);
      // Demonstração vencida: o item fica com cadeado e leva à página do plano.
      const bloqueado = !liberado(m);
      return (
        <Link
          key={m.id}
          to={bloqueado ? '/plano' : m.caminho}
          title={compacto ? m.rotulo : undefined}
          aria-current={isActive ? 'page' : undefined}
          onClick={() => setIsMobileMenuOpen(false)}
          className={`${classeItem(isActive, compacto, recuado ? (grande ? 'pl-11 pr-3' : 'pl-10 pr-3') : '', grande)} ${discreto && !isActive ? (grande ? 'text-slate-500' : 'text-slate-400') : ''}`}
        >
          <Icon size={grande ? (recuado ? 20 : 22) : (recuado ? 16 : 20)} className={`shrink-0 ${isActive ? 'text-rose-600' : 'text-slate-400 group-hover:text-rose-500'}`} />
          {!compacto && <span className={`flex-1 ${texto} leading-tight ${recuado ? 'min-w-0' : 'whitespace-nowrap'} ${bloqueado ? 'opacity-60' : ''}`}>{m.rotulo}</span>}
          {!compacto && bloqueado && <Lock size={14} className="shrink-0 text-slate-400" aria-label="Requer plano" />}
        </Link>
      );
    };

    const grupos = GRUPOS.filter((g) => g.id !== 'sistema').map((g) => {
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
            className={`w-full flex items-center px-3 rounded-xl border border-transparent ${grande ? 'gap-3.5 min-h-[48px] py-2.5 text-base' : 'gap-3 py-2 text-sm'} transition-colors group ${temAtivo ? 'text-rose-600 font-bold' : 'text-slate-600 font-medium hover:bg-slate-50 hover:text-rose-500'}`}
          >
            <GIcon size={grande ? 22 : 20} className={`shrink-0 ${temAtivo ? 'text-rose-600' : 'text-slate-400 group-hover:text-rose-500'}`} />
            <span className="flex-1 text-left whitespace-nowrap">{g.rotulo}</span>
            <ChevronDown size={grande ? 20 : 16} className={`shrink-0 text-rose-400 transition-transform ${aberto ? 'rotate-180' : ''}`} />
          </button>
          {aberto && <div className="space-y-1">{itens.map((m) => link(m, true))}</div>}
        </div>
      );
    });

    // Configurações sai do menu: fica no menu da conta, no rodapé.
    const sistema = modulos.filter((m) => m.grupo === 'sistema' && m.id !== 'configuracoes');
    const emGlobal = location.pathname.startsWith('/admin-global');
    const linkGlobal = adminGlobal && (
      <Link key="admin-global" to="/admin-global" title={compacto ? 'Administração global' : undefined} onClick={() => setIsMobileMenuOpen(false)}
        aria-current={emGlobal ? 'page' : undefined}
        className={`${classeItem(emGlobal, compacto, '', grande)} ${emGlobal ? '' : grande ? 'text-slate-500' : 'text-slate-400'}`}>
        <Building2 size={grande ? 22 : 20} className={`shrink-0 ${emGlobal ? 'text-rose-600' : 'text-slate-400 group-hover:text-rose-500'}`} />
        {!compacto && <span className={`${texto} leading-tight whitespace-nowrap`}>Administração global</span>}
      </Link>
    );
    const rodapeNav = (sistema.length > 0 || linkGlobal) && (
      <div key="sistema" className="pt-3 mt-3 border-t border-slate-100 space-y-1">
        {sistema.map((m) => link(m, false, true))}
        {linkGlobal}
      </div>
    );
    return [...grupos, rodapeNav];
  };

  const iniciais = (perfil?.name ?? '')
    .split(/\s+/).filter(Boolean)
    .map((p, i, arr) => (i === 0 || i === arr.length - 1 ? p[0] : ''))
    .join('').toUpperCase() || 'JB';
  const avatar = (tamanho: string) => (
    <span className={`${tamanho} shrink-0 rounded-full border-2 border-rose-400 bg-rose-50 text-rose-600 font-black flex items-center justify-center`} aria-hidden="true">
      {iniciais}
    </span>
  );
  const seloPlano = estabelecimento && (
    <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-black uppercase tracking-wide">
      {ROTULO_PLANO[estabelecimento.plano]}
    </span>
  );

  /** Cartão da conta no rodapé: a setinha abre o menu com perfil, configurações e sair. */
  const cartaoConta = (compacto: boolean, indice: number, grande = false) => perfil && (
    <div ref={(el) => { refsConta.current[indice] = el; }} className="relative shrink-0 border-t border-slate-100 p-3">
      {menuConta && (
        <div
          role="menu"
          aria-label="Menu da conta"
          className={`absolute z-40 w-64 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden ${compacto ? 'left-full bottom-3 ml-2' : 'left-3 right-3 bottom-full mb-2 w-auto'}`}
        >
          <div className="flex items-center gap-3 p-4 border-b border-slate-100">
            {avatar('w-11 h-11 text-sm')}
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{perfil.name}</p>
              {user?.email && <p className="text-xs text-slate-500 truncate">{user.email}</p>}
              <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 text-[11px] font-bold">{ROTULO_PAPEL[perfil.role]}</span>
            </div>
          </div>
          <div className="p-1.5">
            <Link role="menuitem" to="/configuracoes#conta" className={`flex items-center gap-3 px-3 rounded-lg text-slate-700 hover:bg-slate-50 hover:text-rose-500 ${grande ? 'min-h-[48px] text-base' : 'py-2 text-sm'}`}>
              <UserRound size={18} className="text-slate-400" /> Meu perfil
            </Link>
            <Link role="menuitem" to="/configuracoes" className={`flex items-center gap-3 px-3 rounded-lg text-slate-700 hover:bg-slate-50 hover:text-rose-500 ${grande ? 'min-h-[48px] text-base' : 'py-2 text-sm'}`}>
              <Settings size={18} className="text-slate-400" /> Configurações
            </Link>
          </div>
          <div className="p-1.5 border-t border-slate-100">
            <button role="menuitem" type="button" onClick={sairDoSistema}
              className={`w-full flex items-center gap-3 px-3 rounded-lg font-bold text-red-600 hover:bg-red-50 ${grande ? 'min-h-[48px] text-base' : 'py-2 text-sm'}`}>
              <LogOut size={18} /> Sair
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setMenuConta((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuConta}
        aria-label="Abrir menu da conta"
        title={compacto ? perfil.name : undefined}
        className={`w-full flex items-center rounded-xl hover:bg-slate-50 transition-colors ${compacto ? 'justify-center p-1' : 'gap-3 p-2 text-left'}`}
      >
        {avatar('w-10 h-10 text-sm')}
        {!compacto && (
          <>
            <span className="flex-1 min-w-0">
              <span className={`block font-bold text-slate-800 truncate ${grande ? 'text-base' : 'text-sm'}`}>{perfil.name}</span>
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs text-slate-500 truncate">{ROTULO_PAPEL[perfil.role]}</span>
                {seloPlano}
              </span>
            </span>
            <ChevronUp size={16} className={`shrink-0 text-rose-400 transition-transform ${menuConta ? '' : 'rotate-180'}`} />
          </>
        )}
      </button>
      {!compacto && <p className="mt-2 px-2 text-[10px] text-slate-400">Jake Beauty v1.0</p>}
    </div>
  );

  /** Topo: marca, estabelecimento e quem está conectado. */
  const marca = (compacto: boolean) => (
    <div className={`flex items-center min-w-0 ${compacto ? 'justify-center' : 'gap-3'}`}>
      <span className="w-10 h-10 shrink-0 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-sm" aria-hidden="true">
        <Sparkles size={20} />
      </span>
      {!compacto && (
        <div className="min-w-0">
          <p className="text-base font-black tracking-[0.18em] text-slate-800 leading-tight uppercase">Jake Beauty</p>
          <p className="text-[10px] font-bold tracking-[0.2em] text-rose-600 uppercase truncate">{estabelecimento?.nome ?? 'Studio'}</p>
          {perfil && <p className="text-[11px] text-slate-500 truncate">{perfil.name}</p>}
        </div>
      )}
    </div>
  );

  // Faixa da demonstração (RF-10): dias restantes; vencida, explica o que segue funcionando.
  const faixaPlano = estabelecimento?.plano === 'demonstracao' && estabelecimento.demo_expira_em && (
    <Link to="/plano" className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-center ${demoVencida ? 'bg-red-50 text-red-700 border-b border-red-100' : 'bg-amber-50 text-amber-800 border-b border-amber-100'}`}>
      <Gem size={14} className="shrink-0" />
      {demoVencida
        ? 'A demonstração terminou: agenda, clientes e cadastros seguem funcionando. Veja como liberar o restante.'
        : `Demonstração com acesso completo: ${diasDemo === 1 ? 'falta 1 dia' : `faltam ${diasDemo} dias`}.`}
    </Link>
  );

  return (
    <div className="app-shell flex h-screen font-sans overflow-hidden">

      {/* MENU LATERAL DESKTOP (Esconde no celular e tablet, exibe no PC a partir de 1024px) */}
      <aside
        className={`glass hidden lg:flex flex-col bg-white border-r border-slate-200 shadow-sm transition-all duration-300 ease-in-out z-20 ${isCollapsed ? 'w-20' : 'w-64'}`}
      >
        {/* Topo: marca e botão de recolher no canto, como no modelo */}
        <div className={`relative shrink-0 border-b border-slate-100 ${isCollapsed ? 'px-3 pt-12 pb-4' : 'px-4 pt-5 pb-4'}`}>
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`absolute top-3 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-500 ${isCollapsed ? 'left-1/2 -translate-x-1/2' : 'right-2'}`}
            title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          {marca(isCollapsed)}
        </div>

        {/* Links de Navegação */}
        <nav aria-label="Menu principal" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {renderNav(isCollapsed)}
        </nav>

        {/* Rodapé: conta (perfil, configurações e sair na setinha) */}
        {cartaoConta(isCollapsed, 0)}
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
        </header>

        {/* Menu sanduíche (gaveta lateral) do celular e tablet */}
        <div className={`lg:hidden fixed inset-0 z-50 ${isMobileMenuOpen ? '' : 'pointer-events-none'}`} aria-hidden={!isMobileMenuOpen}>
          {/* Fundo escurecido: toque fora fecha o menu */}
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'}`}
          />

          <aside
            className={`glass glass-forte absolute inset-y-0 left-0 w-80 max-w-[88vw] bg-white flex flex-col transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
          >
            <div className="relative px-4 pt-5 pb-4 border-b border-slate-100 shrink-0">
              <button onClick={() => setIsMobileMenuOpen(false)} className="absolute top-3 right-2 p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg" aria-label="Fechar menu">
                <X size={20} />
              </button>
              {marca(false)}
            </div>

            <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {renderNav(false, true)}
            </nav>

            {cartaoConta(false, 1, true)}
          </aside>
        </div>

        {avisoCelular && (
          <div role="alert" className="shrink-0 bg-rose-600 text-white px-6 py-6 flex items-start gap-5 text-[34px] leading-snug">
            <Smartphone size={56} className="shrink-0 mt-1" />
            <div className="flex-1 min-w-0">
              <p className="font-black">O celular está abrindo a versão de computador, por isso as letras ficam pequenas.</p>
              <p className="mt-2">No Chrome, toque nos três pontinhos (⋮) e <strong>desmarque "Site para computador"</strong>. Se continuar pequeno, volte o zoom da página para 100% em Configurações do Chrome &gt; Acessibilidade.</p>
            </div>
            <button type="button" onClick={dispensarAvisoCelular} aria-label="Fechar aviso" className="shrink-0 p-3 rounded-2xl hover:bg-white/15"><X size={48} /></button>
          </div>
        )}
        {faixaPlano}
        {/* Aviso do autenticador só em Configurações, onde fica a seção de segurança. */}
        {perfil?.role === 'admin' && nivel.atual !== 'aal2' && location.pathname.startsWith('/configuracoes') && (
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
