import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Loader2, MessageCircle, Package, Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { Aviso, Campo, Modal, inputCls } from '../components/ui';
import { brl, dataBR, dataLocal, isoParaBR, lerValor, pct, valorParaCampo } from '../lib/formatos';
import { catalogoKeys, listarServicos } from '../features/catalogo/api';
import { lerRegras, comissoesKeys } from '../features/comissoes/api';
import { equipeKeys, listarAtivos } from '../features/equipe/api';
import { anularPacote, lerPacote, listarSaldos, pacotesKeys, renovarPacote, venderPacote } from '../features/pacotes/api';
import {
  COR_SITUACAO, DIAS_ALERTA, ROTULO_FORMA_VENDA, ROTULO_SITUACAO, VALIDADE_PADRAO_MESES, agruparSaldos, linkWhatsApp,
  mensagemExtrato, ratearPacote, situacaoPacote, somarMeses, taxaMedia, type FormaVenda, type PacoteAgrupado, type Situacao,
} from '../features/pacotes/logic';

type Cliente = { id: string; name: string; phone: string | null };
type Filtro = 'ativos' | 'a_vencer' | 'vencido' | 'esgotado' | 'anulado' | 'todos';
const FILTROS: [Filtro, string][] = [
  ['ativos', 'Ativos'], ['a_vencer', `Vencem em ${DIAS_ALERTA} dias`], ['vencido', 'Vencidos'], ['esgotado', 'Concluídos'], ['anulado', 'Anulados'], ['todos', 'Todos'],
];

const useClientes = () => useQuery({
  queryKey: ['clients-list-pacotes'],
  queryFn: async () => {
    const { data, error } = await supabase.from('clientes_visiveis').select('id, name, phone').order('name');
    if (error) throw error;
    return (data ?? []) as Cliente[];
  },
});

