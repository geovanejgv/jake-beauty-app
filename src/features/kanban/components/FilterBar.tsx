import React, { useState } from 'react';
import { CalendarRange, ChevronDown, Filter, Users, X } from 'lucide-react';
import {
  ATRIBUICOES, FILTROS_PADRAO, ROTULO_ATRIBUICAO, ROTULO_PERIODO, ehDataISO, rotuloIntervalo, temFiltroAtivo,
  type Atribuicao, type Filtros, type Periodo, type Pessoa, type StatusFiltro,
} from '../logic';
import { BotoesRodape, Painel, inputCls } from './ui';

const GRUPOS: Periodo[][] = [
  ['todos'],
  ['hoje', 'amanha', 'esta_semana', 'este_mes', 'proximos_3', 'proxima_semana', 'proximo_mes'],
  ['ontem', 'ultimos_7', 'ultimos_30'],
];

const botaoCls = (ativo: boolean) =>
  `flex items-center gap-1.5 h-9 px-3 rounded-lg border text-[11px] font-bold uppercase tracking-wide whitespace-nowrap transition-colors ${
    ativo ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
  }`;

function Opcao({ marcado, onClick, children, desabilitado }: { marcado: boolean; onClick: () => void; children: React.ReactNode; desabilitado?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={marcado} disabled={desabilitado} onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-40 ${marcado ? 'bg-rose-50 text-rose-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}>
      <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${marcado ? 'border-rose-600 bg-rose-600' : 'border-slate-300'}`} />
      {children}
    </button>
  );
}

export function FilterBar({ filtros, pessoas, hoje, onChange }: { filtros: Filtros; pessoas: Pessoa[]; hoje: string; onChange: (f: Filtros) => void }) {
  const [aberto, setAberto] = useState<null | 'periodo' | 'definir' | 'pessoas' | 'status'>(null);
  const fechar = () => setAberto(null);

  // Rascunhos dos painéis (só valem ao aplicar)
  const [de, setDe] = useState(filtros.de || hoje);
  const [ate, setAte] = useState(filtros.ate || hoje);
  const [pessoa, setPessoa] = useState<string | null>(filtros.pessoa);
  const [atrib, setAtrib] = useState<Atribuicao>(filtros.atrib);
  const [status, setStatus] = useState<StatusFiltro>(filtros.status);

  const abrir = (qual: typeof aberto) => {
    setDe(filtros.de || hoje); setAte(filtros.ate || hoje);
    setPessoa(filtros.pessoa); setAtrib(filtros.atrib); setStatus(filtros.status);
    setAberto(qual);
  };

  const intervalo = rotuloIntervalo(filtros, hoje);
  const nomePessoa = pessoas.find((p) => p.id === filtros.pessoa)?.name;
  const definirValido = ehDataISO(de) && ehDataISO(ate) && de <= ate;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 1. Período */}
      <div className="relative">
        <button type="button" onClick={() => abrir('periodo')} className={botaoCls(filtros.periodo !== 'todos')} aria-haspopup="dialog">
          <CalendarRange size={14} /> {ROTULO_PERIODO[filtros.periodo]} <ChevronDown size={14} />
        </button>
        <Painel aberto={aberto === 'periodo'} titulo="Período" onClose={fechar}>
          <div className="space-y-1" role="radiogroup">
            {GRUPOS.map((g, gi) => (
              <div key={gi} className={gi > 0 ? 'pt-1 mt-1 border-t border-slate-100' : ''}>
                {g.map((p) => (
                  <Opcao key={p} marcado={filtros.periodo === p} onClick={() => { onChange({ ...filtros, periodo: p, de: null, ate: null }); fechar(); }}>
                    {ROTULO_PERIODO[p]}
                  </Opcao>
                ))}
              </div>
            ))}
            <div className="pt-1 mt-1 border-t border-slate-100">
              <Opcao marcado={filtros.periodo === 'personalizado'} onClick={() => abrir('definir')}>Definir período</Opcao>
            </div>
          </div>
        </Painel>
        <Painel
          aberto={aberto === 'definir'} titulo="Definir período" onClose={fechar}
          rodape={<BotoesRodape onCancelar={fechar} desabilitado={!definirValido} onAplicar={() => { onChange({ ...filtros, periodo: 'personalizado', de, ate }); fechar(); }} />}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="block text-xs font-bold text-slate-500 mb-1">De</span>
              <input type="date" value={de} onChange={(e) => { setDe(e.target.value); if (e.target.value > ate) setAte(e.target.value); }} className={inputCls} />
            </label>
            <label className="block"><span className="block text-xs font-bold text-slate-500 mb-1">Até</span>
              <input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} className={inputCls} />
            </label>
          </div>
        </Painel>
      </div>

      {/* 2. Intervalo */}
      {intervalo && (
        <button type="button" onClick={() => abrir('definir')} className={botaoCls(true)} title="Definir período">{intervalo}</button>
      )}

      {/* 3. Pessoas e atribuições */}
      <div className="relative">
        <button type="button" onClick={() => abrir('pessoas')} className={botaoCls(!!filtros.pessoa)} aria-haspopup="dialog">
          <Users size={14} /> {nomePessoa ? `${nomePessoa}${filtros.atrib !== 'todas' ? ` · ${ROTULO_ATRIBUICAO[filtros.atrib]}` : ''}` : 'Pessoas'} <ChevronDown size={14} />
        </button>
        <Painel
          aberto={aberto === 'pessoas'} titulo="Pessoas e atribuições" onClose={fechar}
          rodape={<BotoesRodape onCancelar={fechar} onAplicar={() => { onChange({ ...filtros, pessoa, atrib: pessoa ? atrib : 'todas' }); fechar(); }} />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:min-w-[440px]">
            <div role="radiogroup" aria-label="Atribuição">
              <p className="text-[11px] font-bold text-slate-400 tracking-wider mb-1 px-1">ATRIBUIÇÃO</p>
              {ATRIBUICOES.map((a) => (
                <Opcao key={a} marcado={atrib === a} desabilitado={!pessoa && a !== 'todas'} onClick={() => setAtrib(a)}>{ROTULO_ATRIBUICAO[a]}</Opcao>
              ))}
              {!pessoa && <p className="text-[11px] text-slate-400 px-1 mt-1">Escolha uma pessoa para filtrar por atribuição.</p>}
            </div>
            <div role="radiogroup" aria-label="Pessoas">
              <p className="text-[11px] font-bold text-slate-400 tracking-wider mb-1 px-1">PESSOAS</p>
              <Opcao marcado={!pessoa} onClick={() => { setPessoa(null); setAtrib('todas'); }}>Todas as pessoas</Opcao>
              {pessoas.map((p) => (
                <Opcao key={p.id} marcado={pessoa === p.id} onClick={() => setPessoa(p.id)}>{p.name}</Opcao>
              ))}
            </div>
          </div>
        </Painel>
      </div>

      {/* 4. Status */}
      <div className="relative">
        <button type="button" onClick={() => abrir('status')} className={botaoCls(filtros.status !== 'todos')} aria-haspopup="dialog">
          <Filter size={14} /> {filtros.status === 'canceladas' ? 'Canceladas' : 'Status'} <ChevronDown size={14} />
        </button>
        <Painel
          aberto={aberto === 'status'} titulo="Status" onClose={fechar} alinhar="right"
          rodape={<BotoesRodape onCancelar={fechar} onAplicar={() => { onChange({ ...filtros, status }); fechar(); }} />}
        >
          <div role="radiogroup" aria-label="Status">
            <p className="text-[11px] font-bold text-slate-400 tracking-wider mb-1 px-1">STATUS</p>
            <Opcao marcado={status === 'todos'} onClick={() => setStatus('todos')}>Ativas</Opcao>
            <Opcao marcado={status === 'canceladas'} onClick={() => setStatus('canceladas')}>Canceladas</Opcao>
          </div>
        </Painel>
      </div>

      {/* 5. Limpar filtros */}
      {temFiltroAtivo(filtros) && (
        <button type="button" onClick={() => onChange(FILTROS_PADRAO)} className="flex items-center gap-1 h-9 px-2 text-xs font-bold text-slate-500 hover:text-rose-600">
          <X size={14} /> Limpar filtros
        </button>
      )}
    </div>
  );
}
