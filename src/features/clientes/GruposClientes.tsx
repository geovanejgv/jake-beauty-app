import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { clientesKeys, excluirGrupo, listarGrupos, listarMembros, salvarGrupo, type Origem } from './api';
import { limparDescricao, limparNome, nomeRepetido } from './logic';

type Cliente = { id: string; name: string; origem_id?: string | null };

/** Grupos de clientes (só administradora): criar, renomear, escolher quem entra e excluir. */
export function GruposClientes({ clientes, origens, onFechar, grupoInicial }: { clientes: Cliente[]; origens: Origem[]; onFechar: () => void; grupoInicial?: string | null }) {
  const queryClient = useQueryClient();
  const { data: grupos = [] } = useQuery({ queryKey: clientesKeys.grupos, queryFn: listarGrupos });
  const { data: membros = [] } = useQuery({ queryKey: clientesKeys.membros, queryFn: listarMembros });
  // null = lista de grupos; '' = grupo novo; id = editando.
  // grupoInicial: '' abre direto um grupo novo; um id abre a edição desse grupo.
  const [editando, setEditando] = useState<string | null>(grupoInicial ?? null);
  const [nome, setNome] = useState(() => (grupoInicial ? grupos.find((g) => g.id === grupoInicial)?.nome ?? '' : ''));
  const [descricao, setDescricao] = useState(() => (grupoInicial ? grupos.find((g) => g.id === grupoInicial)?.descricao ?? '' : ''));
  const [marcadas, setMarcadas] = useState<string[]>(() => (grupoInicial ? membros.filter((m) => m.grupo_id === grupoInicial).map((m) => m.cliente_id) : []));
  const [busca, setBusca] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('');

  const membrosDe = (grupoId: string) => membros.filter((m) => m.grupo_id === grupoId).map((m) => m.cliente_id);
  const abrir = (grupoId: string | null) => {
    setEditando(grupoId ?? '');
    setNome(grupoId ? grupos.find((g) => g.id === grupoId)?.nome ?? '' : '');
    setDescricao(grupoId ? grupos.find((g) => g.id === grupoId)?.descricao ?? '' : '');
    setMarcadas(grupoId ? membrosDe(grupoId) : []);
    setBusca('');
    setFiltroOrigem('');
  };
  const atualizar = () => queryClient.invalidateQueries({ queryKey: ['clientes', 'grupos'] });

  const salvar = useMutation({
    mutationFn: async () => {
      const limpo = limparNome(nome, 80);
      const desc = limparDescricao(descricao);
      if (!limpo || desc === false) throw new Error('nome');
      await salvarGrupo(editando || null, limpo, desc, editando ? membrosDe(editando) : [], marcadas);
    },
    onSuccess: () => { atualizar(); setEditando(null); },
    onError: (e: unknown) => alert(mensagemDeErro(e, 'Não foi possível salvar o grupo.', 'clientes.grupo_salvar')),
  });
  const excluir = useMutation({
    mutationFn: excluirGrupo,
    onSuccess: () => { atualizar(); setEditando(null); },
    onError: (e: unknown) => alert(mensagemDeErro(e, 'Não foi possível excluir o grupo.', 'clientes.grupo_excluir')),
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const limpo = limparNome(nome, 80);
    if (!limpo) return alert('Informe o nome do grupo (até 80 caracteres).');
    if (nomeRepetido(limpo, grupos, editando || undefined)) return alert('Já existe um grupo com esse nome.');
    if (limparDescricao(descricao) === false) return alert('A descrição pode ter até 500 caracteres.');
    salvar.mutate();
  };

  const termo = busca.trim().toLowerCase();
  const visiveis = clientes.filter((c) => (!termo || c.name.toLowerCase().includes(termo)) && (!filtroOrigem || (filtroOrigem === 'sem' ? !c.origem_id : c.origem_id === filtroOrigem)));
  const todasVisiveisMarcadas = visiveis.length > 0 && visiveis.every((c) => marcadas.includes(c.id));
  const alternarVisiveis = () => {
    const ids = visiveis.map((c) => c.id);
    setMarcadas((m) => (todasVisiveisMarcadas ? m.filter((id) => !ids.includes(id)) : [...new Set([...m, ...ids])]));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start">
          <div className="flex items-start gap-2">
            {editando !== null && <button type="button" onClick={() => setEditando(null)} className="text-slate-400 hover:text-rose-600 p-1" aria-label="Voltar"><ArrowLeft size={20} /></button>}
            <div>
              <h3 className="text-xl font-black text-slate-800">{editando === null ? 'Grupos de clientes' : editando ? 'Editar grupo' : 'Novo grupo'}</h3>
              <p className="text-sm text-slate-500 mt-0.5">Na Agenda, um lembrete para o grupo entra para todas as clientes dele.</p>
            </div>
          </div>
          <button type="button" onClick={onFechar} className="text-slate-400 hover:text-rose-600 p-1" aria-label="Fechar"><X size={24} /></button>
        </div>

        {editando === null ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/50">
            <button type="button" onClick={() => abrir(null)} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-rose-200 text-rose-600 font-bold hover:bg-rose-50"><Plus size={18} /> Novo grupo</button>
            {grupos.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">Nenhum grupo criado.</p> : grupos.map((g) => (
              <button key={g.id} type="button" onClick={() => abrir(g.id)} className="w-full bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center shadow-sm hover:border-rose-300 text-left">
                <span className="font-bold text-slate-800 flex items-center gap-2"><Users size={16} className="text-rose-500" /> {g.nome}</span>
                <span className="text-xs text-slate-500">{membrosDe(g.id).length} cliente(s)</span>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={enviar} className="flex-1 flex flex-col overflow-hidden">
            <div className="p-6 space-y-3 border-b border-slate-100">
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Nome do grupo *</label><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} required placeholder="Ex.: Guaianases, retorno de novembro" className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500" /></div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Descrição</label><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} rows={2} placeholder="Para que serve este grupo" className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm resize-none" /></div>
              <div className="flex gap-2">
                <div className="relative flex-1"><Search size={16} className="absolute left-3 top-2.5 text-slate-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente..." aria-label="Buscar cliente" className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-rose-500" /></div>
                <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)} aria-label="Filtrar por origem" className="border border-slate-200 rounded-lg px-2 py-2 text-sm">
                  <option value="">Todas as origens</option>
                  {origens.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  <option value="sem">Sem origem</option>
                </select>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span><strong>{marcadas.length}</strong> cliente(s) no grupo</span>
                <button type="button" onClick={alternarVisiveis} disabled={!visiveis.length} className="font-bold text-rose-600 disabled:opacity-40">{todasVisiveisMarcadas ? 'Desmarcar as da lista' : 'Marcar todas da lista'}</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1 bg-slate-50/50">
              {visiveis.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">Nenhuma cliente encontrada.</p> : visiveis.map((c) => (
                <label key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white cursor-pointer text-sm text-slate-700">
                  <input type="checkbox" checked={marcadas.includes(c.id)} onChange={(e) => setMarcadas((m) => (e.target.checked ? [...m, c.id] : m.filter((id) => id !== c.id)))} className="w-4 h-4 accent-rose-600" />
                  <span className="flex-1">{c.name}</span>
                  {c.origem_id && <span className="text-[10px] uppercase font-bold text-slate-400">{origens.find((o) => o.id === c.origem_id)?.nome}</span>}
                </label>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-white flex gap-3">
              {editando && <button type="button" onClick={() => { if (window.confirm('Excluir este grupo? As clientes e os lembretes já agendados continuam.')) excluir.mutate(editando); }} className="p-2.5 border border-red-100 text-red-500 rounded-xl hover:bg-red-50" aria-label="Excluir grupo"><Trash2 size={18} /></button>}
              <button type="button" onClick={() => setEditando(null)} className="flex-1 border p-2.5 rounded-xl text-slate-500 font-medium">Cancelar</button>
              <button type="submit" disabled={salvar.isPending} className="flex-1 bg-rose-600 text-white p-2.5 rounded-xl font-bold disabled:bg-rose-400">{salvar.isPending ? 'Salvando...' : 'Salvar grupo'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
