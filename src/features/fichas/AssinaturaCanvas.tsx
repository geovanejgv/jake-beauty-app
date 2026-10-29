import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

export type AssinaturaRef = {
  /** PNG em data URL, ou null se o traço for curto demais para valer como assinatura. */
  imagem: () => string | null;
  limpar: () => void;
};

/** Traço mínimo (em pixels de tela) para não aceitar um ponto ou risco acidental. */
const TRACO_MINIMO = 120;
/** Mais que 2x não melhora a impressão e só pesa o arquivo. */
const ESCALA_MAX = 2;

/**
 * Quadro de assinatura com o dedo ou caneta (eventos de ponteiro, sem biblioteca).
 * Gera PNG transparente; o banco confere a assinatura do arquivo (UPL-01).
 */
export const AssinaturaCanvas = forwardRef<AssinaturaRef, { rotulo: string; onMudar?: (assinou: boolean) => void; classeBorda?: string }>(
  function AssinaturaCanvas({ rotulo, onMudar, classeBorda = 'border-slate-400' }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const desenhando = useRef(false);
    const ultimo = useRef<{ x: number; y: number } | null>(null);
    const comprimento = useRef(0);
    const [assinou, setAssinou] = useState(false);

    const preparar = useCallback(() => {
      const c = canvas.current;
      if (!c) return;
      const escala = Math.min(window.devicePixelRatio || 1, ESCALA_MAX);
      const { width, height } = c.getBoundingClientRect();
      c.width = Math.round(width * escala);
      c.height = Math.round(height * escala);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(escala, 0, 0, escala, 0, 0);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
      comprimento.current = 0;
      setAssinou(false);
    }, []);

    useEffect(() => {
      preparar();
      // Girar o celular muda o tamanho: o quadro recomeça para não distorcer o traço.
      const aoGirar = () => preparar();
      window.addEventListener('orientationchange', aoGirar);
      return () => window.removeEventListener('orientationchange', aoGirar);
    }, [preparar]);

    useEffect(() => { onMudar?.(assinou); }, [assinou, onMudar]);

    useImperativeHandle(ref, () => ({
      imagem: () => (canvas.current && comprimento.current >= TRACO_MINIMO ? canvas.current.toDataURL('image/png') : null),
      limpar: preparar,
    }), [preparar]);

    const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const iniciar = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      desenhando.current = true;
      ultimo.current = ponto(e);
    };

    const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!desenhando.current || !ultimo.current) return;
      const ctx = e.currentTarget.getContext('2d');
      if (!ctx) return;
      const p = ponto(e);
      const a = ultimo.current;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      comprimento.current += Math.hypot(p.x - a.x, p.y - a.y);
      ultimo.current = p;
      if (!assinou && comprimento.current >= TRACO_MINIMO) setAssinou(true);
    };

    const terminar = () => {
      desenhando.current = false;
      ultimo.current = null;
    };

    return (
      <div className="space-y-1.5">
        <div className="flex items-end justify-between gap-2">
          <span className="text-sm font-medium">{rotulo}</span>
          <button type="button" onClick={preparar} className="inline-flex items-center gap-1 text-xs font-semibold opacity-70 hover:opacity-100">
            <Eraser size={14} /> Limpar
          </button>
        </div>
        <div className={`relative rounded-xl border-2 border-dashed bg-white ${classeBorda}`}>
          <canvas
            ref={canvas}
            aria-label={rotulo}
            className="block w-full h-44 sm:h-52 touch-none cursor-crosshair"
            onPointerDown={iniciar}
            onPointerMove={mover}
            onPointerUp={terminar}
            onPointerCancel={terminar}
            onPointerLeave={terminar}
          />
          {!assinou && (
            <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-slate-400">
              Assine aqui com o dedo
            </span>
          )}
          <span className="pointer-events-none absolute left-4 right-4 bottom-9 border-b border-slate-300" />
        </div>
      </div>
    );
  });
