import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** true enquanto a media query casar (atualiza ao girar/redimensionar). */
export function useMedia(query: string): boolean {
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setOk(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return ok;
}

/** Celular e tablet: sem arrastar, com seletor de coluna e setas; botões sempre visíveis. */
export const useToque = () => useMedia('(max-width: 1023px), (pointer: coarse)');
/** Celular: janelas e filtros em tela cheia, colunas deslizantes. */
export const useCelular = () => useMedia('(max-width: 767px)');

function useEsc(ativo: boolean, onClose: () => void) {
  useEffect(() => {
    if (!ativo) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [ativo, onClose]);
}

/** Janela: tela cheia no celular; caixa centralizada com faixa rosa à esquerda no PC. */
export function Modal({
  titulo,
  onClose,
  children,
  rodape,
  largura = 'md:max-w-[640px]',
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  largura?: string;
}) {
  useEsc(true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-[60] flex md:items-center md:justify-center bg-slate-900/60 md:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className={`relative bg-white w-full h-full md:h-auto md:max-h-[92vh] ${largura} md:rounded-2xl shadow-2xl flex flex-col overflow-hidden md:pl-1.5`}>
        <div className="hidden md:block absolute inset-y-0 left-0 w-1.5 bg-rose-600" aria-hidden />
        <div className="flex items-center justify-between px-4 md:px-6 h-14 md:h-16 border-b border-slate-100 shrink-0">
          <h3 className="text-lg font-bold text-slate-800 truncate">{titulo}</h3>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 rounded-lg" aria-label="Fechar"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">{children}</div>
        {rodape && <div className="px-4 md:px-6 py-3 border-t border-slate-100 shrink-0 bg-white">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Painel de filtro: popover abaixo do botão no PC; tela cheia no celular (título, X e rodapé). */
export function Painel({
  aberto,
  titulo,
  onClose,
  children,
  rodape,
  alinhar = 'left',
}: {
  aberto: boolean;
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  alinhar?: 'left' | 'right';
}) {
  const celular = useCelular();
  useEsc(aberto, onClose);
  if (!aberto) return null;
  if (celular) {
    return createPortal(
      <div className="fixed inset-0 z-[60] bg-white flex flex-col" role="dialog" aria-label={titulo}>
        <div className="flex items-center justify-between px-4 h-14 border-b border-slate-100 shrink-0">
          <h3 className="text-base font-bold text-slate-800">{titulo}</h3>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-slate-400" aria-label="Fechar"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {rodape && <div className="px-4 py-3 border-t border-slate-100 shrink-0">{rodape}</div>}
      </div>,
      document.body,
    );
  }
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div role="dialog" aria-label={titulo} className={`absolute z-50 top-full mt-2 ${alinhar === 'right' ? 'right-0' : 'left-0'} bg-white border border-slate-200 rounded-xl shadow-xl min-w-[260px] max-w-[min(520px,90vw)]`}>
        <div className="p-3 max-h-[60vh] overflow-y-auto">{children}</div>
        {rodape && <div className="px-3 py-2 border-t border-slate-100">{rodape}</div>}
      </div>
    </>
  );
}

export function BotoesRodape({ onCancelar, onAplicar, textoAplicar = 'APLICAR', desabilitado }: { onCancelar: () => void; onAplicar: () => void; textoAplicar?: string; desabilitado?: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancelar} className="px-4 py-2 text-xs font-bold tracking-wide text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">CANCELAR</button>
      <button type="button" onClick={onAplicar} disabled={desabilitado} className="px-4 py-2 text-xs font-bold tracking-wide text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">{textoAplicar}</button>
    </div>
  );
}

export function Confirmar({ titulo, texto, botao, onConfirmar, onCancelar, ocupado }: { titulo: string; texto: string; botao: string; onConfirmar: () => void; onCancelar: () => void; ocupado?: boolean }) {
  useEsc(true, onCancelar);
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-slate-900/60 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancelar(); }}>
      <div role="alertdialog" aria-label={titulo} className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <h3 className="text-lg font-bold text-slate-800">{titulo}</h3>
        <p className="text-sm text-slate-600">{texto}</p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancelar} className="flex-1 border border-slate-200 py-2.5 rounded-xl text-slate-600 font-medium">Voltar</button>
          <button type="button" onClick={onConfirmar} disabled={ocupado} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-bold disabled:opacity-50">{botao}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Rótulo + campo. Use `composto` quando o conteúdo tiver vários controles (busca com sugestões etc.):
 * dentro de um <label>, o navegador repassaria cliques para o primeiro controle.
 */
export function Campo({ rotulo, obrigatorio, children, dica, composto }: { rotulo: string; obrigatorio?: boolean; children: React.ReactNode; dica?: React.ReactNode; composto?: boolean }) {
  const Tag = composto ? 'div' : 'label';
  return (
    <Tag className="block">
      <span className="block text-xs font-bold text-slate-500 mb-1">{rotulo}{obrigatorio && ' *'}</span>
      {children}
      {dica && <span className="block text-[11px] text-slate-400 mt-1">{dica}</span>}
    </Tag>
  );
}

export const inputCls = 'w-full border border-slate-200 bg-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm text-slate-800';

/** Aviso flutuante de erro, some sozinho. */
export function Aviso({ texto, onFechar }: { texto: string | null; onFechar: () => void }) {
  useEffect(() => {
    if (!texto) return;
    const t = setTimeout(onFechar, 5000);
    return () => clearTimeout(t);
  }, [texto, onFechar]);
  if (!texto) return null;
  return createPortal(
    <div role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] bg-slate-800 text-white text-sm px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 max-w-[92vw]">
      <span>{texto}</span>
      <button type="button" onClick={onFechar} className="text-slate-300 hover:text-white" aria-label="Fechar aviso"><X size={16} /></button>
    </div>,
    document.body,
  );
}
