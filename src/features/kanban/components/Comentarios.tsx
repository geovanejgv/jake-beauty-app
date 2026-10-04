import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquare, Pencil, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { comentar, editarComentario, excluirComentario, kanbanKeys, listarComentarios, mensagemErro } from '../api';
import type { Pessoa } from '../logic';

const LIMITE = 2000;

function quando(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/**
 * Thread de anotações do cartão (administradora e profissional), em ordem de data.
 * O autor vem da sessão no banco; só quem escreveu edita, e a administradora pode remover.
 */
export function Comentarios({ taskId, pessoas }: { taskId: string; pessoas: Pessoa[] }) {
  const queryClient = useQueryClient();
  const { perfil } = useAuth();
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const chave = kanbanKeys.comentarios(taskId);
  const { data: lista = [], isLoading } = useQuery({ queryKey: chave, queryFn: () => listarComentarios(taskId), refetchInterval: 30_000 });
  const nomes = new Map(pessoas.map((p) => [p.id, p.name]));
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }); }, [lista.length]);

  const atualizar = () => queryClient.invalidateQueries({ queryKey: chave });
  const enviar = useMutation({
    mutationFn: () => comentar(taskId, texto),
    onSuccess: () => { setTexto(''); setErro(null); atualizar(); },
    onError: (e) => setErro(mensagemErro(e, 'Não foi possível enviar o comentário.')),
  });
  const salvarEdicao = useMutation({
    mutationFn: (x: { id: string; texto: string }) => editarComentario(x.id, x.texto),
    onSuccess: () => { setEditando(null); atualizar(); },
    onError: (e) => setErro(mensagemErro(e, 'Não foi possível editar.')),
  });
  const remover = useMutation({
    mutationFn: (id: string) => excluirComentario(id),
    onSuccess: atualizar,
    onError: (e) => setErro(mensagemErro(e, 'Não foi possível excluir.')),
  });

  return (
    <section aria-label="Comentários da tarefa" className="space-y-3">
      <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><MessageSquare size={14} /> Comentários <span className="font-normal text-slate-400">({lista.length})</span></p>
      {isLoading ? <Loader2 size={16} className="animate-spin text-rose-500" /> : lista.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum comentário ainda. Use para combinar detalhes da tarefa com a equipe.</p>
      ) : (
        <ol className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {lista.map((c) => {
            const meu = c.autor_id === perfil?.id;
            return (
              <li key={c.id} className={`rounded-xl px-3 py-2 text-sm ${meu ? 'bg-rose-50 border border-rose-100 ml-6' : 'bg-slate-50 border border-slate-100 mr-6'}`}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[11px] font-bold text-slate-600">{meu ? 'Você' : (c.autor_id && nomes.get(c.autor_id)) || 'Ex-integrante'}</span>
                  <span className="text-[10px] text-slate-400">{quando(c.created_at)}{c.editado_em && ' (editado)'}</span>
                </div>
                {editando?.id === c.id ? (
                  <div className="space-y-1">
                    <textarea value={editando.texto} maxLength={LIMITE} onChange={(e) => setEditando({ id: c.id, texto: e.target.value })} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" rows={2} autoFocus />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditando(null)} className="text-xs text-slate-500">Cancelar</button>
                      <button type="button" disabled={!editando.texto.trim() || salvarEdicao.isPending} onClick={() => salvarEdicao.mutate(editando)} className="text-xs font-bold text-rose-600 disabled:opacity-40">Salvar</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-700 whitespace-pre-wrap break-words">{c.texto}</p>
                )}
                {(meu || perfil?.role === 'admin') && editando?.id !== c.id && (
                  <div className="flex justify-end gap-1 mt-1">
                    {meu && <button type="button" onClick={() => setEditando({ id: c.id, texto: c.texto })} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Editar comentário"><Pencil size={12} /></button>}
                    <button type="button" onClick={() => remover.mutate(c.id)} className="p-1 text-slate-400 hover:text-red-600" aria-label="Excluir comentário"><Trash2 size={12} /></button>
                  </div>
                )}
              </li>
            );
          })}
          <div ref={fim} />
        </ol>
      )}
      <form onSubmit={(e) => { e.preventDefault(); if (texto.trim()) enviar.mutate(); }} className="flex gap-2 items-end">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={LIMITE} rows={2} placeholder="Escreva uma anotação para a equipe..."
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim()) { e.preventDefault(); enviar.mutate(); } }}
          className="flex-1 border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500 resize-y" aria-label="Novo comentário" />
        <button type="submit" disabled={!texto.trim() || enviar.isPending} className="p-2.5 rounded-lg bg-rose-600 text-white disabled:opacity-40" aria-label="Enviar comentário"><Send size={16} /></button>
      </form>
      {erro && <p role="alert" className="text-xs text-rose-600">{erro}</p>}
    </section>
  );
}
