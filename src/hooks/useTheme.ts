import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'jb-theme';
const EVENTO = 'jb-tema';

// Lê a preferência salva; se não houver, segue o tema do sistema operacional
function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Tema da tela. Várias instâncias (layout e Configurações) ficam sincronizadas por um evento da janela. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f172a' : '#e11d48');
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }, [theme]);

  useEffect(() => {
    const aoMudar = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener(EVENTO, aoMudar);
    return () => window.removeEventListener(EVENTO, aoMudar);
  }, []);

  const toggleTheme = () => {
    const novo: Theme = theme === 'dark' ? 'light' : 'dark';
    window.dispatchEvent(new CustomEvent<Theme>(EVENTO, { detail: novo }));
  };

  return { theme, toggleTheme };
}
