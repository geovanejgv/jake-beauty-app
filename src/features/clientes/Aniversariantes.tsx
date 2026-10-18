import { useState } from 'react';
import { Cake, ChevronDown, MessageCircle } from 'lucide-react';
import { digitos } from '../../lib/formatos';
import { aniversariantesDoMes } from './logic';

type ClienteAniversario = { id: string; name: string; phone?: string | null; birthday?: string | null };

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * Aniversariantes do mês em destaque (só a administradora tem a data de aniversário).
 * O de hoje aparece primeiro destacado; os que já passaram ficam mais discretos.
 * "Parabenizar" abre o WhatsApp com o número da cliente (sem mensagem pronta).
 */
export function AniversariantesMes({ clientes, hoje, recolhivel = false }: { clientes: ClienteAniversario[]; hoje: string; recolhivel?: boolean }) {
  // No celular, quando recolhível, começa fechado para a lista de clientes aparecer logo.
  const [aberto, setAberto] = useState(() => !(recolhivel && window.matchMedia?.('(max-width: 767px)').matches));
  const lista = aniversariantesDoMes(clientes, hoje);
  const mes = MESES[Number(hoje.slice(5, 7)) - 1];
  const deHoje = lista.filter((a) => a.hoje).length;

  const cabecalho = (
    <>
      <span className="w-9 h-9 shrink-0 rounded-xl bg-rose-600 text-white flex items-center justify-center"><Cake size={18} /></span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-[17px] md:text-base font-black text-slate-900 md:text-slate-800">Aniversariantes de {mes}</span>
        <span className="block text-sm md:text-xs text-slate-600 md:text-slate-500">
          {lista.length === 0 ? 'Nenhuma cliente faz aniversário este mês.' : `${lista.length} cliente(s)${deHoje ? ` · ${deHoje} hoje` : ''}`}
        </span>
      </span>
    </>
  );

  return (
    <section aria-label={`Aniversariantes de ${mes}`} className="bg-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden">
      {recolhivel ? (
        <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="sem-hover w-full flex items-center gap-3 p-4 bg-rose-50/60 hover:bg-rose-50">
          {cabecalho}
          <ChevronDown size={18} className={`shrink-0 text-rose-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <div className="flex items-center gap-3 p-4 bg-rose-50/60">{cabecalho}</div>
      )}

      {aberto && lista.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2 p-3">
          {lista.map(({ cliente, dia, idade, hoje: ehHoje, passou }) => {
            const fone = digitos(cliente.phone);
            return (
              <li key={cliente.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${ehHoje ? 'border-rose-300 bg-rose-50' : 'border-slate-100'} ${passou ? 'opacity-60' : ''}`}>
                <span className={`w-11 shrink-0 text-center rounded-lg py-1 ${ehHoje ? 'bg-rose-600 text-white' : 'bg-rose-100 text-rose-700'}`}>
                  <span className="block text-base font-black leading-none">{String(dia).padStart(2, '0')}</span>
                  <span className="block text-[10px] font-bold uppercase">{mes.slice(0, 3)}</span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] md:text-sm font-bold text-slate-900 md:text-slate-800 truncate" title={cliente.name}>{cliente.name}</span>
                  <span className="block text-sm md:text-xs text-slate-600 md:text-slate-500">{ehHoje ? 'Hoje!' : passou ? 'Já passou' : `Dia ${dia}`}{idade !== null ? ` · ${idade} anos` : ''}</span>
                </span>
                {fone.length >= 10 && (
                  <a href={`https://wa.me/${fone.length > 11 && fone.startsWith('55') ? fone : `55${fone}`}`} target="_blank" rel="noopener noreferrer" title={`Parabenizar ${cliente.name} pelo WhatsApp`} aria-label={`Parabenizar ${cliente.name} pelo WhatsApp`}
                    className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50">
                    <MessageCircle size={18} />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
