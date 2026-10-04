import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronLeft, EllipsisVertical, Loader2, Pencil, Plus, RefreshCw, SquareKanban, Trash2, Users } from 'lucide-react';
import * as api from '../features/kanban/api';
import { kanbanKeys, mensagemErro } from '../features/kanban/api';
import { ErroPublico } from '../lib/seguranca/erros';
import { useAuth } from '../contexts/AuthContext';
import {
  idsDaColuna, lerFiltros, passaNoFiltro, reordenar, statusDaPosicao, urlFiltros, hojeISO,
  type Coluna, type ColunaEdicao, type Filtros, type ItemTarefa, type NovaTarefa, type Pessoa, type Quadro, type Tarefa,
} from '../features/kanban/logic';
import { TaskCard } from '../features/kanban/components/TaskCard';
import { FilterBar } from '../features/kanban/components/FilterBar';
import { EditarTarefaModal, EquipeModal, NovaTarefaModal, QuadroModal } from '../features/kanban/components/janelas';
import { Aviso, Confirmar, Painel, useToque } from '../features/kanban/components/ui';

// Cores dos quadros pela posição (8 opções)
const CORES_QUADRO = [
  'linear-gradient(135deg, #1e3a5f, #0f2440)', // azul-marinho
  'linear-gradient(135deg, #0f766e, #134e4a)', // verde-petróleo
  'linear-gradient(135deg, #7c3aed, #5b21b6)', // roxo
  'linear-gradient(135deg, #c2410c, #9a3412)', // laranja escuro
  'linear-gradient(135deg, #2563eb, #1d4ed8)', // azul
  'linear-gradient(135deg, #9f1239, #7f1d1d)', // vinho
  'linear-gradient(135deg, #16a34a, #166534)', // verde
  'linear-gradient(135deg, #475569, #1f2937)', // grafite
];

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

