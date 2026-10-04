import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Ban, GripVertical, Loader2, Lock, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  COLUNAS_PADRAO, CRITICIDADES, LIMITES, diaEmBrasilia, edicaoParaBanco, validarEdicaoTarefa, validarNovaTarefa, validarQuadro,
  type Coluna, type ColunaEdicao, type Criticidade, type ItemTarefa, type NovaTarefa, type Pessoa, type Quadro, type Tarefa,
} from '../logic';
import { Checklist, ClientePicker, ResponsavelEnvolvidos } from './campos';
import { Campo, Modal, inputCls, useToque } from './ui';
import { mensagemErro } from '../api';

type Cliente = { id: string; name: string; phone: string };

const BOTAO_CRITICIDADE: Record<Criticidade, { ativo: string; inativo: string }> = {
  normal: { ativo: 'bg-slate-700 text-white border-slate-700', inativo: 'border-slate-200 text-slate-600' },
  urgente: { ativo: 'bg-amber-500 text-white border-amber-500', inativo: 'border-amber-200 text-amber-700' },
  critico: { ativo: 'bg-red-600 text-white border-red-600', inativo: 'border-red-100 text-red-600' },
};

function Rodape({ esquerda, onFechar, onSalvar, ocupado, textoFechar = 'CANCELAR', textoSalvar = 'SALVAR', erro }: {
  esquerda?: React.ReactNode; onFechar: () => void; onSalvar: () => void; ocupado: boolean; textoFechar?: string; textoSalvar?: string; erro?: string | null;
}) {
  return (
    <div className="space-y-2">
      {erro && <p role="alert" className="text-sm text-red-600 font-medium">{erro}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2 mr-auto">{esquerda}</div>
        <button type="button" onClick={onFechar} className="px-4 py-2.5 text-xs font-bold tracking-wide text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{textoFechar}</button>
        <button type="button" onClick={onSalvar} disabled={ocupado} className="px-5 py-2.5 text-xs font-bold tracking-wide text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
          {ocupado && <Loader2 size={14} className="animate-spin" />}{textoSalvar}
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Adicionar tarefa
// -----------------------------------------------------------------------------
export function NovaTarefaModal({ quadros, colunas, pessoas, clientes, eu, hoje, quadroInicial, colunaInicial, onClose, onSalvar }: {
  quadros: Quadro[]; colunas: Coluna[]; pessoas: Pessoa[]; clientes: Cliente[]; eu: string; hoje: string;
  quadroInicial: string; colunaInicial?: string | null;
  onClose: () => void; onSalvar: (dados: NovaTarefa) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState(hoje);
  const [criticidade, setCriticidade] = useState<Criticidade>('normal');
  const [cliente, setCliente] = useState<string | null>(null);
  const [responsavel, setResponsavel] = useState(eu);
  const [envolvidos, setEnvolvidos] = useState<string[]>([]);
  const [quadro, setQuadro] = useState(quadroInicial);
  const colunasDoQuadro = useMemo(() => colunas.filter((c) => c.quadro_id === quadro).sort((a, b) => a.posicao - b.posicao), [colunas, quadro]);
  const [coluna, setColuna] = useState(colunaInicial || colunasDoQuadro[0]?.id || '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const trocarQuadro = (id: string) => {
    setQuadro(id);
    setColuna(colunas.filter((c) => c.quadro_id === id).sort((a, b) => a.posicao - b.posicao)[0]?.id || '');
  };

  const salvar = async () => {
    const r = validarNovaTarefa({ titulo, responsible_id: responsavel, data_limite: data, criticidade, client_id: cliente, coluna_id: coluna, envolvidos });
    if (r.ok === false) { setErro(r.erro); return; }
    setOcupado(true); setErro(null);
    try { await onSalvar(r.dados); onClose(); } catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
  };

  return (
    <Modal titulo="Adicionar tarefa" onClose={onClose} rodape={<Rodape onFechar={onClose} onSalvar={salvar} ocupado={ocupado} erro={erro} />}>
      <div className="space-y-4">
        <Campo rotulo="Descrição da tarefa" obrigatorio>
          <textarea autoFocus rows={3} maxLength={LIMITES.tituloTarefa} value={titulo} onChange={(e) => setTitulo(e.target.value)} className={`${inputCls} resize-none`} />
        </Campo>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo rotulo="Data"><input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} /></Campo>
          <Campo rotulo="Prioridade" obrigatorio>
            <select value={criticidade} onChange={(e) => setCriticidade(e.target.value as Criticidade)} className={inputCls}>
              {CRITICIDADES.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Cliente" composto><ClientePicker clientes={clientes} valor={cliente} onChange={setCliente} /></Campo>
        <div>
          <span className="block text-xs font-bold text-slate-500 mb-1">Responsável *</span>
          <ResponsavelEnvolvidos pessoas={pessoas} responsavel={responsavel} envolvidos={envolvidos} onResponsavel={setResponsavel} onEnvolvidos={setEnvolvidos} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo rotulo="Quadro do Kanban" obrigatorio>
            <select value={quadro} onChange={(e) => trocarQuadro(e.target.value)} className={inputCls}>
              {quadros.map((q) => <option key={q.id} value={q.id}>{q.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Coluna do Kanban" obrigatorio>
            <select value={coluna} onChange={(e) => setColuna(e.target.value)} className={inputCls}>
              {colunasDoQuadro.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
        </div>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Editar tarefa
// -----------------------------------------------------------------------------
export function EditarTarefaModal({ tarefa, colunas, pessoas, clientes, hoje, onClose, onSalvar, onExcluir, onAlternarItem, onRemoverItem, onAdicionarItem }: {
  tarefa: Tarefa; colunas: Coluna[]; pessoas: Pessoa[]; clientes: Cliente[]; hoje: string;
  onClose: () => void; onSalvar: (campos: Record<string, unknown>) => Promise<void>; onExcluir: () => void;
  onAlternarItem: (i: ItemTarefa) => void; onRemoverItem: (i: ItemTarefa) => void; onAdicionarItem: (titulo: string) => void;
}) {
  const t = tarefa;
  const diaConclusaoAtual = t.concluida_em ? diaEmBrasilia(t.concluida_em) : null;
  const [titulo, setTitulo] = useState(t.titulo);
  const [criticidade, setCriticidade] = useState<Criticidade>(t.criticidade);
  const [responsavel, setResponsavel] = useState(t.responsible_id);
  const [envolvidos, setEnvolvidos] = useState<string[]>(t.envolvidos || []);
  const [data, setData] = useState(t.data_limite || '');
  const [coluna, setColuna] = useState(t.coluna_id);
  const [concluidaEm, setConcluidaEm] = useState(diaConclusaoAtual || hoje);
  const [cliente, setCliente] = useState<string | null>(t.client_id);
  const [descricao, setDescricao] = useState(t.descricao || '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ultima = colunas[colunas.length - 1]?.id;
  const cancelada = !!t.cancelada_em;

  const enviar = async (campos: Record<string, unknown>, fechar = true) => {
    const r = validarEdicaoTarefa(campos);
    if (r.ok === false) { setErro(r.erro); return; }
    setOcupado(true); setErro(null);
    try { await onSalvar(edicaoParaBanco(r.dados)); if (fechar) onClose(); } catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
  };

  const salvar = () => {
    const c: Record<string, unknown> = {};
    if (titulo.trim() !== t.titulo) c.titulo = titulo;
    if (criticidade !== t.criticidade) c.criticidade = criticidade;
    if (responsavel !== t.responsible_id) c.responsible_id = responsavel;
    if ((data || null) !== t.data_limite) c.data_limite = data || null;
    if (coluna !== t.coluna_id) c.coluna_id = coluna;
    if (coluna === ultima && (t.coluna_id !== ultima || concluidaEm !== diaConclusaoAtual)) c.concluida_em = concluidaEm || hoje;
    if (cliente !== t.client_id) c.client_id = cliente;
    if ((descricao.trim() || null) !== (t.descricao?.trim() || null)) c.descricao = descricao;
    const a = [...envolvidos].sort().join(); const b = [...(t.envolvidos || [])].sort().join();
    if (a !== b) c.envolvidos = envolvidos;
    if (Object.keys(c).length === 0) { onClose(); return; }
    enviar(c);
  };

  const esquerda = (
    <>
      <button type="button" onClick={onExcluir} className="px-3 py-2.5 text-xs font-bold text-red-600 border border-red-100 rounded-lg hover:bg-red-50 flex items-center gap-1"><Trash2 size={14} /> Excluir</button>
      <button type="button" onClick={() => enviar({ cancelada: !cancelada })} disabled={ocupado} className="px-3 py-2.5 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
        {cancelada ? <><RotateCcw size={14} /> Reativar</> : <><Ban size={14} /> Cancelar tarefa</>}
      </button>
    </>
  );

  return (
    <Modal titulo="Editar tarefa" onClose={onClose} rodape={<Rodape esquerda={esquerda} onFechar={onClose} onSalvar={salvar} ocupado={ocupado} erro={erro} textoFechar="FECHAR" />}>
      <div className="space-y-4">
        <Campo rotulo="Título" obrigatorio>
          <textarea rows={2} maxLength={LIMITES.tituloTarefa} value={titulo} onChange={(e) => setTitulo(e.target.value)} className={`${inputCls} resize-none`} />
        </Campo>
        <div>
          <span className="block text-xs font-bold text-slate-500 mb-1">Criticidade</span>
          <div className="grid grid-cols-3 gap-2">
            {CRITICIDADES.map((c) => (
              <button key={c.valor} type="button" onClick={() => setCriticidade(c.valor)} aria-pressed={criticidade === c.valor}
                className={`py-2 rounded-lg border text-xs font-bold ${criticidade === c.valor ? BOTAO_CRITICIDADE[c.valor].ativo : BOTAO_CRITICIDADE[c.valor].inativo}`}>
                {c.rotulo}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="block text-xs font-bold text-slate-500 mb-1">Responsável *</span>
          <ResponsavelEnvolvidos pessoas={pessoas} responsavel={responsavel} envolvidos={envolvidos} onResponsavel={setResponsavel} onEnvolvidos={setEnvolvidos} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo rotulo="Data limite"><input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} /></Campo>
          <Campo rotulo="Coluna">
            <select value={coluna} onChange={(e) => setColuna(e.target.value)} className={inputCls}>
              {colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
        </div>
        {coluna === ultima && (
          <Campo rotulo="Concluída em">
            <input type="date" value={concluidaEm} max={hoje} onChange={(e) => setConcluidaEm(e.target.value)} className={inputCls} />
          </Campo>
        )}
        <Campo rotulo="Cliente" composto><ClientePicker clientes={clientes} valor={cliente} onChange={setCliente} /></Campo>
        <Campo rotulo="Observação" dica={`${LIMITES.descricao - descricao.length} caracteres restantes`}>
          <textarea rows={3} maxLength={LIMITES.descricao} value={descricao} onChange={(e) => setDescricao(e.target.value)} className={`${inputCls} resize-y`} />
        </Campo>
        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-bold text-slate-500 mb-2">Sub-itens <span className="font-normal text-slate-400">(salvos na hora)</span></p>
          <Checklist itens={t.tarefa_itens || []} sempreVisivel onAlternar={onAlternarItem} onRemover={onRemoverItem} onAdicionar={onAdicionarItem} />
        </div>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Novo quadro / Editar quadro
// -----------------------------------------------------------------------------
export function QuadroModal({ quadro, colunas, onClose, onSalvar }: {
  quadro?: Quadro; colunas?: Coluna[]; onClose: () => void; onSalvar: (nome: string, colunas: ColunaEdicao[]) => Promise<void>;
}) {
  const toque = useToque();
  const [nome, setNome] = useState(quadro?.nome || '');
  const [lista, setLista] = useState<(ColunaEdicao & { chave: string })[]>(() =>
    (colunas?.length ? colunas.map((c) => ({ id: c.id, nome: c.nome })) : COLUNAS_PADRAO).map((c, i) => ({ ...c, chave: c.id || `nova-${i}` })),
  );
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const mover = (de: number, para: number) => {
    if (de === para || de <= 0 || de >= lista.length - 1 || para <= 0 || para >= lista.length - 1) return;
    const n = [...lista];
    const [x] = n.splice(de, 1);
    n.splice(para, 0, x);
    setLista(n);
  };
  const novaColuna = () => {
    if (lista.length >= LIMITES.maxColunas) return;
    const n = [...lista];
    n.splice(n.length - 1, 0, { nome: '', chave: `nova-${Date.now()}` });
    setLista(n);
  };
  const salvar = async () => {
    const cols = lista.map(({ id, nome }) => (id ? { id, nome } : { nome }));
    const e = validarQuadro(nome, cols);
    if (e) { setErro(e); return; }
    setOcupado(true); setErro(null);
    try { await onSalvar(nome, cols); onClose(); } catch (err) { setErro(mensagemErro(err)); } finally { setOcupado(false); }
  };

  return (
    <Modal titulo={quadro ? 'Editar quadro' : 'Novo quadro'} onClose={onClose} rodape={<Rodape onFechar={onClose} onSalvar={salvar} ocupado={ocupado} erro={erro} />}>
      <div className="space-y-5">
        <Campo rotulo="Nome do quadro" obrigatorio dica={`${LIMITES.nomeQuadro - nome.length} caracteres restantes`}>
          <input autoFocus type="text" maxLength={LIMITES.nomeQuadro} value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
        </Campo>
        <div>
          <span className="block text-xs font-bold text-slate-500 mb-2">Colunas</span>
          <ol className="space-y-2">
            {lista.map((c, i) => {
              const fixa = i === 0 || i === lista.length - 1;
              return (
                <li
                  key={c.chave}
                  draggable={!fixa && !toque}
                  onDragStart={() => setArrastando(i)}
                  onDragEnd={() => setArrastando(null)}
                  onDragOver={(e) => { if (arrastando !== null && !fixa) { e.preventDefault(); if (arrastando !== i) { mover(arrastando, i); setArrastando(i); } } }}
                  className={`flex items-start gap-2 ${arrastando === i ? 'opacity-50' : ''}`}
                >
                  <span className="mt-2.5 text-slate-400 shrink-0" title={fixa ? 'Coluna fixa' : 'Arraste para reordenar'}>
                    {fixa ? <Lock size={16} /> : <GripVertical size={16} className={toque ? '' : 'cursor-grab'} />}
                  </span>
                  <span className="mt-2.5 w-5 text-xs font-bold text-slate-500 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text" maxLength={LIMITES.nomeColuna} value={c.nome} aria-label={`Nome da coluna ${i + 1}`}
                      onChange={(e) => setLista(lista.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))}
                      className={inputCls}
                    />
                    <span className="block text-[11px] text-slate-400 mt-0.5">{LIMITES.nomeColuna - c.nome.length} caracteres restantes</span>
                  </div>
                  {!fixa && toque && (
                    <div className="flex flex-col gap-0.5 mt-1">
                      <button type="button" onClick={() => mover(i, i - 1)} disabled={i <= 1} className="p-0.5 text-slate-500 disabled:opacity-30" aria-label="Subir coluna"><ArrowUp size={14} /></button>
                      <button type="button" onClick={() => mover(i, i + 1)} disabled={i >= lista.length - 2} className="p-0.5 text-slate-500 disabled:opacity-30" aria-label="Descer coluna"><ArrowDown size={14} /></button>
                    </div>
                  )}
                  {fixa ? <span className="w-7 shrink-0" aria-hidden /> : (
                    <button type="button" onClick={() => setLista(lista.filter((_, j) => j !== i))} disabled={lista.length <= LIMITES.minColunas}
                      className="mt-1.5 p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30 shrink-0" aria-label={`Remover coluna ${i + 1}`}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <button type="button" onClick={novaColuna} disabled={lista.length >= LIMITES.maxColunas} className="mt-3 flex items-center gap-1 text-xs font-bold tracking-wide text-rose-600 hover:text-rose-700 disabled:opacity-40">
            <Plus size={14} /> NOVA COLUNA
          </button>
          <p className="mt-3 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3">
            A primeira e a última coluna são fixas (início e conclusão). Arraste as do meio para reordenar. Ao remover uma coluna, os cartões dela vão para a primeira.
          </p>
        </div>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Equipe (pessoas que podem ser responsáveis ou envolvidas)
// -----------------------------------------------------------------------------
export function EquipeModal({ pessoas, onClose, onSalvar }: {
  pessoas: Pessoa[]; onClose: () => void; onSalvar: (p: { id?: string; name: string; active?: boolean }) => Promise<void>;
}) {
  const [novo, setNovo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const executar = async (p: { id?: string; name: string; active?: boolean }): Promise<boolean> => {
    if (!p.name.trim()) { setErro('Informe o nome.'); return false; }
    setOcupado(true); setErro(null);
    try { await onSalvar(p); return true; } catch (e) { setErro(mensagemErro(e)); return false; } finally { setOcupado(false); }
  };
  const adicionar = async () => { if (await executar({ name: novo })) setNovo(''); };
  return (
    <Modal titulo="Equipe" onClose={onClose} largura="md:max-w-[480px]" rodape={<div className="flex justify-end"><button type="button" onClick={onClose} className="px-4 py-2.5 text-xs font-bold tracking-wide text-slate-600 border border-slate-200 rounded-lg">FECHAR</button></div>}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">Pessoas que podem ser responsáveis ou envolvidas nas tarefas. Quem entra no sistema aparece aqui automaticamente.</p>
        {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
          {pessoas.map((p) => (
            <li key={p.id} className="flex items-center gap-2 p-2">
              <input
                type="text" defaultValue={p.name} aria-label="Nome" maxLength={80}
                onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== p.name) executar({ id: p.id, name: e.target.value, active: p.active !== false }); }}
                className={`${inputCls} py-1.5 ${p.active === false ? 'text-slate-400' : ''}`}
              />
              <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                <input type="checkbox" checked={p.active !== false} onChange={(e) => executar({ id: p.id, name: p.name, active: e.target.checked })} className="accent-rose-600" /> Ativa
              </label>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input type="text" value={novo} maxLength={80} onChange={(e) => setNovo(e.target.value)} placeholder="Nome da nova pessoa"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }} className={inputCls} />
          <button type="button" disabled={ocupado || !novo.trim()} onClick={adicionar} className="px-4 bg-rose-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">Adicionar</button>
        </div>
      </div>
    </Modal>
  );
}
