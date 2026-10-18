import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Pencil, Plus, UserCog, Users, X } from 'lucide-react';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { salvarDescricaoGrupo, type Grupo } from './api';
import { limparDescricao } from './logic';

/**
 * Grupos em cartões (só administradora): nome, quantidade de clientes e descrição editável.
 * Clicar no cartão abre a lista de clientes do grupo; "Clientes do grupo" abre a edição de membros.
 */
export function GruposCartoes({ grupos, contagem, onAbrir, onEditarMembros, onNovo }: {
  grupos: Grupo[];
  contagem: Map<string, number>;
  onAbrir: (grupoId: string) => void;
  onEditarMembros: (grupoId: string) => void;
  onNovo: () => void;
}) {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState('');

  const salvar = useMutation({
    mutationFn: ({ id, descricao }: { id: string; descricao: string | null }) => salvarDescricaoGrupo(id, descricao),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clientes', 'grupos'] }); setEditando(null); },
    onError: (e: unknown) => alert(mensagemDeErro(e, 'Não foi possível salvar a descrição.', 'clientes.grupo_descricao')),
  });

  const confirmar = (id: string) => {
    const descricao = limparDescricao(texto);
    if (descricao === false) return alert('A descrição pode ter até 500 caracteres.');
    salvar.mutate({ id, descricao });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
      {grupos.map((g) => {
        const qtd = contagem.get(g.id) ?? 0;
        const emEdicao = editando === g.id;
        return (
          <div key={g.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <button
              type="button"
              onClick={() => onAbrir(g.id)}
              className="sem-hover-card text-left p-5 pb-3 flex items-start gap-3 rounded-t-2xl hover:bg-rose-50/30"
              aria-label={`Ver clientes do grupo ${g.nome}`}
            >
              <span className="w-10 h-10 shrink-0 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center"><Users size={20} /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-black text-slate-800 truncate">{g.nome}</span>
                <span className="block text-sm text-slate-500">{qtd === 1 ? '1 cliente' : `${qtd} clientes`}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-slate-300 mt-2" />
            </button>

            <div className="px-5 pb-4 flex-1">
              {emEdicao ? (
                <div className="space-y-2">
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    maxLength={500}
                    rows={3}
                    autoFocus
                    aria-label={`Descrição do grupo ${g.nome}`}
                    placeholder="Para que serve este grupo"
                    className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditando(null)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100"><X size={14} /> Cancelar</button>
                    <button type="button" onClick={() => confirmar(g.id)} disabled={salvar.isPending} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold bg-rose-600 text-white disabled:opacity-60"><Check size={14} /> Salvar</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setEditando(g.id); setTexto(g.descricao ?? ''); }}
                  className="sem-hover-card group w-full text-left text-sm rounded-lg p-2 -mx-2 hover:bg-slate-50 flex items-start gap-2"
                  title="Editar descrição"
                >
                  <span className={`flex-1 whitespace-pre-wrap ${g.descricao ? 'text-slate-600' : 'text-slate-400 italic'}`}>{g.descricao || 'Sem descrição. Clique para descrever o grupo.'}</span>
                  <Pencil size={14} className="shrink-0 mt-0.5 text-slate-300 group-hover:text-rose-500" />
                </button>
              )}
            </div>

            <div className="border-t border-slate-100 px-5 py-2.5 flex justify-end">
              <button type="button" onClick={() => onEditarMembros(g.id)} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700">
                <UserCog size={14} /> Clientes do grupo
              </button>
            </div>
          </div>
        );
      })}

      <button type="button" onClick={onNovo} className="sem-hover-card min-h-[10rem] rounded-2xl border-2 border-dashed border-rose-200 text-rose-600 font-bold hover:bg-rose-50 flex flex-col items-center justify-center gap-2">
        <Plus size={22} /> Novo grupo
      </button>
    </div>
  );
}