export default function Tarefas() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const quadroId = params.get('quadro');
  const nova = params.get('nova');
  const filtros = useMemo(() => lerFiltros(params), [params]);
  const hoje = hojeISO();
  const [aviso, setAviso] = useState<string | null>(null);
  const fecharAviso = useCallback(() => setAviso(null), []);

  // Primeiro acesso: liga o login a uma pessoa e cria o "Kanban Padrão" se não houver quadros
  const init = useQuery({
    queryKey: kanbanKeys.eu,
    queryFn: async () => { const eu = await api.usuarioAtual(); await api.garantirPadrao(); return eu; },
    staleTime: Infinity,
  });
  const pronto = init.isSuccess;
  const quadros = useQuery({ queryKey: kanbanKeys.quadros, queryFn: api.listarQuadros, enabled: pronto });
  const colunas = useQuery({ queryKey: kanbanKeys.colunas, queryFn: api.listarColunas, enabled: pronto });
  const pessoas = useQuery({ queryKey: kanbanKeys.pessoas, queryFn: api.listarPessoas, enabled: pronto });
  const clientes = useQuery({ queryKey: kanbanKeys.clientes, queryFn: api.listarClientes, enabled: pronto });

  const listaQuadros = quadros.data || [];
  const todasColunas = colunas.data || [];
  const quadroAtual = listaQuadros.find((q) => q.id === quadroId) || null;

  // ?nova=tarefa sem quadro abre o primeiro quadro com a janela já aberta
  useEffect(() => {
    if (nova === 'tarefa' && !quadroId && listaQuadros.length) {
      setParams({ quadro: listaQuadros[0].id, nova: 'tarefa' }, { replace: true });
    }
  }, [nova, quadroId, listaQuadros, setParams]);

  // Quadro inexistente na URL volta para a tela inicial
  useEffect(() => {
    if (quadroId && quadros.isSuccess && !quadroAtual) setParams({}, { replace: true });
  }, [quadroId, quadros.isSuccess, quadroAtual, setParams]);

  const limparNova = () => {
    const p = new URLSearchParams(params);
    p.delete('nova');
    setParams(p, { replace: true });
  };

  const [quadroModal, setQuadroModal] = useState<null | 'novo'>(null);
  // Quadro em edição (pelo ⋮ do quadro aberto ou pelo menu do card na tela inicial)
  const [quadroEditandoId, setQuadroEditandoId] = useState<string | null>(null);
  const quadroEditando = listaQuadros.find((q) => q.id === quadroEditandoId) || null;
  // Exclusão pelo menu do card na tela inicial
  const [quadroExcluir, setQuadroExcluir] = useState<Quadro | null>(null);
  const [excluindoQuadro, setExcluindoQuadro] = useState(false);
  const pedirExclusao = (q: Quadro) => {
    if (listaQuadros.length <= 1) setAviso('Este é o único quadro. Crie outro antes de excluí-lo.');
    else setQuadroExcluir(q);
  };
  const confirmarExclusaoQuadro = async () => {
    if (!quadroExcluir) return;
    setExcluindoQuadro(true);
    try {
      await api.excluirQuadro(quadroExcluir.id);
      setQuadroExcluir(null);
      await qc.invalidateQueries({ queryKey: kanbanKeys.base });
    } catch (e) {
      setQuadroExcluir(null);
      setAviso(mensagemErro(e, 'Não foi possível excluir o quadro.'));
    } finally {
      setExcluindoQuadro(false);
    }
  };
  // Quadro recém-criado: abre ao fechar a janela (uma única troca de URL, que também tira o ?nova=)
  const quadroCriado = useRef<string | null>(null);
  const abrirNovoQuadro = () => setQuadroModal('novo');
  const fecharQuadroModal = () => {
    setQuadroModal(null);
    setQuadroEditandoId(null);
    if (quadroCriado.current) { setParams({ quadro: quadroCriado.current }); quadroCriado.current = null; }
    else if (nova === 'quadro') limparNova();
  };

  const criarQuadro = async (nome: string, cols: ColunaEdicao[]) => {
    try {
      quadroCriado.current = await api.criarQuadro(nome, cols);
      await Promise.all([qc.invalidateQueries({ queryKey: kanbanKeys.quadros }), qc.invalidateQueries({ queryKey: kanbanKeys.colunas })]);
    } catch (e) { throw new ErroPublico(mensagemErro(e)); }
  };

  if (init.isError || quadros.isError || colunas.isError) {
    const erro = init.error || quadros.error || colunas.error;
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <p className="text-slate-700 font-bold">Não foi possível abrir o Kanban.</p>
        <p className="text-sm text-slate-500">{mensagemErro(erro, 'Verifique a conexão e tente novamente.')}</p>
        <button type="button" onClick={() => qc.invalidateQueries({ queryKey: kanbanKeys.base })} className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold">Tentar de novo</button>
      </div>
    );
  }
  if (!pronto || quadros.isLoading || colunas.isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-rose-500" size={32} /></div>;
  }

  return (
    <>
      {quadroAtual ? (
        <QuadroAberto
          key={quadroAtual.id}
          quadro={quadroAtual}
          quadros={listaQuadros}
          colunas={todasColunas}
          pessoas={pessoas.data || []}
          clientes={clientes.data || []}
          eu={init.data!}
          hoje={hoje}
          filtros={filtros}
          novaTarefa={nova === 'tarefa'}
          onFecharNova={limparNova}
          onFiltros={(f) => setParams(urlFiltros(f, { quadro: quadroAtual.id }))}
          onNovoQuadro={abrirNovoQuadro}
          onEditarQuadro={() => setQuadroEditandoId(quadroAtual.id)}
          onAviso={setAviso}
        />
      ) : (
        <TelaInicial quadros={listaQuadros} colunas={todasColunas} onNovoQuadro={abrirNovoQuadro} onEditar={setQuadroEditandoId} onExcluir={pedirExclusao} />
      )}

      {(quadroModal === 'novo' || nova === 'quadro') && <QuadroModal onClose={fecharQuadroModal} onSalvar={criarQuadro} />}
      {quadroEditando && (
        <QuadroModal
          key={quadroEditando.id}
          quadro={quadroEditando}
          colunas={todasColunas.filter((c) => c.quadro_id === quadroEditando.id).sort((a, b) => a.posicao - b.posicao)}
          onClose={fecharQuadroModal}
          onSalvar={async (nome, cols) => {
            try {
              await api.salvarQuadro(quadroEditando.id, nome, cols);
              await qc.invalidateQueries({ queryKey: kanbanKeys.base });
            } catch (e) { throw new ErroPublico(mensagemErro(e)); }
          }}
        />
      )}
      {quadroExcluir && (
        <Confirmar titulo="Excluir quadro" texto={`O quadro "${quadroExcluir.nome}", as colunas e todos os cartões dele serão apagados. Esta ação não pode ser desfeita.`}
          botao="Excluir quadro" ocupado={excluindoQuadro} onConfirmar={confirmarExclusaoQuadro} onCancelar={() => setQuadroExcluir(null)} />
      )}
      <Aviso texto={aviso} onFechar={fecharAviso} />
    </>
  );
}

