import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Edit2, Loader2, Plus, Scissors, Trash2, Users } from 'lucide-react';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { Aviso, Campo, Confirmar, Modal, inputCls } from '../components/ui';
import {
  catalogoKeys, excluirCategoria, excluirServico, habilitarServicos, listarCategorias, listarServicos, listarVinculos,
  salvarCategoria, salvarComissaoPadrao, salvarServico, salvarVinculo, type Categoria, type Servico, type Vinculo,
} from '../features/catalogo/api';
import { condicoesEfetivas, divisao, duracaoTexto, estadoCategoria } from '../features/catalogo/logic';
import { equipeKeys, listarEquipe } from '../features/equipe/api';
import { brl, lerValor, pct, valorParaCampo } from '../lib/formatos';

type Aba = 'catalogo' | 'profissionais';

export default function Servicos() {
  const [aba, setAba] = useState<Aba>('catalogo');
  const [aviso, setAviso] = useState<string | null>(null);
  const { data: categorias = [], isLoading: c1 } = useQuery({ queryKey: catalogoKeys.categorias, queryFn: listarCategorias });
  const { data: servicos = [], isLoading: c2 } = useQuery({ queryKey: catalogoKeys.servicos, queryFn: listarServicos });

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-12">
      <div>
        <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2"><Scissors className="text-rose-600" /> Serviços</h2>
        <p className="text-sm text-slate-500 mt-1">Catálogo base do salão e o que cada profissional oferece, com preço, tempo e comissão próprios.</p>
      </div>
      <div className="flex border-b border-slate-200" role="tablist">
        {([['catalogo', 'Catálogo', Scissors], ['profissionais', 'Serviços por profissional', Users]] as const).map(([id, rotulo, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 -mb-px ${aba === id ? 'border-rose-600 text-rose-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon size={16} /> {rotulo}
          </button>
        ))}
      </div>
      {c1 || c2 ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-rose-500" size={32} /></div>
      ) : aba === 'catalogo' ? (
        <AbaCatalogo categorias={categorias} servicos={servicos} onAviso={setAviso} />
      ) : (
        <AbaProfissionais categorias={categorias} servicos={servicos} onAviso={setAviso} />
      )}
      <Aviso texto={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}

// ============================================================================ catálogo
function AbaCatalogo({ categorias, servicos, onAviso }: { categorias: Categoria[]; servicos: Servico[]; onAviso: (t: string) => void }) {
  const queryClient = useQueryClient();
  const [catEdicao, setCatEdicao] = useState<Partial<Categoria> | null>(null);
  const [servEdicao, setServEdicao] = useState<Partial<Servico> | null>(null);
  const [excluir, setExcluir] = useState<{ tipo: 'categoria' | 'servico'; id: string; nome: string } | null>(null);
  const [fechadas, setFechadas] = useState<string[]>([]);
  const atualizar = () => {
    queryClient.invalidateQueries({ queryKey: catalogoKeys.categorias });
    queryClient.invalidateQueries({ queryKey: catalogoKeys.servicos });
  };

  const remover = useMutation({
    mutationFn: async (x: { tipo: 'categoria' | 'servico'; id: string }) => (x.tipo === 'categoria' ? excluirCategoria(x.id) : excluirServico(x.id)),
    onSuccess: () => { atualizar(); setExcluir(null); onAviso('Excluído.'); },
    onError: (e) => {
      setExcluir(null);
      const fk = (e as { code?: string })?.code === '23503';
      onAviso(fk ? 'Não dá para excluir: há serviços ou atendimentos ligados. Desative em vez de excluir.' : mensagemDeErro(e, 'Não foi possível excluir.', 'catalogo.excluir'));
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" onClick={() => setCatEdicao({ nome: '', cor: '#e11d48', ordem: categorias.length + 1, ativo: true })}
          className="flex items-center gap-2 border border-slate-200 bg-white px-4 py-2 rounded-xl font-bold text-sm text-slate-700 hover:bg-slate-50"><Plus size={16} /> Categoria</button>
        <button type="button" disabled={!categorias.length} onClick={() => setServEdicao({ categoria_id: categorias[0]?.id, nome: '', preco_base: 0, duracao_base_minutos: 60, custo_material: 0, ativo: true, comissao_base_percentual: null, descricao: '', retorno_dias: null })}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50"><Plus size={16} /> Serviço</button>
      </div>

      {categorias.map((c) => {
        const itens = servicos.filter((s) => s.categoria_id === c.id);
        const aberta = !fechadas.includes(c.id);
        return (
          <section key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.cor }} aria-hidden />
              <button type="button" onClick={() => setFechadas((f) => (aberta ? [...f, c.id] : f.filter((x) => x !== c.id)))} aria-expanded={aberta}
                className="flex-1 flex items-center gap-2 text-left">
                <h3 className={`font-bold ${c.ativo ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{c.nome}</h3>
                <span className="text-xs text-slate-400">{itens.length} serviço(s)</span>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${aberta ? 'rotate-180' : ''}`} />
              </button>
              <button type="button" onClick={() => setCatEdicao(c)} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg" aria-label={`Editar ${c.nome}`}><Edit2 size={16} /></button>
              <button type="button" onClick={() => setExcluir({ tipo: 'categoria', id: c.id, nome: c.nome })} className="p-2 text-slate-400 hover:text-red-600 rounded-lg" aria-label={`Excluir ${c.nome}`}><Trash2 size={16} /></button>
            </header>
            {aberta && (itens.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-400">Nenhum serviço nesta categoria.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-400 text-left">
                    <tr><th className="px-4 py-2">Serviço</th><th className="px-2 py-2">Duração</th><th className="px-2 py-2 text-right">Preço base</th><th className="px-2 py-2 text-right">Comissão base</th><th className="px-2 py-2 text-right">Material</th><th className="px-2 py-2" /></tr>
                  </thead>
                  <tbody>
                    {itens.map((s) => (
                      <tr key={s.id} className="border-t border-slate-100">
                        <td className="px-4 py-2.5">
                          <p className={`font-semibold ${s.ativo ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{s.nome}</p>
                          {s.descricao && <p className="text-xs text-slate-500 line-clamp-1">{s.descricao}</p>}
                        </td>
                        <td className="px-2 py-2.5 text-slate-600 whitespace-nowrap">{duracaoTexto(s.duracao_base_minutos)}</td>
                        <td className="px-2 py-2.5 text-right text-slate-800 font-semibold whitespace-nowrap">{brl(s.preco_base)}</td>
                        <td className="px-2 py-2.5 text-right text-slate-600">{s.comissao_base_percentual != null ? pct(s.comissao_base_percentual) : '-'}</td>
                        <td className="px-2 py-2.5 text-right text-slate-600 whitespace-nowrap">{brl(s.custo_material)}</td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          <button type="button" onClick={() => setServEdicao(s)} className="p-1.5 text-slate-400 hover:text-slate-700" aria-label={`Editar ${s.nome}`}><Edit2 size={15} /></button>
                          <button type="button" onClick={() => setExcluir({ tipo: 'servico', id: s.id, nome: s.nome })} className="p-1.5 text-slate-400 hover:text-red-600" aria-label={`Excluir ${s.nome}`}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        );
      })}

      {catEdicao && <CategoriaModal inicial={catEdicao} onClose={() => setCatEdicao(null)} onSalvo={() => { atualizar(); setCatEdicao(null); onAviso('Categoria salva.'); }} />}
      {servEdicao && <ServicoModal inicial={servEdicao} categorias={categorias} onClose={() => setServEdicao(null)} onSalvo={() => { atualizar(); setServEdicao(null); onAviso('Serviço salvo.'); }} />}
      {excluir && (
        <Confirmar titulo={`Excluir ${excluir.tipo === 'categoria' ? 'categoria' : 'serviço'}?`} botao="Excluir" ocupado={remover.isPending}
          texto={`"${excluir.nome}" será excluído. Se já houver atendimentos ou serviços ligados, prefira desativar.`}
          onCancelar={() => setExcluir(null)} onConfirmar={() => remover.mutate(excluir)} />
      )}
    </div>
  );
}

function CategoriaModal({ inicial, onClose, onSalvo }: { inicial: Partial<Categoria>; onClose: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(inicial.nome ?? '');
  const [cor, setCor] = useState(inicial.cor ?? '#e11d48');
  const [ativo, setAtivo] = useState(inicial.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () => salvarCategoria({ ...inicial, nome, cor, ativo }),
    onSuccess: onSalvo,
    onError: (e) => setErro((e as { code?: string })?.code === '23505' ? 'Já existe categoria com este nome.' : mensagemDeErro(e, 'Não foi possível salvar.', 'catalogo.categoria')),
  });
  return (
    <Modal titulo={inicial.id ? 'Editar categoria' : 'Nova categoria'} onClose={onClose} largura="md:max-w-[480px]"
      rodape={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 text-sm hover:bg-slate-100">Cancelar</button>
        <button type="button" disabled={salvar.isPending || !nome.trim()} onClick={() => salvar.mutate()} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm disabled:opacity-60">Salvar</button></div>}>
      <div className="space-y-4">
        <Campo rotulo="Nome" obrigatorio><input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} maxLength={60} autoFocus placeholder="Ex.: Cabelo, Estética, Manicure" /></Campo>
        <Campo rotulo="Cor na agenda"><input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-10 w-20 rounded-lg border border-slate-200" /></Campo>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="w-4 h-4 accent-rose-600" /> Categoria ativa</label>
        {erro && <p role="alert" className="text-sm text-rose-600">{erro}</p>}
      </div>
    </Modal>
  );
}

function ServicoModal({ inicial, categorias, onClose, onSalvo }: { inicial: Partial<Servico>; categorias: Categoria[]; onClose: () => void; onSalvo: () => void }) {
  const [s, setS] = useState({
    categoria_id: inicial.categoria_id ?? categorias[0]?.id ?? '', nome: inicial.nome ?? '', descricao: inicial.descricao ?? '',
    preco: valorParaCampo(inicial.preco_base ?? 0), duracao: String(inicial.duracao_base_minutos ?? 60),
    comissao: inicial.comissao_base_percentual != null ? valorParaCampo(inicial.comissao_base_percentual) : '',
    material: valorParaCampo(inicial.custo_material ?? 0), retorno: inicial.retorno_dias ? String(inicial.retorno_dias) : '', ativo: inicial.ativo ?? true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: (dados: Omit<Servico, 'id'> & { id?: string }) => salvarServico(dados),
    onSuccess: onSalvo,
    onError: (e) => setErro((e as { code?: string })?.code === '23505' ? 'Já existe serviço com este nome nesta categoria.' : mensagemDeErro(e, 'Não foi possível salvar.', 'catalogo.servico')),
  });
  const enviar = () => {
    const preco = lerValor(s.preco);
    const material = lerValor(s.material || '0');
    const comissao = s.comissao.trim() ? lerValor(s.comissao) : null;
    const duracao = Number(s.duracao);
    const retorno = s.retorno.trim() ? Number(s.retorno) : null;
    if (!s.nome.trim()) return setErro('Informe o nome do serviço.');
    if (preco === null) return setErro('Preço inválido.');
    if (material === null) return setErro('Custo de material inválido.');
    if (s.comissao.trim() && (comissao === null || comissao > 100)) return setErro('Comissão deve ser entre 0 e 100%.');
    if (!Number.isInteger(duracao) || duracao < 5 || duracao > 600) return setErro('Duração entre 5 e 600 minutos.');
    if (retorno !== null && (!Number.isInteger(retorno) || retorno < 1 || retorno > 365)) return setErro('Retorno entre 1 e 365 dias.');
    setErro(null);
    salvar.mutate({
      id: inicial.id, categoria_id: s.categoria_id, nome: s.nome, descricao: s.descricao || null, preco_base: preco,
      duracao_base_minutos: duracao, comissao_base_percentual: comissao, custo_material: material, retorno_dias: retorno, ativo: s.ativo,
    });
  };
  const set = (k: keyof typeof s, v: string | boolean) => setS((x) => ({ ...x, [k]: v }));
  return (
    <Modal titulo={inicial.id ? 'Editar serviço' : 'Novo serviço'} onClose={onClose}
      rodape={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 text-sm hover:bg-slate-100">Cancelar</button>
        <button type="button" disabled={salvar.isPending} onClick={enviar} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm disabled:opacity-60">Salvar</button></div>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Campo rotulo="Categoria" obrigatorio>
          <select value={s.categoria_id} onChange={(e) => set('categoria_id', e.target.value)} className={inputCls}>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Nome do serviço" obrigatorio><input value={s.nome} onChange={(e) => set('nome', e.target.value)} className={inputCls} maxLength={120} autoFocus /></Campo>
        <Campo rotulo="Preço base (R$)" obrigatorio><input inputMode="decimal" value={s.preco} onChange={(e) => set('preco', e.target.value)} className={inputCls} /></Campo>
        <Campo rotulo="Duração base (minutos)" obrigatorio><input inputMode="numeric" value={s.duracao} onChange={(e) => set('duracao', e.target.value.replace(/\D/g, ''))} className={inputCls} /></Campo>
        <Campo rotulo="Comissão base (%)" dica="Usada quando o profissional não tem comissão própria nem taxa fixa."><input inputMode="decimal" value={s.comissao} onChange={(e) => set('comissao', e.target.value)} className={inputCls} placeholder="Ex.: 40" /></Campo>
        <Campo rotulo="Custo de material (R$)" dica="Pode ser descontado antes da comissão (Configurações)."><input inputMode="decimal" value={s.material} onChange={(e) => set('material', e.target.value)} className={inputCls} /></Campo>
        <Campo rotulo="Retorno sugerido (dias)" dica="Usado no lembrete de retorno do checkout."><input inputMode="numeric" value={s.retorno} onChange={(e) => set('retorno', e.target.value.replace(/\D/g, ''))} className={inputCls} placeholder="Ex.: 30" /></Campo>
        <label className="flex items-center gap-2 text-sm text-slate-700 self-end pb-2"><input type="checkbox" checked={s.ativo} onChange={(e) => set('ativo', e.target.checked)} className="w-4 h-4 accent-rose-600" /> Serviço ativo</label>
        <div className="sm:col-span-2"><Campo rotulo="Descrição"><textarea value={s.descricao} onChange={(e) => set('descricao', e.target.value)} className={`${inputCls} min-h-[70px]`} maxLength={1000} /></Campo></div>
        {erro && <p role="alert" className="sm:col-span-2 text-sm text-rose-600">{erro}</p>}
      </div>
    </Modal>
  );
}

// ============================================================================ por profissional
function AbaProfissionais({ categorias, servicos, onAviso }: { categorias: Categoria[]; servicos: Servico[]; onAviso: (t: string) => void }) {
  const queryClient = useQueryClient();
  const { data: equipe = [] } = useQuery({ queryKey: equipeKeys.lista, queryFn: listarEquipe });
  const ativos = equipe.filter((m) => m.active);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { if (!userId && ativos.length) setUserId(ativos.find((m) => m.role === 'professional')?.id ?? ativos[0].id); }, [ativos, userId]);
  const membro = ativos.find((m) => m.id === userId);
  const { data: vinculos = [], isLoading } = useQuery({ queryKey: catalogoKeys.vinculos(userId ?? undefined), queryFn: () => listarVinculos(userId!), enabled: !!userId });
  const porServico = useMemo(() => new Map(vinculos.map((v) => [v.servico_id, v])), [vinculos]);
  const habilitados = useMemo(() => new Set(vinculos.filter((v) => v.ativo).map((v) => v.servico_id)), [vinculos]);
  const [taxaFixa, setTaxaFixa] = useState('');
  useEffect(() => { setTaxaFixa(valorParaCampo(membro?.perfil?.comissao_padrao_percentual)); }, [membro?.id, membro?.perfil?.comissao_padrao_percentual]);

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: catalogoKeys.vinculos(userId ?? undefined) });
    queryClient.invalidateQueries({ queryKey: equipeKeys.lista });
  };
  const lote = useMutation({
    mutationFn: ({ ids, ativo }: { ids: string[]; ativo: boolean }) => habilitarServicos(userId!, ids, ativo),
    onSuccess: (n, v) => { recarregar(); onAviso(`${n} serviço(s) ${v.ativo ? 'habilitado(s)' : 'desabilitado(s)'}.`); },
    onError: (e) => onAviso(mensagemDeErro(e, 'Não foi possível atualizar os serviços.', 'catalogo.lote')),
  });
  const salvarLinha = useMutation({
    mutationFn: (v: Vinculo) => salvarVinculo(v),
    onSuccess: () => { recarregar(); onAviso('Condições salvas.'); },
    onError: (e) => onAviso(mensagemDeErro(e, 'Não foi possível salvar.', 'catalogo.vinculo')),
  });
  const salvarTaxa = useMutation({
    mutationFn: (v: number | null) => salvarComissaoPadrao(userId!, v),
    onSuccess: () => { recarregar(); onAviso('Taxa fixa salva.'); },
    onError: (e) => onAviso(mensagemDeErro(e, 'Não foi possível salvar a taxa fixa.', 'catalogo.taxa')),
  });

  if (!ativos.length) return <p className="text-sm text-slate-500">Cadastre profissionais em Meu Estabelecimento &gt; Profissionais.</p>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Profissional">
        {ativos.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={m.id === userId} onClick={() => setUserId(m.id)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold border ${m.id === userId ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300'}`}>
            {m.name} <span className="font-medium opacity-80">({m.qtd_servicos})</span>
          </button>
        ))}
      </div>

      {membro && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-800">Divisão de lucros de {membro.name}</p>
            <p className="text-xs text-slate-500">Taxa fixa para todos os serviços sem comissão própria. Vazio = usa a comissão base de cada serviço.</p>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Taxa fixa</span>
            <input inputMode="decimal" value={taxaFixa} onChange={(e) => setTaxaFixa(e.target.value)} className="w-24 border border-slate-200 rounded-lg px-2 py-2 text-sm text-right" aria-label="Taxa fixa do profissional (%)" placeholder="-" />
            <span className="text-sm text-slate-500">%</span>
          </label>
          <button type="button" disabled={salvarTaxa.isPending} onClick={() => {
            const v = taxaFixa.trim() ? lerValor(taxaFixa) : null;
            if (taxaFixa.trim() && (v === null || v > 100)) return onAviso('Taxa fixa deve ser entre 0 e 100%.');
            salvarTaxa.mutate(v);
          }} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold disabled:opacity-60">Salvar taxa</button>
        </div>
      )}

      {isLoading ? <Loader2 className="animate-spin text-rose-500" /> : categorias.filter((c) => c.ativo).map((c) => {
        const itens = servicos.filter((s) => s.categoria_id === c.id && s.ativo);
        if (!itens.length) return null;
        const estado = estadoCategoria(itens, habilitados);
        return (
          <section key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
              <input type="checkbox" className="w-5 h-5 accent-rose-600" aria-label={`Habilitar toda a categoria ${c.nome}`}
                checked={estado === 'todos'} ref={(el) => { if (el) el.indeterminate = estado === 'parcial'; }}
                disabled={lote.isPending}
                onChange={() => lote.mutate({ ids: itens.map((s) => s.id), ativo: estado !== 'todos' })} />
              <span className="w-3 h-3 rounded-full" style={{ background: c.cor }} aria-hidden />
              <h3 className="font-bold text-slate-800 flex-1">{c.nome}</h3>
              <span className="text-xs text-slate-500">{itens.filter((s) => habilitados.has(s.id)).length}/{itens.length} habilitados</span>
            </header>
            <div className="divide-y divide-slate-100">
              {itens.map((s) => (
                <LinhaVinculo key={s.id} servico={s} vinculo={porServico.get(s.id)} userId={userId!} comissaoPerfil={membro?.perfil?.comissao_padrao_percentual ?? null}
                  ocupado={lote.isPending || salvarLinha.isPending}
                  onAlternar={(ativo) => lote.mutate({ ids: [s.id], ativo })}
                  onSalvar={(v) => salvarLinha.mutate(v)} onErro={onAviso} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LinhaVinculo({ servico, vinculo, userId, comissaoPerfil, ocupado, onAlternar, onSalvar, onErro }: {
  servico: Servico; vinculo: Vinculo | undefined; userId: string; comissaoPerfil: number | null; ocupado: boolean;
  onAlternar: (ativo: boolean) => void; onSalvar: (v: Vinculo) => void; onErro: (t: string) => void;
}) {
  const [valor, setValor] = useState(valorParaCampo(vinculo?.valor_personalizado));
  const [tempo, setTempo] = useState(vinculo?.tempo_execucao_minutos ? String(vinculo.tempo_execucao_minutos) : '');
  const [comissao, setComissao] = useState(valorParaCampo(vinculo?.comissao_percentual));
  useEffect(() => {
    setValor(valorParaCampo(vinculo?.valor_personalizado));
    setTempo(vinculo?.tempo_execucao_minutos ? String(vinculo.tempo_execucao_minutos) : '');
    setComissao(valorParaCampo(vinculo?.comissao_percentual));
  }, [vinculo]);
  const ef = condicoesEfetivas(servico, vinculo, comissaoPerfil);
  const mudou = valor !== valorParaCampo(vinculo?.valor_personalizado) || tempo !== (vinculo?.tempo_execucao_minutos ? String(vinculo.tempo_execucao_minutos) : '') || comissao !== valorParaCampo(vinculo?.comissao_percentual);

  const salvar = () => {
    const v = valor.trim() ? lerValor(valor) : null;
    const t = tempo.trim() ? Number(tempo) : null;
    const c = comissao.trim() ? lerValor(comissao) : null;
    if (valor.trim() && v === null) return onErro('Preço inválido.');
    if (t !== null && (t < 5 || t > 600)) return onErro('Tempo entre 5 e 600 minutos.');
    if (comissao.trim() && (c === null || c > 100)) return onErro('Comissão entre 0 e 100%.');
    onSalvar({ user_id: userId, servico_id: servico.id, valor_personalizado: v, tempo_execucao_minutos: t, comissao_percentual: c, ativo: vinculo?.ativo ?? true });
  };

  return (
    <div className={`px-4 py-3 grid gap-2 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.8fr))_auto] md:items-center ${ef.oferece ? '' : 'opacity-60'}`}>
      <label className="flex items-center gap-3 min-w-0">
        <input type="checkbox" className="w-5 h-5 accent-rose-600 shrink-0" checked={ef.oferece} disabled={ocupado} onChange={(e) => onAlternar(e.target.checked)} />
        <span className="min-w-0">
          <span className="block font-semibold text-slate-800 truncate">{servico.nome}</span>
          <span className="block text-[11px] text-slate-500">{brl(ef.valor)} · {duracaoTexto(ef.minutos)} · {divisao(ef.comissao)}</span>
        </span>
      </label>
      <label className="text-[11px] text-slate-500">Preço (R$)
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={valorParaCampo(servico.preco_base)} className="mt-0.5 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
      </label>
      <label className="text-[11px] text-slate-500">Tempo (min)
        <input inputMode="numeric" value={tempo} onChange={(e) => setTempo(e.target.value.replace(/\D/g, ''))} placeholder={String(servico.duracao_base_minutos)} className="mt-0.5 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
      </label>
      <label className="text-[11px] text-slate-500">Comissão (%)
        <input inputMode="decimal" value={comissao} onChange={(e) => setComissao(e.target.value)} placeholder={comissaoPerfil != null ? valorParaCampo(comissaoPerfil) : servico.comissao_base_percentual != null ? valorParaCampo(servico.comissao_base_percentual) : '0'} className="mt-0.5 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
      </label>
      <button type="button" onClick={salvar} disabled={!mudou || ocupado} className="px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold disabled:opacity-30 md:self-end">Salvar</button>
    </div>
  );
}
