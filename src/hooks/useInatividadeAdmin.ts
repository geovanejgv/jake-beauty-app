import { useEffect, useRef } from 'react';
import { lerAtividade, marcarAtividade, passouDoLimite, segundosOcioso } from '../features/acesso/inatividade';

const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Encerra a sessão da administradora parada há mais de 30 minutos (L-09 adaptado).
 * Só gestos de quem usa contam como atividade; atualizações automáticas, não (L-10).
 */
export function useInatividadeAdmin(ativo: boolean, aoExpirar: () => void) {
  const expirar = useRef(aoExpirar);
  expirar.current = aoExpirar;

  useEffect(() => {
    if (!ativo) return;
    const conferir = () => {
      if (passouDoLimite(segundosOcioso(lerAtividade()))) {
        expirar.current();
        return true;
      }
      return false;
    };
    // Portal reaberto depois de muito tempo parado: sai antes de mostrar qualquer coisa.
    if (conferir()) return;
    marcarAtividade();
    let gravadoEm = Date.now();
    const gesto = () => {
      if (Date.now() - gravadoEm < 15_000) return;
      gravadoEm = Date.now();
      marcarAtividade();
    };
    const aoVoltar = () => { if (document.visibilityState === 'visible') conferir(); };
    EVENTOS.forEach((e) => window.addEventListener(e, gesto, { passive: true }));
    document.addEventListener('visibilitychange', aoVoltar);
    const relogio = window.setInterval(conferir, 30_000);
    return () => {
      EVENTOS.forEach((e) => window.removeEventListener(e, gesto));
      document.removeEventListener('visibilitychange', aoVoltar);
      window.clearInterval(relogio);
    };
  }, [ativo]);
}
