import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, GripVertical, Pencil, Trash2, User } from 'lucide-react';
import { LIMITES, dataBR, diaEmBrasilia, estaAtrasada, type Coluna, type ItemTarefa, type Tarefa } from '../logic';
import { Checklist } from './campos';

const FAIXA_CRITICIDADE = {
  normal: 'border-l-transparent',
  urgente: 'border-l-amber-500',
  critico: 'border-l-red-500',
} as const;

export interface TaskCardProps {
  tarefa: Tarefa;
  nomePessoa: (id: string | null) => string;
  colunas: Coluna[];
  hoje: string;
  toque: boolean;
  podeSubir: boolean;
  podeDescer: boolean;
  arrastando: boolean;
  /** Quadro compartilhado só para visualizar: sem arrastar, mover ou editar. */
  somenteLeitura?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onEditar: () => void;
  onExcluir: () => void;
  onMover: (colunaId: string) => void;
  onSubir: () => void;
  onDescer: () => void;
  onSalvarObservacao: (texto: string) => void;
  onAlternarItem: (item: ItemTarefa) => void;
  onRemoverItem: (item: ItemTarefa) => void;
  onAdicionarItem: (titulo: string) => void;
}

export function TaskCard(p: TaskCardProps) {
  const t = p.tarefa;
  const concluida = t.status === 'concluida';
  const cancelada = !!t.cancelada_em;
  const atrasada = estaAtrasada(t, p.hoje);
  const itens = t.tarefa_itens || [];
  const [editandoObs, setEditandoObs] = useState(false);
  const [obs, setObs] = useState(t.descricao || '');
  // Campo de texto de onde o arraste começou (não inicia arraste a partir de campos)
  const [origemTexto, setOrigemTexto] = useState(false);

  useEffect(() => { if (!editandoObs) setObs(t.descricao || ''); }, [t.descricao, editandoObs]);

  const salvarObs = () => {
    setEditandoObs(false);
    const novo = obs.slice(0, LIMITES.descricao);
    if (novo.trim() !== (t.descricao || '').trim()) p.onSalvarObservacao(novo);
  };

  return (
    <div
      draggable={!p.toque && !p.somenteLeitura}
      onPointerDown={(e) => setOrigemTexto(!!(e.target as HTMLElement).closest('input, textarea, select, button'))}
      onDragStart={(e) => { if (origemTexto) { e.preventDefault(); return; } p.onDragStart(e); }}
      onDragEnd={p.onDragEnd}
      onDragOver={p.onDragOver}
      data-tarefa={t.id}
      className={`group relative bg-white rounded-xl border border-slate-200 border-l-4 ${FAIXA_CRITICIDADE[t.criticidade]} shadow-sm p-3 space-y-2 transition-opacity ${p.arrastando ? 'opacity-40' : ''} ${cancelada ? 'opacity-70' : ''}`}
    >
      {/* Título e ações */}
      <div className="flex items-start gap-1.5">
        {!p.toque && !p.somenteLeitura && <GripVertical size={16} className="mt-0.5 shrink-0 text-slate-300 cursor-grab" aria-hidden />}
        <p className={`flex-1 min-w-0 text-sm font-semibold break-words ${concluida ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.titulo}</p>
        <div className={`flex items-center gap-0.5 shrink-0 ${p.toque ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
          {p.somenteLeitura ? (
            <button type="button" onClick={p.onEditar} className="p-1 text-slate-400 hover:text-rose-600 rounded" aria-label="Ver tarefa"><Eye size={14} /></button>
          ) : (<>
            <button type="button" onClick={p.onEditar} className="p-1 text-slate-400 hover:text-rose-600 rounded" aria-label="Editar tarefa"><Pencil size={14} /></button>
            <button type="button" onClick={p.onExcluir} className="p-1 text-slate-400 hover:text-red-500 rounded" aria-label="Excluir tarefa"><Trash2 size={14} /></button>
          </>)}
        </div>
      </div>

      {/* Linha de dados */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        {cancelada && <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold uppercase tracking-wide">Cancelada</span>}
        {t.criticidade === 'urgente' && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold uppercase tracking-wide">Urgente</span>}
        {t.criticidade === 'critico' && <span className="px-1.5 py-0.5 rounded bg-red-600 text-white font-bold uppercase tracking-wide">Crítico</span>}
        <span className="flex items-center gap-1 text-slate-500"><User size={12} />{p.nomePessoa(t.responsible_id)}</span>
        {t.data_limite && (
          <span className={atrasada ? 'text-red-600 font-bold' : 'text-slate-500'}>
            {dataBR(t.data_limite)}{atrasada && ' · atrasada'}
          </span>
        )}
        {concluida && t.concluida_em && <span className="text-emerald-600 font-bold">Concluída em {dataBR(diaEmBrasilia(t.concluida_em))}</span>}
      </div>
      {t.clients && <p className="text-[11px] text-slate-500 truncate">Cliente: <span className="font-semibold text-slate-600">{t.clients.name}</span></p>}

      <fieldset disabled={p.somenteLeitura} className="space-y-2 min-w-0">
      {/* Sub-itens */}
      <Checklist
        itens={itens}
        compacto
        sempreVisivel={p.toque}
        onAlternar={p.onAlternarItem}
        onRemover={p.onRemoverItem}
        onAdicionar={p.onAdicionarItem}
      />

      {/* Observação editável no cartão */}
      {editandoObs ? (
        <textarea
          autoFocus
          value={obs}
          maxLength={LIMITES.descricao}
          onChange={(e) => setObs(e.target.value)}
          onBlur={salvarObs}
          onKeyDown={(e) => { if (e.key === 'Escape') { setObs(t.descricao || ''); setEditandoObs(false); } }}
          rows={3}
          placeholder="Escreva uma observação"
          className="w-full border border-amber-200 bg-amber-50 px-2 py-1.5 rounded-md text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 resize-y"
        />
      ) : t.descricao ? (
        <button type="button" onClick={() => setEditandoObs(true)} className="w-full text-left text-xs text-slate-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 whitespace-pre-wrap break-words line-clamp-4">
          {t.descricao}
        </button>
      ) : (
        <button type="button" onClick={() => setEditandoObs(true)} className="text-[11px] font-bold text-slate-500 hover:text-amber-600">Observação</button>
      )}

      </fieldset>

      {/* Celular/tablet: mover sem arrastar */}
      {p.toque && !p.somenteLeitura && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
          <label className="flex-1 flex items-center gap-1.5 text-[11px] text-slate-500 min-w-0">
            <span className="shrink-0">Mover para</span>
            <select
              value={t.coluna_id}
              onChange={(e) => p.onMover(e.target.value)}
              className="flex-1 min-w-0 border border-slate-200 bg-white rounded-md px-1.5 py-1 text-xs text-slate-700"
              aria-label="Mover para a coluna"
            >
              {p.colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <button type="button" disabled={!p.podeSubir} onClick={p.onSubir} className="p-1.5 border border-slate-200 rounded-md text-slate-500 disabled:opacity-30" aria-label="Subir"><ArrowUp size={14} /></button>
          <button type="button" disabled={!p.podeDescer} onClick={p.onDescer} className="p-1.5 border border-slate-200 rounded-md text-slate-500 disabled:opacity-30" aria-label="Descer"><ArrowDown size={14} /></button>
        </div>
      )}
    </div>
  );
}
