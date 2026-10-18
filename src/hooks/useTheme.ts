import { useEffect, useState } from 'react';
import { CHAVE_VISUAL, lerVisual, opcaoVisual, type Visual } from '../features/acesso/visual';

const EVENTO = 'jb-tema';

// Lê a preferência salva; se não houver, segue o tema do sistema operacional
function visualInicial(): Visual {
  let salvo: string | null = null;
  try { salvo = localStorage.getItem(CHAVE_VISUAL); } catch {}
  return lerVisual(salvo, !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

/** Visual da tela. Várias instâncias (layout e Configurações) ficam sincronizadas por um evento da janela. */
export function useTheme() {
  const [visual, setVisualLocal] = useState<Visual>(visualInicial);

  useEffect(() => {
    const opcao = opcaoVisual(visual);
    const raiz = document.documentElement.classList;
    raiz.toggle('dark', opcao.escuro);
    raiz.toggle('tema-jake', opcao.jake);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', opcao.corBarra);
    try { localStorage.setItem(CHAVE_VISUAL, visual); } catch {}
  }, [visual]);

  useEffect(() => {
    const aoMudar = (e: Event) => setVisualLocal((e as CustomEvent<Visual>).detail);
    window.addEventListener(EVENTO, aoMudar);
    return () => window.removeEventListener(EVENTO, aoMudar);
  }, []);

  const setVisual = (novo: Visual) => window.dispatchEvent(new CustomEvent<Visual>(EVENTO, { detail: novo }));

  return { visual, setVisual };
}
