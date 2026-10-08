import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Eye, Loader2, Pencil, Trash2, User } from 'lucide-react';
import * as api from '../api';
import { kanbanKeys, mensagemErro } from '../api';
import type { Pessoa, PermissaoQuadro, Quadro } from '../logic';
import { Modal, inputCls } from './ui';

const ROTULO_PERMISSAO: Record<PermissaoQuadro, string> = { ver: 'Somente visualizar', editar: 'Visualizar e editar' };

/**
 * Compartilhar quadro: o pessoal com o negócio (toda a equipe) ou com uma pessoa;
 * o do negócio com o espaço pessoal de uma pessoa. O banco confere quem pode (dono ou administradora).
 */
export function CompartilharModal({ quadro, pessoas, eu, onClose }: { quadro: Quadro; pessoas: Pessoa[]; eu: string; onClose: () => void }) {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: kanbanKeys.compartilhamentos(quadro.id), queryFn: () => api.listarCompartilhamentos(quadro.id) });
  const pessoal = quadro.escopo === 'pessoal';
  const [destino, setDestino] = useState<string>(pessoal ? 'negocio' : '');
  const [permissao, setPermissao] = useState<PermissaoQuadro>('ver');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const nome = (id: string | null) => pessoas.find((p) => p.id === id)?.name ?? 'Pessoa';
  const candidatas = pessoas.filter((p) => p.active && (!pessoal || p.id !== (quadro.dono_id ?? eu)));

  const atualizar = async () => {
    await qc.invalidateQueries({ queryKey: kanbanKeys.compartilhamentos(quadro.id) });
    await qc.invalidateQueries({ queryKey: kanbanKeys.quadros });
  };
  const executar = async (fn: () => Promise<void>) => {
    setOcupado(true); setErro(null);
    try { await fn(); await atualizar(); } catch (e) { setErro(mensagemErro(e, 'Não foi possível salvar o compartilhamento.')); } finally { setOcupado(false); }
  };
  const adicionar = () => {
    if (!destino) { setErro('Escolha com quem compartilhar.'); return; }
    executar(() => api.compartilhar(quadro.id, destino === 'negocio' ? 'negocio' : 'pessoa', destino === 'negocio' ? null : destino, permissao));
  };

  return (
    <Modal titulo={`Compartilhar: ${quadro.nome}`} onClose={onClose}
      rodape={<div className="flex justify-end"><button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold tracking-wide text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">FECHAR</button></div>}>
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          {pessoal
            ? 'Quadro pessoal: só você vê. Compartilhe com o negócio (toda a equipe passa a ver na visão do negócio) ou com uma pessoa (aparece no espaço pessoal dela).'
            : 'Quadro do negócio: compartilhe com o espaço pessoal de uma pessoa. Quem recebe vê todas as tarefas do quadro.'}
        </p>

        <section className="space-y-2" aria-label="Compartilhamentos atuais">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Compartilhado com</h4>
          {lista.isLoading ? <Loader2 className="animate-spin text-rose-400" size={18} /> : (lista.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">Ninguém ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {(lista.data ?? []).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  {c.destino === 'negocio' ? <Building2 size={16} className="text-rose-600" /> : <User size={16} className="text-rose-600" />}
                  <span className="flex-1 min-w-0 text-sm font-semibold text-slate-700 truncate">{c.destino === 'negocio' ? 'Negócio (toda a equipe)' : `Pessoal de ${nome(c.user_id)}`}</span>
                  <select value={c.permissao} disabled={ocupado} aria-label="Permissão"
                    onChange={(e) => executar(() => api.compartilhar(quadro.id, c.destino, c.user_id, e.target.value as PermissaoQuadro))}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white">
                    <option value="ver">{ROTULO_PERMISSAO.ver}</option>
                    <option value="editar">{ROTULO_PERMISSAO.editar}</option>
                  </select>
                  <button type="button" disabled={ocupado} onClick={() => executar(() => api.removerCompartilhamento(c.id))}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded" aria-label="Parar de compartilhar"><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 bg-slate-50 rounded-xl p-3" aria-label="Novo compartilhamento">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Adicionar</h4>
          <label className="block">
            <span className="block text-xs font-bold text-slate-500 mb-1">Com quem</span>
            <select value={destino} onChange={(e) => setDestino(e.target.value)} className={inputCls}>
              {!pessoal && <option value="">Selecione a pessoa</option>}
              {pessoal && <option value="negocio">Negócio (toda a equipe)</option>}
              {candidatas.map((p) => <option key={p.id} value={p.id}>{pessoal ? p.name : `Pessoal de ${p.name}`}{p.id === eu ? ' (você)' : ''}</option>)}
            </select>
          </label>
          <div role="radiogroup" aria-label="Permissão" className="grid grid-cols-2 gap-2">
            {(['ver', 'editar'] as PermissaoQuadro[]).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={permissao === v} onClick={() => setPermissao(v)}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-bold ${permissao === v ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-white border-slate-200 text-slate-600'}`}>
                {v === 'ver' ? <Eye size={14} /> : <Pencil size={14} />} {ROTULO_PERMISSAO[v]}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="button" disabled={ocupado} onClick={adicionar} className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold disabled:opacity-60">
              {ocupado ? 'Salvando...' : 'Compartilhar'}
            </button>
          </div>
          {erro && <p role="alert" className="text-sm text-rose-600">{erro}</p>}
        </section>
      </div>
    </Modal>
  );
}