function Selo({ s }: { s: Situacao }) {
  return <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${COR_SITUACAO[s]}`}>{ROTULO_SITUACAO[s]}</span>;
}

export default function Pacotes() {
  const hoje = dataLocal();
  const [filtro, setFiltro] = useState<Filtro>('ativos');
  const [busca, setBusca] = useState('');
  const [vender, setVender] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { data: linhas = [], isLoading } = useQuery({ queryKey: pacotesKeys.saldos(null, true), queryFn: () => listarSaldos(null, true) });
  const { data: clientes = [] } = useClientes();
  const nomeCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c.name])), [clientes]);

  const pacotes = useMemo(() => agruparSaldos(linhas).map((p) => ({ ...p, situacao: situacaoPacote(p, hoje) })), [linhas, hoje]);
  const vigentes = pacotes.filter((p) => p.situacao === 'ativo' || p.situacao === 'a_vencer');
  const indicadores = {
    ativos: vigentes.length,
    sessoes: vigentes.reduce((s, p) => s + p.restantes, 0),
    valor: vigentes.reduce((s, p) => s + p.valorRestante, 0),
    vencendo: pacotes.filter((p) => p.situacao === 'a_vencer').length,
  };
  const termo = busca.trim().toLowerCase();
  const lista = pacotes
    .filter((p) => filtro === 'todos' || (filtro === 'ativos' ? p.situacao === 'ativo' || p.situacao === 'a_vencer' : p.situacao === filtro))
    .filter((p) => !termo || (nomeCliente.get(p.cliente_id) ?? '').toLowerCase().includes(termo) || p.nome.toLowerCase().includes(termo));
  const detalhe = pacotes.find((p) => p.pacote_id === aberto) ?? null;

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2"><Package className="text-rose-600" /> Pacotes</h2>
          <p className="text-sm text-slate-500 mt-1">Venda de pacotes de sessões, saldo por cliente, validade e extrato. A comissão é paga a quem executa cada sessão.</p>
        </div>
        <button type="button" onClick={() => setVender(true)} className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm">
          <Plus size={18} /> Vender pacote
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Pacotes ativos', String(indicadores.ativos)],
          ['Sessões a executar', String(indicadores.sessoes)],
          ['Valor a executar', brl(indicadores.valor)],
          [`Vencem em ${DIAS_ALERTA} dias`, String(indicadores.vencendo)],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-[11px] font-bold text-slate-400 uppercase">{rotulo}</p>
            <p className="text-xl md:text-2xl font-black text-slate-800 mt-1">{valor}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 -mt-2">"Valor a executar" é o que já foi recebido e ainda é serviço devido às clientes.</p>

      <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div className="flex overflow-x-auto gap-1" role="tablist" aria-label="Situação">
          {FILTROS.map(([id, rotulo]) => (
            <button key={id} type="button" role="tab" aria-selected={filtro === id} onClick={() => setFiltro(id)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold ${filtro === id ? 'bg-rose-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{rotulo}</button>
          ))}
        </div>
        <label className="relative md:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou pacote" aria-label="Buscar cliente ou pacote" className={`${inputCls} pl-9`} />
        </label>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-rose-500"><Loader2 className="animate-spin" /></div>
      ) : lista.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-12 bg-white rounded-2xl border border-slate-100">Nenhum pacote nesta situação.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => (
            <button key={p.pacote_id} type="button" onClick={() => setAberto(p.pacote_id)}
              className="text-left bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:border-rose-300 hover:shadow transition-all space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{nomeCliente.get(p.cliente_id) ?? 'Cliente'}</p>
                  <p className="text-xs text-slate-500 truncate">{p.nome}</p>
                </div>
                <Selo s={p.situacao} />
              </div>
              <ul className="text-xs text-slate-600 space-y-0.5">
                {p.itens.map((i) => <li key={i.item_id}>{i.servico_nome}: <strong>{i.sessoes - i.usadas - i.faltas}</strong> de {i.sessoes} restantes{i.reservadas ? ` (${i.reservadas} agendada${i.reservadas > 1 ? 's' : ''})` : ''}</li>)}
              </ul>
              <div className="flex justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                <span>Validade {isoParaBR(p.validade)}</span>
                <span className="font-bold text-slate-700">{brl(p.valorRestante)} a executar</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {vender && <VenderPacote onClose={() => setVender(false)} onVendido={(id) => { setVender(false); setAberto(id); setAviso('Pacote vendido. O valor entra no faturamento de hoje e as sessões ficam disponíveis na agenda.'); }} />}
      {detalhe && <DetalhePacote pacote={detalhe} cliente={clientes.find((c) => c.id === detalhe.cliente_id) ?? null} onClose={() => setAberto(null)} onAviso={setAviso} />}
      <Aviso texto={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}

// ---------------------------------------------------------------- venda

type LinhaItem = { servicoId: string; sessoes: string; comissao: string };
type LinhaPagamento = { forma: FormaVenda; parcelas: string; valor: string };

function VenderPacote({ onClose, onVendido }: { onClose: () => void; onVendido: (id: string) => void }) {
  const queryClient = useQueryClient();
  const hoje = dataLocal();
  const { data: clientes = [] } = useClientes();
  const { data: servicos = [] } = useQuery({ queryKey: catalogoKeys.servicos, queryFn: listarServicos });
  const { data: regras } = useQuery({ queryKey: [...comissoesKeys.base, 'regras'], queryFn: lerRegras });
  const ativos = servicos.filter((s) => s.ativo);

  const [buscaCliente, setBuscaCliente] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [nome, setNome] = useState('');
  const [itens, setItens] = useState<LinhaItem[]>([{ servicoId: '', sessoes: '10', comissao: '' }]);
  const [total, setTotal] = useState('');
  const [validade, setValidade] = useState(somarMeses(hoje, VALIDADE_PADRAO_MESES));
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>([{ forma: 'pix', parcelas: '1', valor: '' }]);
  const [obs, setObs] = useState('');
  const [ciente, setCiente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const servico = (id: string) => ativos.find((s) => s.id === id);
  const itensValidos = itens.filter((i) => i.servicoId && Number(i.sessoes) >= 1);
  const tabela = itensValidos.reduce((s, i) => s + Number(servico(i.servicoId)?.preco_base ?? 0) * Number(i.sessoes), 0);
  const totalNum = total.trim() ? lerValor(total) : tabela;
  const rateio = totalNum !== null ? ratearPacote(totalNum, itensValidos.map((i) => ({ precoBase: Number(servico(i.servicoId)?.preco_base ?? 0), sessoes: Number(i.sessoes) }))) : [];
  const pagos = pagamentos.map((p) => ({ forma: p.forma, parcelas: Number(p.parcelas) || 1, valor: lerValor(p.valor) ?? 0 }));
  const somaPagos = Math.round(pagos.reduce((s, p) => s + p.valor, 0) * 100) / 100;
  const falta = totalNum !== null ? Math.round((totalNum - somaPagos) * 100) / 100 : 0;
  const filtrados = buscaCliente.trim() ? clientes.filter((c) => c.name.toLowerCase().includes(buscaCliente.trim().toLowerCase())).slice(0, 8) : [];
  const cliente = clientes.find((c) => c.id === clienteId);

  const mudarItem = (k: number, campo: keyof LinhaItem, valor: string) => setItens((l) => l.map((x, i) => {
    if (i !== k) return x;
    const novo = { ...x, [campo]: valor };
    if (campo === 'servicoId' && !x.comissao) novo.comissao = String(servico(valor)?.comissao_base_percentual ?? '');
    return novo;
  }));
  const mudarPagamento = (k: number, campo: keyof LinhaPagamento, valor: string) =>
    setPagamentos((l) => l.map((x, i) => (i === k ? { ...x, [campo]: valor, ...(campo === 'forma' && valor !== 'credito' ? { parcelas: '1' } : {}) } : x)));

  const salvar = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw Object.assign(new Error('CLIENTE'), { publico: 'Selecione a cliente.' });
      if (!itensValidos.length) throw Object.assign(new Error('ITENS'), { publico: 'Inclua ao menos um serviço.' });
      if (totalNum === null) throw Object.assign(new Error('TOTAL'), { publico: 'Valor do pacote inválido.' });
      if (falta !== 0) throw Object.assign(new Error('PAG'), { publico: 'A soma dos pagamentos precisa ser igual ao valor do pacote.' });
      if (!ciente) throw Object.assign(new Error('CIENTE'), { publico: 'Confirme que a cliente foi informada da validade e das regras.' });
      return venderPacote({
        clienteId, nome: nome.trim() || itensValidos.map((i) => `${i.sessoes}x ${servico(i.servicoId)?.nome}`).join(' + '),
        validade, valorTotal: totalNum, observacao: obs.trim(),
        itens: itensValidos.map((i) => ({ servico_id: i.servicoId, sessoes: Number(i.sessoes), comissao_percentual: lerValor(i.comissao || '0') ?? -1 })),
        pagamentos: pagos.filter((p) => p.valor > 0),
      });
    },
    onSuccess: (id) => { queryClient.invalidateQueries({ queryKey: pacotesKeys.base }); onVendido(id); },
    onError: (e: unknown) => setErro((e as { publico?: string }).publico ?? mensagemDeErro(e, 'Não foi possível vender o pacote.', 'pacotes.vender')),
  });

  return (
    <Modal titulo="Vender pacote" onClose={onClose} largura="md:max-w-[760px]"
      rodape={<div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <span className={`text-xs font-bold ${falta === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{!itensValidos.length ? '' : falta === 0 ? 'Pagamentos conferem com o valor do pacote.' : falta > 0 ? `Faltam ${brl(falta)} nos pagamentos.` : `Pagamentos passam ${brl(-falta)} do valor.`}</span>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 text-sm hover:bg-slate-100">Cancelar</button>
          <button type="button" disabled={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm disabled:opacity-60">{salvar.isPending ? 'Salvando...' : 'Confirmar venda'}</button>
        </div>
      </div>}>
      <div className="space-y-5">
        <Campo rotulo="Cliente (titular)" obrigatorio composto>
          {cliente ? (
            <div className="flex items-center justify-between border border-rose-200 bg-rose-50/50 rounded-lg px-3 py-2">
              <span className="font-bold text-slate-800 text-sm">{cliente.name}</span>
              <button type="button" onClick={() => { setClienteId(''); setBuscaCliente(''); }} className="text-xs text-rose-600 font-bold">Trocar</button>
            </div>
          ) : (
            <div className="relative">
              <input value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} placeholder="Digite o nome da cliente" aria-label="Buscar cliente" className={inputCls} autoFocus />
              {filtrados.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                  {filtrados.map((c) => <li key={c.id}><button type="button" onClick={() => setClienteId(c.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-rose-50">{c.name}</button></li>)}
                </ul>
              )}
            </div>
          )}
        </Campo>

        <div className="space-y-2">
          <span className="block text-xs font-bold text-slate-500">Serviços do pacote *</span>
          {itens.map((it, k) => {
            const r = rateio[itensValidos.indexOf(it)];
            return (
              <div key={k} className="grid grid-cols-12 gap-2 items-end bg-slate-50 rounded-xl p-2">
                <label className="col-span-12 md:col-span-6"><span className="sr-only">Serviço</span>
                  <select value={it.servicoId} onChange={(e) => mudarItem(k, 'servicoId', e.target.value)} className={inputCls} aria-label={`Serviço ${k + 1}`}>
                    <option value="">Selecione o serviço</option>
                    {ativos.map((s) => <option key={s.id} value={s.id} disabled={itens.some((x, j) => j !== k && x.servicoId === s.id)}>{s.nome} ({brl(s.preco_base)})</option>)}
                  </select>
                </label>
                <label className="col-span-4 md:col-span-2"><span className="block text-[10px] font-bold text-slate-400">Sessões</span>
                  <input type="number" min={1} max={100} value={it.sessoes} onChange={(e) => mudarItem(k, 'sessoes', e.target.value)} className={inputCls} /></label>
                <label className="col-span-5 md:col-span-3"><span className="block text-[10px] font-bold text-slate-400">Comissão de quem executa (%)</span>
                  <input inputMode="decimal" value={it.comissao} onChange={(e) => mudarItem(k, 'comissao', e.target.value)} placeholder="0" className={inputCls} /></label>
                <div className="col-span-3 md:col-span-1 flex justify-end">
                  <button type="button" onClick={() => setItens((l) => l.filter((_, j) => j !== k))} disabled={itens.length === 1} className="p-2 text-slate-400 hover:text-red-600 disabled:opacity-30" aria-label="Remover serviço"><Trash2 size={16} /></button>
                </div>
                {r && <p className="col-span-12 text-[11px] text-slate-500 px-1">Valor por sessão: <strong>{brl(r.valorSessao)}</strong>{r.valorUltima !== r.valorSessao ? ` (última ${brl(r.valorUltima)})` : ''}. Comissão por sessão: {brl((r.valorSessao * (lerValor(it.comissao || '0') ?? 0)) / 100)} antes de taxas e materiais.</p>}
              </div>
            );
          })}
          <button type="button" onClick={() => setItens((l) => [...l, { servicoId: '', sessoes: '5', comissao: '' }])} className="text-xs font-bold text-rose-600 inline-flex items-center gap-1"><Plus size={14} /> Adicionar serviço</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Campo rotulo="Nome do pacote" dica="Em branco: gerado pelos serviços.">
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Corpo verão" className={inputCls} />
          </Campo>
          <Campo rotulo="Valor do pacote (R$)" obrigatorio dica={tabela > 0 ? `Tabela: ${brl(tabela)}${totalNum !== null && totalNum < tabela ? `; economia de ${brl(tabela - totalNum)} (${pct(((tabela - totalNum) / tabela) * 100)})` : ''}` : undefined}>
            <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder={valorParaCampo(tabela)} className={inputCls} />
          </Campo>
          <Campo rotulo="Validade" obrigatorio dica={`Padrão: ${VALIDADE_PADRAO_MESES} meses. Pode ser renovada depois.`}>
            <input type="date" value={validade} min={hoje} onChange={(e) => setValidade(e.target.value)} className={inputCls} />
          </Campo>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-bold text-slate-500">Pagamento *</span>
          {pagamentos.map((p, k) => (
            <div key={k} className="grid grid-cols-12 gap-2 items-end">
              <label className="col-span-5 md:col-span-5"><span className="sr-only">Forma</span>
                <select value={p.forma} onChange={(e) => mudarPagamento(k, 'forma', e.target.value)} className={inputCls} aria-label={`Forma de pagamento ${k + 1}`}>
                  {(Object.keys(ROTULO_FORMA_VENDA) as FormaVenda[]).map((f) => <option key={f} value={f}>{ROTULO_FORMA_VENDA[f]}</option>)}
                </select></label>
              <label className="col-span-3 md:col-span-2"><span className="block text-[10px] font-bold text-slate-400">Parcelas</span>
                <input type="number" min={1} max={24} value={p.parcelas} disabled={p.forma !== 'credito'} onChange={(e) => mudarPagamento(k, 'parcelas', e.target.value)} className={inputCls} /></label>
              <label className="col-span-3 md:col-span-4"><span className="block text-[10px] font-bold text-slate-400">Valor (R$)</span>
                <input inputMode="decimal" value={p.valor} onChange={(e) => mudarPagamento(k, 'valor', e.target.value)}
                  onFocus={() => { if (!p.valor && falta > 0) mudarPagamento(k, 'valor', valorParaCampo(falta)); }} className={inputCls} /></label>
              <div className="col-span-1 flex justify-end">
                <button type="button" onClick={() => setPagamentos((l) => l.filter((_, j) => j !== k))} disabled={pagamentos.length === 1} className="p-2 text-slate-400 hover:text-red-600 disabled:opacity-30" aria-label="Remover pagamento"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap justify-between gap-2 text-xs">
            <button type="button" onClick={() => setPagamentos((l) => [...l, { forma: 'pix', parcelas: '1', valor: falta > 0 ? valorParaCampo(falta) : '' }])} className="font-bold text-rose-600 inline-flex items-center gap-1"><Plus size={14} /> Dividir em outra forma</button>
            {regras && <span className="text-slate-500">Taxa média da maquininha: {pct(taxaMedia(pagos, regras.taxas))} (descontada da comissão sessão a sessão, conforme as configurações).</span>}
          </div>
        </div>

        <Campo rotulo="Observação"><input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} className={inputCls} placeholder="Ex.: pacote promocional de outubro" /></Campo>

        <label className="flex items-start gap-2 text-sm text-slate-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
          <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} className="mt-0.5 w-4 h-4 accent-rose-600" />
          <span>Informei à cliente a validade ({isoParaBR(validade)}), que ela pode pedir renovação, que falta sem aviso desconta a sessão e que o pacote não tem reembolso.</span>
        </label>
        {erro && <p role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{erro}</p>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- detalhe

const ROTULO_MOV = { uso: 'Sessão realizada', falta: 'Falta (sessão descontada)', renovacao: 'Validade renovada' } as const;

function DetalhePacote({ pacote, cliente, onClose, onAviso }: { pacote: PacoteAgrupado & { situacao: Situacao }; cliente: Cliente | null; onClose: () => void; onAviso: (t: string) => void }) {
  const queryClient = useQueryClient();
  const hoje = dataLocal();
  const { data, isLoading } = useQuery({ queryKey: pacotesKeys.detalhe(pacote.pacote_id), queryFn: () => lerPacote(pacote.pacote_id) });
  const { data: equipe = [] } = useQuery({ queryKey: equipeKeys.ativos, queryFn: listarAtivos });
  const [acao, setAcao] = useState<'renovar' | 'anular' | null>(null);
  const [novaValidade, setNovaValidade] = useState(somarMeses(pacote.validade < hoje ? hoje : pacote.validade, VALIDADE_PADRAO_MESES));
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const nomeProf = (id: string | null | undefined) => (id ? equipe.find((p) => p.id === id)?.name ?? 'Profissional' : '-');
  const servicoDoItem = (id: string | null) => pacote.itens.find((i) => i.item_id === id)?.servico_nome ?? '';
  const link = cliente ? linkWhatsApp(cliente.phone, mensagemExtrato(cliente.name, pacote)) : null;
  const semUso = pacote.consumidas === 0 && pacote.reservadas === 0;

  const executar = useMutation({
    mutationFn: async () => {
      if (acao === 'renovar') await renovarPacote(pacote.pacote_id, novaValidade, motivo.trim());
      if (acao === 'anular') await anularPacote(pacote.pacote_id, motivo.trim());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pacotesKeys.base });
      onAviso(acao === 'renovar' ? `Validade renovada até ${isoParaBR(novaValidade)}.` : 'Venda anulada.');
      setAcao(null); setMotivo('');
      if (acao === 'anular') onClose();
    },
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível concluir.', `pacotes.${acao}`)),
  });

  return (
    <Modal titulo={pacote.nome} onClose={onClose} largura="md:max-w-[820px]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <p className="font-bold text-slate-800">{cliente?.name ?? 'Cliente'}</p>
            <p className="text-xs text-slate-500">Vendido em {dataBR(pacote.vendido_em)} · validade {isoParaBR(pacote.validade)}{data ? ` · ${brl(data.pacote.valor_total)}` : ''}</p>
          </div>
          <Selo s={pacote.situacao} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 font-bold">
              <tr><th className="text-left px-3 py-2">Serviço</th><th className="px-2 py-2">Sessões</th><th className="px-2 py-2">Realizadas</th><th className="px-2 py-2">Faltas</th><th className="px-2 py-2">Agendadas</th><th className="px-2 py-2">Disponíveis</th><th className="text-right px-3 py-2">Valor sessão</th><th className="text-right px-3 py-2">Comissão</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-center">
              {pacote.itens.map((i) => (
                <tr key={i.item_id}>
                  <td className="text-left px-3 py-2 font-semibold text-slate-700">{i.servico_nome}</td>
                  <td>{i.sessoes}</td><td>{i.usadas}</td><td>{i.faltas}</td><td>{i.reservadas}</td>
                  <td className="font-bold text-slate-800">{i.disponiveis}</td>
                  <td className="text-right px-3">{brl(i.valor_sessao)}</td><td className="text-right px-3">{pct(i.comissao_percentual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isLoading || !data ? <div className="flex justify-center py-6 text-rose-500"><Loader2 className="animate-spin" /></div> : (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Pagamento</h4>
              <ul className="text-sm space-y-1">
                {data.pagamentos.map((p) => <li key={p.id} className="flex justify-between"><span>{ROTULO_FORMA_VENDA[p.forma]}{p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}</span><span className="font-semibold">{brl(p.valor)}</span></li>)}
                {!data.pagamentos.length && <li className="text-slate-400">Cortesia (sem pagamento).</li>}
              </ul>
              {data.pacote.observacao && <p className="text-xs text-slate-500 mt-2">{data.pacote.observacao}</p>}
              {data.pacote.status === 'anulado' && <p className="text-xs text-slate-500 mt-2">Anulado em {dataBR(data.pacote.anulado_em!)}: {data.pacote.anulacao_motivo}</p>}
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Extrato</h4>
              {data.movimentos.length === 0 ? <p className="text-sm text-slate-400">Nenhuma sessão usada ainda.</p> : (
                <ul className="text-sm divide-y divide-slate-100 max-h-60 overflow-auto">
                  {data.movimentos.map((m) => (
                    <li key={m.id} className="py-1.5">
                      <div className="flex justify-between gap-2"><span className="font-semibold text-slate-700">{ROTULO_MOV[m.tipo]}</span>{m.tipo !== 'renovacao' && <span>{brl(m.valor)}</span>}</div>
                      <p className="text-xs text-slate-500">
                        {m.tipo === 'renovacao' ? `${dataBR(m.created_at)} · ${m.detalhe ?? ''}` : `${dataBR(m.appointments?.start_time ?? m.created_at)} · ${servicoDoItem(m.item_id)} · ${nomeProf(m.appointments?.professional_id)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {pacote.status === 'ativo' && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            {link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"><MessageCircle size={14} /> Enviar saldo por WhatsApp</a>}
            <button type="button" onClick={() => { setAcao('renovar'); setErro(null); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50"><CalendarClock size={14} /> Renovar validade</button>
            {semUso && <button type="button" onClick={() => { setAcao('anular'); setErro(null); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50"><Trash2 size={14} /> Anular venda lançada por engano</button>}
          </div>
        )}

        {acao && (
          <div className="bg-slate-50 rounded-xl p-3 space-y-3">
            {acao === 'renovar' && <Campo rotulo="Nova validade" obrigatorio><input type="date" value={novaValidade} min={hoje} onChange={(e) => setNovaValidade(e.target.value)} className={inputCls} /></Campo>}
            {acao === 'anular' && <p className="text-xs text-slate-600">Anular só corrige lançamento errado: o valor sai do faturamento. Não há reembolso pelo sistema.</p>}
            <Campo rotulo="Motivo" obrigatorio><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} className={inputCls} placeholder={acao === 'renovar' ? 'Ex.: cliente operada, retomando o tratamento' : 'Ex.: pacote lançado na cliente errada'} /></Campo>
            {erro && <p role="alert" className="text-sm text-rose-600">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAcao(null)} className="px-3 py-2 rounded-lg text-slate-600 text-xs hover:bg-slate-100">Cancelar</button>
              <button type="button" disabled={executar.isPending} onClick={() => executar.mutate()} className={`px-3 py-2 rounded-lg text-white text-xs font-bold disabled:opacity-60 ${acao === 'anular' ? 'bg-red-600' : 'bg-rose-600'}`}>{acao === 'renovar' ? 'Renovar' : 'Anular venda'}</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