// =============================================================================
// Tela inicial: só os quadros
// =============================================================================
function TelaInicial({ quadros, colunas, onNovoQuadro, onEditar, onExcluir }: {
  quadros: Quadro[]; colunas: Coluna[]; onNovoQuadro: () => void; onEditar: (id: string) => void; onExcluir: (q: Quadro) => void;
}) {
  const resumo = useQuery({ queryKey: kanbanKeys.resumo, queryFn: api.listarResumo });
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const porColuna = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of resumo.data || []) m.set(t.coluna_id, (m.get(t.coluna_id) || 0) + 1);
    return m;
  }, [resumo.data]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-800">Kanban de tarefas</h2>
        <p className="text-sm text-slate-500 mt-1">Escolha um quadro para abrir as tarefas.</p>
      </div>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {quadros.map((q, i) => {
          const cols = colunas.filter((c) => c.quadro_id === q.id).sort((a, b) => a.posicao - b.posicao);
          const contagens = cols.map((c) => porColuna.get(c.id) || 0);
          const afazer = contagens[0] || 0;
          const concluido = contagens.length > 1 ? contagens[contagens.length - 1] : 0;
          const fazendo = contagens.slice(1, -1).reduce((a, b) => a + b, 0);
          const total = afazer + fazendo + concluido;
          return (
            <div key={q.id} className="relative group/quadro">
            <Link to={`/tarefas?quadro=${q.id}`} style={{ backgroundImage: CORES_QUADRO[i % CORES_QUADRO.length] }}
              className="h-32 rounded-2xl p-4 flex flex-col justify-between text-white shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all">
              <p className="text-lg font-black leading-tight break-words line-clamp-2 pr-8">{q.nome}</p>
              <div className="space-y-1.5">
                <div className="h-1.5 rounded-full bg-white/20 overflow-hidden flex" aria-hidden>
                  {total > 0 && <>
                    <div className="bg-white" style={{ width: `${(afazer / total) * 100}%` }} />
                    <div className="bg-amber-300" style={{ width: `${(fazendo / total) * 100}%` }} />
                    <div className="bg-emerald-400" style={{ width: `${(concluido / total) * 100}%` }} />
                  </>}
                </div>
                <p className="text-xs text-white/85">
                  {resumo.isLoading ? '…' : total === 0 ? 'Nenhuma atividade' : `${afazer} a fazer · ${fazendo} fazendo · ${concluido} concluído`}
                </p>
              </div>
            </Link>
            {/* Menu do quadro: editar (nome e colunas) e excluir */}
            <button
              type="button"
              onClick={() => setMenuAberto(menuAberto === q.id ? null : q.id)}
              className="absolute top-2.5 right-2.5 p-1.5 rounded-lg text-white/90 bg-white/10 hover:bg-white/25 backdrop-blur-sm"
              aria-label={`Opções do quadro ${q.nome}`}
              aria-haspopup="menu"
              aria-expanded={menuAberto === q.id}
            >
              <EllipsisVertical size={16} />
            </button>
            {menuAberto === q.id && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuAberto(null)} />
                <div role="menu" className="absolute z-50 top-11 right-2.5 w-44 bg-white border border-slate-200 rounded-xl shadow-xl p-1">
                  <button type="button" role="menuitem" onClick={() => { setMenuAberto(null); onEditar(q.id); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                    <Pencil size={14} /> Editar quadro
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuAberto(null); onExcluir(q); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50">
                    <Trash2 size={14} /> Excluir quadro
                  </button>
                </div>
              </>
            )}
            </div>
          );
        })}
        <button type="button" onClick={onNovoQuadro}
          className="h-32 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-rose-400 hover:text-rose-600 flex flex-col items-center justify-center gap-1 font-bold">
          <Plus size={22} /> Criar novo quadro
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Quadro aberto
// =============================================================================
interface QuadroAbertoProps {
  quadro: Quadro;
  quadros: Quadro[];
  colunas: Coluna[];
  pessoas: Pessoa[];
  clientes: { id: string; name: string; phone: string }[];
  eu: string;
  hoje: string;
  filtros: Filtros;
  novaTarefa: boolean;
  onFecharNova: () => void;
  onFiltros: (f: Filtros) => void;
  onNovoQuadro: () => void;
  onEditarQuadro: () => void;
  onAviso: (t: string) => void;
}

