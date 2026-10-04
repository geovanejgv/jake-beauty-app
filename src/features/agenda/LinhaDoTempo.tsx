import React, { useMemo } from 'react';
import { Lock } from 'lucide-react';
import { colunasSobrepostas, posicaoNaLinha, type Faixa } from './logic';

export type EventoLinha = {
  id: string; start_time: string; end_time: string; status: string | null; professional_id: string | null;
  is_block?: boolean | null; block_reason?: string | null; cliente: string; servico: string; cor?: string;
};

const PX_HORA = 64;
const COR_STATUS: Record<string, string> = {
  scheduled: 'bg-rose-50 border-rose-300 text-rose-900',
  confirmed: 'bg-emerald-50 border-emerald-400 text-emerald-900',
  completed: 'bg-slate-100 border-slate-300 text-slate-500 line-through',
  cancelled: 'bg-slate-50 border-slate-200 text-slate-400 line-through opacity-60',
  no_show: 'bg-amber-50 border-amber-300 text-amber-700 line-through',
};

/**
 * Visão "Equipe" da agenda: um dia em colunas por profissional, com a grade de horários.
 * Clique em horário vazio agenda já com profissional e hora; clique no evento abre a edição.
 */
export function LinhaDoTempo({ eventos, profissionais, mostrarSemProfissional, onNovo, onAbrir }: {
  eventos: EventoLinha[];
  profissionais: { id: string; name: string }[];
  mostrarSemProfissional: boolean;
  onNovo: (profissionalId: string | null, hora: string) => void;
  onAbrir: (id: string) => void;
}) {
  const janela: Faixa = useMemo(() => {
    let ini = 7 * 60, fim = 21 * 60;
    for (const e of eventos) {
      const a = new Date(e.start_time); const b = new Date(e.end_time);
      ini = Math.min(ini, a.getHours() * 60);
      fim = Math.max(fim, Math.min(24 * 60, (b.getHours() + (b.getMinutes() ? 1 : 0)) * 60));
    }
    return { inicioMin: ini, fimMin: fim };
  }, [eventos]);
  const horas = Array.from({ length: (janela.fimMin - janela.inicioMin) / 60 }, (_, i) => janela.inicioMin / 60 + i);
  const altura = horas.length * PX_HORA;
  const colunas = [
    ...profissionais.map((p) => ({ id: p.id as string | null, nome: p.name })),
    ...(mostrarSemProfissional ? [{ id: null as string | null, nome: 'Sem profissional' }] : []),
  ];

  const clicarGrade = (profissionalId: string | null, ev: React.MouseEvent<HTMLDivElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const min = janela.inicioMin + Math.floor(((ev.clientY - r.top) / r.height) * (janela.fimMin - janela.inicioMin) / 15) * 15;
    onNovo(profissionalId, `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
  };

  if (!colunas.length) return <p className="p-6 text-sm text-slate-400 text-center">Nenhum profissional para mostrar.</p>;

  return (
    <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
      <div className="flex min-w-max">
        <div className="sticky left-0 z-20 bg-white w-14 shrink-0 border-r border-slate-200">
          <div className="h-10 border-b border-slate-200" />
          <div className="relative" style={{ height: altura }}>
            {horas.map((h, i) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] font-bold text-slate-400" style={{ top: i * PX_HORA }}>{i ? `${String(h).padStart(2, '0')}:00` : ''}</span>
            ))}
          </div>
        </div>
        {colunas.map((c) => {
          const doProf = colunasSobrepostas(eventos.filter((e) => e.professional_id === c.id));
          return (
            <div key={c.id ?? 'sem'} className="w-48 md:w-56 shrink-0 border-r border-slate-200">
              <div className="sticky top-0 z-10 h-10 flex items-center justify-center px-2 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700 truncate">{c.nome}</div>
              <div className="relative cursor-pointer" style={{ height: altura }} onClick={(e) => clicarGrade(c.id, e)}
                role="grid" aria-label={`Agenda de ${c.nome}`}>
                {horas.map((h, i) => <div key={h} className="absolute inset-x-0 border-t border-slate-100" style={{ top: i * PX_HORA }} aria-hidden />)}
                {doProf.map((e) => {
                  const pos = posicaoNaLinha(new Date(e.start_time), new Date(e.end_time), janela);
                  if (!pos) return null;
                  const hora = new Date(e.start_time).toTimeString().slice(0, 5);
                  const largura = 100 / e.faixas;
                  return (
                    <button key={e.id} type="button"
                      onClick={(ev) => { ev.stopPropagation(); onAbrir(e.id); }}
                      title={e.is_block ? `${hora} Bloqueado: ${e.block_reason ?? ''}` : `${hora} ${e.cliente} - ${e.servico}`}
                      className={`absolute rounded-lg border-l-4 border px-1.5 py-1 text-left overflow-hidden text-[11px] leading-tight shadow-sm hover:z-10 hover:shadow-md ${e.is_block ? 'bg-slate-200 border-slate-400 text-slate-600' : COR_STATUS[e.status ?? 'scheduled'] ?? COR_STATUS.scheduled}`}
                      style={{ top: `${pos.topo}%`, height: `max(${pos.altura}%, 22px)`, left: `${e.faixa * largura}%`, width: `calc(${largura}% - 2px)`, borderLeftColor: e.is_block ? undefined : e.cor }}>
                      <span className="font-bold">{hora}</span>{' '}
                      {e.is_block ? <><Lock size={10} className="inline" /> {e.block_reason}</> : <span className="font-semibold">{e.cliente}</span>}
                      {!e.is_block && <span className="block truncate opacity-80">{e.servico}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
