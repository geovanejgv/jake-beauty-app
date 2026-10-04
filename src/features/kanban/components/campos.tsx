import React, { useMemo, useState } from 'react';
import { Check, Search, Trash2, UserPlus, X } from 'lucide-react';
import { LIMITES, type ItemTarefa, type Pessoa } from '../logic';
import { inputCls } from './ui';

type Cliente = { id: string; name: string; phone: string };

/** Busca de cliente por nome ou telefone, com lista de sugestões (no lugar de "Processo"). */
export function ClientePicker({ clientes, valor, onChange }: { clientes: Cliente[]; valor: string | null; onChange: (id: string | null) => void }) {
  const [busca, setBusca] = useState('');
  const selecionada = clientes.find((c) => c.id === valor);
  const sugestoes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return [];
    const digitos = termo.replace(/\D/g, '');
    return clientes
      .filter((c) => c.name.toLowerCase().includes(termo) || (digitos && (c.phone || '').replace(/\D/g, '').includes(digitos)))
      .slice(0, 8);
  }, [busca, clientes]);

  if (selecionada) {
    return (
      <div className="flex items-center justify-between border border-rose-200 bg-rose-50 rounded-lg px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-rose-800 truncate">{selecionada.name}</p>
          <p className="text-xs text-rose-600">{selecionada.phone}</p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="p-1 text-rose-600 hover:bg-rose-100 rounded-md" aria-label="Remover cliente"><X size={16} /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-3 text-slate-400" />
      <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" className={`${inputCls} pl-9`} />
      {busca.trim() && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {sugestoes.length === 0 ? (
            <p className="p-3 text-sm text-slate-500 text-center">Nenhuma cliente encontrada.</p>
          ) : (
            sugestoes.map((c) => (
              <button type="button" key={c.id} onClick={() => { onChange(c.id); setBusca(''); }} className="w-full text-left p-3 hover:bg-rose-50 border-b border-slate-100 last:border-0">
                <p className="text-sm font-bold text-slate-800">{c.name}</p>
                <p className="text-xs text-slate-500">{c.phone}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Responsável (select) com "+ Envolver mais pessoas" logo abaixo. */
export function ResponsavelEnvolvidos({
  pessoas,
  responsavel,
  envolvidos,
  onResponsavel,
  onEnvolvidos,
}: {
  pessoas: Pessoa[];
  responsavel: string;
  envolvidos: string[];
  onResponsavel: (id: string) => void;
  onEnvolvidos: (ids: string[]) => void;
}) {
  const [aberto, setAberto] = useState(envolvidos.length > 0);
  const ativas = pessoas.filter((p) => p.active !== false || p.id === responsavel || envolvidos.includes(p.id));
  const outras = ativas.filter((p) => p.id !== responsavel);
  const alternar = (id: string) => {
    if (envolvidos.includes(id)) onEnvolvidos(envolvidos.filter((e) => e !== id));
    else if (envolvidos.length < LIMITES.envolvidos) onEnvolvidos([...envolvidos, id]);
  };
  return (
    <div>
      <select value={responsavel} onChange={(e) => { onResponsavel(e.target.value); onEnvolvidos(envolvidos.filter((x) => x !== e.target.value)); }} className={inputCls} required>
        {ativas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {outras.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setAberto(!aberto)} className="flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700">
            <UserPlus size={14} /> {envolvidos.length ? `Envolvidos (${envolvidos.length})` : 'Envolver mais pessoas'}
          </button>
          {aberto && (
            <div className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-44 overflow-y-auto">
              {outras.map((p) => {
                const marcado = envolvidos.includes(p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={marcado} onChange={() => alternar(p.id)} className="accent-rose-600 w-4 h-4" />
                    {p.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
      {outras.length === 0 && (
        <p className="text-[11px] text-slate-400 mt-1">Para envolver outras pessoas, cadastre a equipe no menu ⋮ do quadro.</p>
      )}
    </div>
  );
}

/** Checklist de sub-itens: marcar, remover e adicionar (Enter). */
export function Checklist({
  itens,
  sempreVisivel,
  onAlternar,
  onRemover,
  onAdicionar,
  compacto,
}: {
  itens: ItemTarefa[];
  sempreVisivel: boolean;
  onAlternar: (item: ItemTarefa) => void;
  onRemover: (item: ItemTarefa) => void;
  onAdicionar: (titulo: string) => void;
  compacto?: boolean;
}) {
  const [novo, setNovo] = useState('');
  const [adicionando, setAdicionando] = useState(!compacto);
  const feitos = itens.filter((i) => i.concluido).length;
  const salvar = () => {
    const t = novo.trim();
    if (!t) return;
    onAdicionar(t.slice(0, LIMITES.tituloItem));
    setNovo('');
  };
  return (
    <div className="space-y-1.5">
      {itens.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 tabular-nums">{feitos}/{itens.length}</span>
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(feitos / itens.length) * 100}%` }} />
          </div>
        </div>
      )}
      {itens.map((item) => (
        <div key={item.id} className="group/item flex items-start gap-2">
          <button
            type="button"
            onClick={() => onAlternar(item)}
            aria-label={item.concluido ? 'Desmarcar sub-item' : 'Marcar sub-item'}
            className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center ${item.concluido ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'}`}
          >
            {item.concluido && <Check size={12} strokeWidth={3} />}
          </button>
          <span className={`flex-1 text-xs break-words ${item.concluido ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item.titulo}</span>
          <button
            type="button"
            onClick={() => onRemover(item)}
            aria-label="Remover sub-item"
            className={`text-slate-400 hover:text-red-500 ${sempreVisivel ? '' : 'opacity-0 group-hover/item:opacity-100 focus:opacity-100'}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {adicionando ? (
        <input
          type="text"
          value={novo}
          autoFocus={compacto}
          maxLength={LIMITES.tituloItem}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); salvar(); }
            if (e.key === 'Escape' && compacto) { setNovo(''); setAdicionando(false); }
          }}
          onBlur={() => { if (compacto && !novo.trim()) setAdicionando(false); }}
          placeholder="Novo sub-item e Enter"
          className="w-full border border-slate-200 bg-white px-2 py-1.5 rounded-md text-xs outline-none focus:ring-2 focus:ring-rose-500"
        />
      ) : (
        <button type="button" onClick={() => setAdicionando(true)} className="text-[11px] font-bold text-slate-500 hover:text-rose-600">+ Sub-item</button>
      )}
    </div>
  );
}