function QuadroAberto(p: QuadroAbertoProps) {
  const qc = useQueryClient();
  const toque = useToque();
  const colunas = useMemo(() => p.colunas.filter((c) => c.quadro_id === p.quadro.id).sort((a, b) => a.posicao - b.posicao), [p.colunas, p.quadro.id]);
  const colunaIds = colunas.map((c) => c.id);
  const chave = kanbanKeys.tarefas(p.quadro.id);
  const tarefasQ = useQuery({ queryKey: [...chave, colunaIds.join()], queryFn: () => api.listarTarefas(colunaIds) });
  const chaveCompleta = [...chave, colunaIds.join()];
  const tarefas = tarefasQ.data || [];
  const visiveis = useMemo(() => tarefas.filter((t) => passaNoFiltro(t, p.filtros, p.hoje)), [tarefas, p.filtros, p.hoje]);

  const [menu, setMenu] = useState<null | 'quadros' | 'acoes' | 'mais'>(null);
  const [colunaNova, setColunaNova] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<Tarefa | null>(null);
  const [excluirQuadro, setExcluirQuadro] = useState(false);
  const [equipe, setEquipe] = useState(false);
  // Só a administradora gerencia a equipe; o banco também barra (AUZ-07, política "users: administradora gerencia").
  const ehAdmin = useAuth().perfil?.role === 'admin';
  const [ocupado, setOcupado] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ coluna: string; antesDe: string | null } | null>(null);

  const nomePessoa = useCallback((id: string | null) => p.pessoas.find((x) => x.id === id)?.name || '—', [p.pessoas]);
  const atualizar = () => qc.invalidateQueries({ queryKey: kanbanKeys.base });
  const patchLocal = (fn: (l: Tarefa[]) => Tarefa[]) => qc.setQueryData<Tarefa[]>(chaveCompleta, (l) => fn(l || []));

  // ---- mover / reordenar (otimista; desfaz se o banco recusar)
  const mover = async (id: string, coluna: string, antesDe: string | null) => {
    const antes = tarefas;
    let novo = reordenar(antes, id, coluna, antesDe);
    if (novo === antes) return;
    const idx = colunas.findIndex((c) => c.id === coluna);
    novo = novo.map((t) => (t.id === id ? { ...t, status: statusDaPosicao(idx, colunas.length) } : t));
    qc.setQueryData(chaveCompleta, novo);
    try {
      await api.gravarOrdem(coluna, idsDaColuna(novo, coluna));
    } catch (e) {
      qc.setQueryData(chaveCompleta, antes);
      p.onAviso(mensagemErro(e, 'Não foi possível mover o cartão.'));
    } finally {
      qc.invalidateQueries({ queryKey: chave });
      qc.invalidateQueries({ queryKey: kanbanKeys.resumo });
    }
  };

  const visiveisDaColuna = (coluna: string) => visiveis.filter((t) => t.coluna_id === coluna).sort((a, b) => a.ordem - b.ordem);

  // ---- arrastar e soltar (HTML5)
  const aoArrastarSobreCartao = (e: React.DragEvent, t: Tarefa) => {
    if (!arrastando) return;
    e.preventDefault(); e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const metadeDeCima = e.clientY < r.top + r.height / 2;
    const lista = visiveisDaColuna(t.coluna_id);
    const i = lista.findIndex((x) => x.id === t.id);
    const antesDe = metadeDeCima ? t.id : lista[i + 1]?.id ?? null;
    if (alvo?.coluna !== t.coluna_id || alvo?.antesDe !== antesDe) setAlvo({ coluna: t.coluna_id, antesDe });
  };
  const aoArrastarSobreColuna = (e: React.DragEvent, coluna: string) => {
    if (!arrastando) return;
    e.preventDefault();
    if ((e.target as HTMLElement).closest('[data-tarefa]')) return;
    if (alvo?.coluna !== coluna || alvo?.antesDe !== null) setAlvo({ coluna, antesDe: null });
  };
  const aoSoltar = (e: React.DragEvent, coluna: string) => {
    e.preventDefault();
    const id = arrastando;
    const destino = alvo && alvo.coluna === coluna ? alvo.antesDe : null;
    setArrastando(null); setAlvo(null);
    if (id) mover(id, coluna, destino);
  };

  // ---- cartões
  const salvarTarefa = async (id: string, campos: Record<string, unknown>) => {
    try {
      await api.editarTarefa(id, campos);
    } catch (e) {
      throw new ErroPublico(mensagemErro(e));
    } finally {
      qc.invalidateQueries({ queryKey: chave });
      qc.invalidateQueries({ queryKey: kanbanKeys.resumo });
    }
  };
  const salvarObservacao = (t: Tarefa, texto: string) => {
    patchLocal((l) => l.map((x) => (x.id === t.id ? { ...x, descricao: texto.trim() ? texto : null } : x)));
    salvarTarefa(t.id, { descricao: texto.trim() ? texto : null }).catch((e) => p.onAviso(mensagemErro(e)));
  };
  const criarTarefa = async (dados: NovaTarefa) => {
    try {
      await api.criarTarefa(dados);
    } catch (e) {
      throw new ErroPublico(mensagemErro(e));
    }
    qc.invalidateQueries({ queryKey: kanbanKeys.base });
  };
  const confirmarExclusao = async () => {
    if (!excluindo) return;
    setOcupado(true);
    try {
      await api.excluirTarefa(excluindo.id);
      patchLocal((l) => l.filter((x) => x.id !== excluindo.id));
      setEditando(null); setExcluindo(null);
    } catch (e) {
      p.onAviso(mensagemErro(e, 'Não foi possível excluir.'));
    } finally {
      setOcupado(false);
      qc.invalidateQueries({ queryKey: chave });
      qc.invalidateQueries({ queryKey: kanbanKeys.resumo });
    }
  };

  // ---- sub-itens (otimista)
  const patchItens = (taskId: string, fn: (i: ItemTarefa[]) => ItemTarefa[]) =>
    patchLocal((l) => l.map((t) => (t.id === taskId ? { ...t, tarefa_itens: fn(t.tarefa_itens || []) } : t)));
  const alternarItem = (t: Tarefa, item: ItemTarefa) => {
    patchItens(t.id, (its) => its.map((i) => (i.id === item.id ? { ...i, concluido: !i.concluido } : i)));
    api.editarItem(t.id, item.id, { concluido: !item.concluido }).catch((e) => {
      patchItens(t.id, (its) => its.map((i) => (i.id === item.id ? { ...i, concluido: item.concluido } : i)));
      p.onAviso(mensagemErro(e));
    });
  };
  const removerItem = (t: Tarefa, item: ItemTarefa) => {
    const antes = t.tarefa_itens || [];
    patchItens(t.id, (its) => its.filter((i) => i.id !== item.id));
    api.excluirItem(t.id, item.id).catch((e) => { patchItens(t.id, () => antes); p.onAviso(mensagemErro(e)); });
  };
  const adicionarItem = (t: Tarefa, titulo: string) => {
    const its = t.tarefa_itens || [];
    const ordem = its.length ? Math.max(...its.map((i) => i.ordem)) + 1 : 0;
    api.criarItem(t.id, titulo, ordem)
      .then((novo) => patchItens(t.id, (l) => [...l, novo]))
      .catch((e) => p.onAviso(mensagemErro(e)));
  };

  const confirmarExclusaoQuadro = async () => {
    setOcupado(true);
    try {
      await api.excluirQuadro(p.quadro.id);
      setExcluirQuadro(false);
      await qc.invalidateQueries({ queryKey: kanbanKeys.base });
    } catch (e) {
      setExcluirQuadro(false);
      p.onAviso(mensagemErro(e, 'Não foi possível excluir o quadro.'));
    } finally {
      setOcupado(false);
    }
  };

  const tarefaEditando = tarefas.find((t) => t.id === editando) || null;
  const mostrarNova = p.novaTarefa || colunaNova !== null;
  const fecharNova = () => { setColunaNova(null); if (p.novaTarefa) p.onFecharNova(); };
  const poucasColunas = colunas.length <= 3;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/tarefas" className="inline-flex items-center text-xs font-bold text-slate-500 hover:text-rose-600"><ChevronLeft size={14} /> Quadros</Link>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <h2 className="text-xl md:text-2xl font-black text-slate-800">Kanban de tarefas</h2>
            <div className="relative">
              <button type="button" onClick={() => setMenu(menu === 'quadros' ? null : 'quadros')} aria-haspopup="menu"
                className="flex items-center gap-1 h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-bold text-slate-700 max-w-[60vw]">
                <span className="truncate">{p.quadro.nome}</span> <ChevronDown size={14} className="shrink-0" />
              </button>
              <Painel aberto={menu === 'quadros'} titulo="Quadros" onClose={() => setMenu(null)}>
                <div role="menu" className="space-y-0.5">
                  {p.quadros.map((q) => (
                    <Link key={q.id} role="menuitem" to={`/tarefas?quadro=${q.id}`} onClick={() => setMenu(null)}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm ${q.id === p.quadro.id ? 'bg-rose-50 text-rose-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}>
                      <span className="truncate">{q.nome}</span>{q.id === p.quadro.id && <Check size={14} />}
                    </Link>
                  ))}
                  <button type="button" role="menuitem" onClick={() => { setMenu(null); p.onNovoQuadro(); }} className="w-full flex items-center gap-2 px-3 py-2 mt-1 border-t border-slate-100 text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-lg">
                    <Plus size={14} /> Novo quadro
                  </button>
                </div>
              </Painel>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={atualizar} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-rose-600" aria-label="Atualizar" title="Atualizar">
            <RefreshCw size={18} className={tarefasQ.isFetching ? 'animate-spin' : ''} />
          </button>
          <div className="relative">
            <button type="button" onClick={() => setMenu(menu === 'mais' ? null : 'mais')} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-rose-600" aria-label="Mais opções" aria-haspopup="menu">
              <EllipsisVertical size={18} />
            </button>
            <Painel aberto={menu === 'mais'} titulo="Opções do quadro" onClose={() => setMenu(null)} alinhar="right">
              <div role="menu" className="space-y-0.5 min-w-[200px]">
                <button type="button" role="menuitem" onClick={() => { setMenu(null); p.onEditarQuadro(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"><Pencil size={14} /> Editar quadro</button>
                {ehAdmin && (<button type="button" role="menuitem" onClick={() => { setMenu(null); setEquipe(true); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"><Users size={14} /> Equipe</button>)}
                <button type="button" role="menuitem" onClick={() => { setMenu(null); if (p.quadros.length <= 1) p.onAviso('Este é o único quadro. Crie outro antes de excluí-lo.'); else setExcluirQuadro(true); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"><Trash2 size={14} /> Excluir quadro</button>
              </div>
            </Painel>
          </div>
          <div className="relative">
            <button type="button" onClick={() => setMenu(menu === 'acoes' ? null : 'acoes')} className="p-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm" aria-label="Adicionar" aria-haspopup="menu">
              <Plus size={18} />
            </button>
            <Painel aberto={menu === 'acoes'} titulo="Adicionar" onClose={() => setMenu(null)} alinhar="right">
              <div role="menu" className="space-y-0.5 min-w-[180px]">
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setColunaNova(colunas[0]?.id || ''); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"><Check size={14} /> Tarefa</button>
                <button type="button" role="menuitem" onClick={() => { setMenu(null); p.onNovoQuadro(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"><SquareKanban size={14} /> Novo quadro</button>
              </div>
            </Painel>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-500 hidden md:block">Arraste os cartões entre as colunas ou para cima e para baixo para definir a ordem.</p>

      <FilterBar filtros={p.filtros} pessoas={p.pessoas} hoje={p.hoje} onChange={p.onFiltros} />

      {/* Colunas: deslizantes no celular, lado a lado no PC */}
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-2 md:mx-0 md:px-0 md:gap-4 md:snap-none">
        {colunas.map((c, idx) => {
          const lista = visiveisDaColuna(c.id);
          const cor = idx === 0 ? 'bg-indigo-100 text-indigo-700' : idx === colunas.length - 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';
          const indicadorFim = alvo?.coluna === c.id && alvo.antesDe === null && arrastando;
          return (
            <section key={c.id} aria-label={c.nome}
              className={`w-[85vw] max-w-sm shrink-0 snap-center md:snap-align-none flex flex-col bg-slate-100 rounded-2xl ${poucasColunas ? 'md:w-auto md:max-w-none md:flex-1 md:min-w-[300px]' : 'md:w-[300px] md:max-w-none'}`}>
              <header className="flex items-center justify-between px-3 pt-3 pb-2">
                <h3 className="text-sm font-bold text-slate-700 truncate">{c.nome}</h3>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cor}`}>{lista.length}</span>
              </header>
              <div
                onDragOver={(e) => aoArrastarSobreColuna(e, c.id)}
                onDrop={(e) => aoSoltar(e, c.id)}
                className="flex-1 overflow-y-auto px-2 pt-1 pb-2 space-y-2 max-h-[calc(100dvh-230px)] md:max-h-[calc(100vh-300px)] min-h-[120px]"
              >
                {tarefasQ.isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="animate-spin text-rose-400" size={22} /></div>
                ) : lista.length === 0 ? (
                  <div className={`h-24 rounded-xl border-2 border-dashed flex items-center justify-center text-xs text-slate-400 ${indicadorFim ? 'border-rose-400 bg-rose-50' : 'border-slate-300'}`}>
                    {toque ? 'Nenhuma atividade' : 'Arraste tarefas para cá'}
                  </div>
                ) : (
                  lista.map((t, i) => (
                    <div key={t.id}>
                      {arrastando && alvo?.coluna === c.id && alvo.antesDe === t.id && <div className="h-1 rounded-full bg-rose-500 mb-2" aria-hidden />}
                      <TaskCard
                        tarefa={t}
                        nomePessoa={nomePessoa}
                        colunas={colunas}
                        hoje={p.hoje}
                        toque={toque}
                        arrastando={arrastando === t.id}
                        podeSubir={i > 0}
                        podeDescer={i < lista.length - 1}
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); setArrastando(t.id); }}
                        onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                        onDragOver={(e) => aoArrastarSobreCartao(e, t)}
                        onEditar={() => setEditando(t.id)}
                        onExcluir={() => setExcluindo(t)}
                        onMover={(col) => mover(t.id, col, null)}
                        onSubir={() => mover(t.id, c.id, lista[i - 1].id)}
                        onDescer={() => mover(t.id, c.id, lista[i + 2]?.id ?? null)}
                        onSalvarObservacao={(txt) => salvarObservacao(t, txt)}
                        onAlternarItem={(it) => alternarItem(t, it)}
                        onRemoverItem={(it) => removerItem(t, it)}
                        onAdicionarItem={(titulo) => adicionarItem(t, titulo)}
                      />
                    </div>
                  ))
                )}
                {indicadorFim && lista.length > 0 && <div className="h-1 rounded-full bg-rose-500" aria-hidden />}
              </div>
              <button type="button" onClick={() => setColunaNova(c.id)} className="m-2 mt-0 py-2 rounded-xl text-sm font-bold text-slate-500 hover:text-rose-600 hover:bg-white flex items-center justify-center gap-1">
                <Plus size={16} /> Nova atividade
              </button>
            </section>
          );
        })}
      </div>

      {mostrarNova && (
        <NovaTarefaModal
          quadros={p.quadros} colunas={p.colunas} pessoas={p.pessoas} clientes={p.clientes} eu={p.eu} hoje={p.hoje}
          quadroInicial={p.quadro.id} colunaInicial={colunaNova}
          onClose={fecharNova} onSalvar={criarTarefa}
        />
      )}
      {tarefaEditando && (
        <EditarTarefaModal
          key={tarefaEditando.id}
          tarefa={tarefaEditando} colunas={colunas} pessoas={p.pessoas} clientes={p.clientes} hoje={p.hoje}
          onClose={() => setEditando(null)}
          onSalvar={(campos) => salvarTarefa(tarefaEditando.id, campos)}
          onExcluir={() => setExcluindo(tarefaEditando)}
          onAlternarItem={(it) => alternarItem(tarefaEditando, it)}
          onRemoverItem={(it) => removerItem(tarefaEditando, it)}
          onAdicionarItem={(titulo) => adicionarItem(tarefaEditando, titulo)}
        />
      )}
      {excluindo && (
        <Confirmar titulo="Excluir tarefa" texto={`"${excluindo.titulo}" e os sub-itens dela serão apagados. Esta ação não pode ser desfeita.`}
          botao="Excluir" ocupado={ocupado} onConfirmar={confirmarExclusao} onCancelar={() => setExcluindo(null)} />
      )}
      {excluirQuadro && (
        <Confirmar titulo="Excluir quadro" texto={`O quadro "${p.quadro.nome}", as colunas e todos os cartões dele serão apagados. Esta ação não pode ser desfeita.`}
          botao="Excluir quadro" ocupado={ocupado} onConfirmar={confirmarExclusaoQuadro} onCancelar={() => setExcluirQuadro(false)} />
      )}
      {equipe && (
        <EquipeModal pessoas={p.pessoas} onClose={() => setEquipe(false)}
          onSalvar={async (pessoa) => {
            try { await api.salvarPessoa(pessoa); } catch (e) { throw new ErroPublico(mensagemErro(e)); }
            qc.invalidateQueries({ queryKey: kanbanKeys.pessoas });
          }}
        />
      )}
    </div>
  );
}
