import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { History, Loader2, UserRoundCheck, UserRoundX, Users, CalendarClock } from 'lucide-react';
import { brl, dataBR, dataLocal, formatarTelefone, isoParaBR } from '../lib/formatos';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { inputCls } from '../components/ui';
import { comissoesKeys, listarAtendimentos } from '../features/comissoes/api';
import { ROTULO_FORMA, type FormaPagamento, type StatusAgendamento } from '../features/comissoes/logic';
import { equipeKeys, listarAtivos } from '../features/equipe/api';
import { historicoKeys, listarCatalogoHistorico, listarClientesReativacao, listarTelefones } from '../features/historico/api';
import {
  clientesParaReativar, filtrarAtendimentos, FILTROS_ATENDIMENTOS_PADRAO, FILTROS_REATIVAR_PADRAO, indicadoresRetorno, periodoDoAtalho,
  ROTULO_SITUACAO_RETORNO, ROTULO_STATUS_ATENDIMENTO, SITUACOES_RETORNO, totaisAtendimentos,
  type Atalho, type FiltrosAtendimentos, type FiltrosReativar, type SituacaoRetorno,
} from '../features/historico/logic';

const COR_SITUACAO: Record<SituacaoRetorno, string> = {
  em_dia: 'bg-emerald-100 text-emerald-800',
  proximo: 'bg-amber-100 text-amber-800',
  vencido: 'bg-red-100 text-red-700',
  inativa: 'bg-slate-200 text-slate-700',
  perdida: 'bg-slate-800 text-white',
};

const ROTULO_ATALHO: Record<Atalho, string> = { hoje: 'Hoje', '7dias': '7 dias', mes: 'Mês', mes_anterior: 'Mês anterior', personalizado: 'Personalizado' };
const STATUS: StatusAgendamento[] = ['completed', 'cancelled', 'no_show', 'scheduled', 'confirmed'];
const FORMAS = Object.keys(ROTULO_FORMA) as FormaPagamento[];

/**
 * Histórico de atendimentos e clientes para reativar (fase 1 da reativação).
 * Só a administradora (rota e RLS de clients).
 */
export default function Historico() {
  const [aba, setAba] = useState<'reativar' | 'atendimentos'>('reativar');
  return (
    <div className="w-full space-y-4 md:space-y-6 pb-12">
      <div>
        <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2"><History className="text-rose-600" /> Histórico e Reativação</h2>
        <p className="text-sm text-slate-500 mt-1">Quem precisa voltar, pelo ciclo de retorno de cada serviço, e todos os atendimentos com filtros.</p>
      </div>
      <div className="flex gap-2" role="tablist">
        {([['reativar', 'Clientes para reativar'], ['atendimentos', 'Atendimentos']] as const).map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={`px-4 py-2 rounded-full text-sm font-semibold ${aba === id ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {rotulo}
          </button>
        ))}
      </div>
      {aba === 'reativar' ? <Reativar /> : <Atendimentos />}
    </div>
  );
}

function Indicador({ titulo, valor, icone }: { titulo: string; valor: string; icone: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">{icone}{titulo}</p>
      <p className="text-2xl font-black text-slate-800 mt-1 tabular-nums">{valor}</p>
    </div>
  );
}

function Reativar() {
  const hoje = dataLocal();
  const [f, setF] = useState<FiltrosReativar>(FILTROS_REATIVAR_PADRAO);
  const { data = [], isLoading, error } = useQuery({ queryKey: historicoKeys.reativacao, queryFn: listarClientesReativacao });
  const ind = useMemo(() => indicadoresRetorno(data, hoje), [data, hoje]);
  const lista = useMemo(() => clientesParaReativar(data, f, hoje), [data, f, hoje]);
  const alternar = (s: SituacaoRetorno) => setF({ ...f, situacoes: f.situacoes.includes(s) ? f.situacoes.filter((x) => x !== s) : [...f.situacoes, s] });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Indicador titulo="Ativas" valor={String(ind.ativas)} icone={<UserRoundCheck size={14} />} />
        <Indicador titulo="Retorno vencido" valor={String(ind.vencido)} icone={<CalendarClock size={14} />} />
        <Indicador titulo="Inativas (90+ dias)" valor={String(ind.inativas)} icone={<Users size={14} />} />
        <Indicador titulo="Perdidas (180+ dias)" valor={String(ind.perdidas)} icone={<UserRoundX size={14} />} />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2" aria-label="Situação de retorno">
          {SITUACOES_RETORNO.map((s) => (
            <button key={s} type="button" aria-pressed={f.situacoes.includes(s)} onClick={() => alternar(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${f.situacoes.includes(s) ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-600'}`}>
              {ROTULO_SITUACAO_RETORNO[s]}
            </button>
          ))}
        </div>
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <input type="search" placeholder="Buscar por nome ou telefone" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} className={`${inputCls} md:max-w-xs`} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.semAgendamentoFuturo} onChange={(e) => setF({ ...f, semAgendamentoFuturo: e.target.checked })} className="h-4 w-4 accent-rose-600" />
            Só sem agendamento futuro
          </label>
          <span className="text-xs text-slate-500 md:ml-auto">{lista.length} cliente(s)</span>
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Carregando...</p>}
      {error && <p className="text-sm text-red-600">{mensagemDeErro(error, 'Não foi possível carregar a lista.', 'clientes_reativacao')}</p>}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">Cliente</th><th className="p-3">Último serviço</th><th className="p-3">Retorno previsto</th>
              <th className="p-3">Frequência (12 meses)</th><th className="p-3">Valor (12 meses)</th><th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map((c) => (
              <tr key={c.cliente_id} className="align-top">
                <td className="p-3">
                  <p className="font-semibold text-slate-800">{c.nome}</p>
                  <p className="text-xs text-slate-500">{c.telefone ? formatarTelefone(c.telefone) : 'Sem telefone'}</p>
                </td>
                <td className="p-3">
                  <p className="text-slate-800">{c.ultimo_servico ?? 'Atendimento'}</p>
                  <p className="text-xs text-slate-500">{isoParaBR(c.retorno.ultimoDia)}{c.ultimo_profissional ? ` · ${c.ultimo_profissional}` : ''}</p>
                </td>
                <td className="p-3">
                  <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${COR_SITUACAO[c.retorno.situacao]}`}>{ROTULO_SITUACAO_RETORNO[c.retorno.situacao]}</span>
                  <p className="text-xs text-slate-600 mt-1">
                    {isoParaBR(c.retorno.previsto)}{c.retorno.atrasoDias > 0 ? `, ${c.retorno.atrasoDias} dia(s) de atraso` : ''}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Ciclo de {c.retorno.cicloDias} dias ({c.retorno.origemCiclo === 'servico' ? 'do serviço' : c.retorno.origemCiclo === 'media' ? 'média da cliente' : 'padrão'})
                  </p>
                  {c.proximo_agendamento && <p className="text-[11px] text-emerald-700">Agendada para {dataBR(c.proximo_agendamento)}</p>}
                </td>
                <td className="p-3 tabular-nums">
                  <p>{c.visitas_12m} visita(s)</p>
                  <p className="text-xs text-slate-500">{c.intervalo_medio_dias ? `a cada ${Math.round(c.intervalo_medio_dias)} dias` : 'sem intervalo'}</p>
                </td>
                <td className="p-3 tabular-nums">
                  <p>{brl(c.total_12m)}</p>
                  <p className="text-xs text-slate-500">ticket {c.ticket_medio_12m ? brl(c.ticket_medio_12m) : '-'}</p>
                </td>
                <td className="p-3">
                  <Link to={`/clientes?cliente=${c.cliente_id}`} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold inline-block">Abrir ficha</Link>
                </td>
              </tr>
            ))}
            {!isLoading && lista.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500">Nenhuma cliente com esses filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Atendimentos() {
  const hoje = dataLocal();
  const [atalho, setAtalho] = useState<Atalho>('mes');
  const [periodo, setPeriodo] = useState(periodoDoAtalho('mes', hoje));
  const [f, setF] = useState<FiltrosAtendimentos>(FILTROS_ATENDIMENTOS_PADRAO);
  const atend = useQuery({
    queryKey: comissoesKeys.atendimentos({ hist: true, ...periodo }),
    queryFn: () => listarAtendimentos({ de: periodo.de, ate: periodo.ate }),
  });
  const { data: catalogo } = useQuery({ queryKey: historicoKeys.catalogo, queryFn: listarCatalogoHistorico });
  const { data: telefones = new Map<string, string | null>() } = useQuery({ queryKey: historicoKeys.telefones, queryFn: listarTelefones });
  const { data: equipe = [] } = useQuery({ queryKey: equipeKeys.ativos, queryFn: listarAtivos });

  const categoriaDoServico = useMemo(() => new Map((catalogo?.servicos ?? []).map((s) => [s.id, s.categoria_id])), [catalogo]);
  const nomeCategoria = useMemo(() => new Map((catalogo?.categorias ?? []).map((c) => [c.id, c.nome])), [catalogo]);
  const linhas = useMemo(() => filtrarAtendimentos(atend.data ?? [], f, categoriaDoServico, telefones), [atend.data, f, categoriaDoServico, telefones]);
  const totais = totaisAtendimentos(linhas);

  const escolherAtalho = (a: Atalho) => {
    setAtalho(a);
    if (a !== 'personalizado') setPeriodo(periodoDoAtalho(a, hoje));
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ROTULO_ATALHO) as Atalho[]).map((a) => (
            <button key={a} type="button" aria-pressed={atalho === a} onClick={() => escolherAtalho(a)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${atalho === a ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-600'}`}>
              {ROTULO_ATALHO[a]}
            </button>
          ))}
          {atalho === 'personalizado' && (
            <span className="flex items-center gap-2">
              <input type="date" aria-label="De" value={periodo.de} onChange={(e) => e.target.value && setPeriodo({ ...periodo, de: e.target.value })} className={`${inputCls} !py-1.5 w-auto`} />
              <input type="date" aria-label="Até" value={periodo.ate} onChange={(e) => e.target.value && setPeriodo({ ...periodo, ate: e.target.value })} className={`${inputCls} !py-1.5 w-auto`} />
            </span>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <input type="search" placeholder="Cliente (nome ou telefone)" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} className={`${inputCls} lg:col-span-2`} />
          <select aria-label="Profissional" value={f.profissional} onChange={(e) => setF({ ...f, profissional: e.target.value })} className={inputCls}>
            <option value="">Todas as profissionais</option>
            {equipe.map((m) => <option key={m.id} value={m.id}>{m.apelido || m.name}</option>)}
          </select>
          <select aria-label="Categoria" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value, servico: '' })} className={inputCls}>
            <option value="">Todas as categorias</option>
            {(catalogo?.categorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select aria-label="Serviço" value={f.servico} onChange={(e) => setF({ ...f, servico: e.target.value })} className={inputCls}>
            <option value="">Todos os serviços</option>
            {(catalogo?.servicos ?? []).filter((s) => !f.categoria || s.categoria_id === f.categoria).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <select aria-label="Situação" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as FiltrosAtendimentos['status'] })} className={inputCls}>
            <option value="">Todas as situações</option>
            {STATUS.map((s) => <option key={s} value={s}>{ROTULO_STATUS_ATENDIMENTO[s]}</option>)}
          </select>
          <select aria-label="Forma de pagamento" value={f.forma} onChange={(e) => setF({ ...f, forma: e.target.value as FiltrosAtendimentos['forma'] })} className={inputCls}>
            <option value="">Todas as formas</option>
            {FORMAS.map((x) => <option key={x} value={x}>{ROTULO_FORMA[x]}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Indicador titulo="Atendimentos" valor={String(totais.quantidade)} icone={<History size={14} />} />
        <Indicador titulo="Realizados" valor={String(totais.realizados)} icone={<UserRoundCheck size={14} />} />
        <Indicador titulo="Faturamento" valor={brl(totais.faturamento)} icone={<CalendarClock size={14} />} />
        <Indicador titulo="Ticket médio" valor={brl(totais.ticketMedio)} icone={<Users size={14} />} />
      </div>

      {atend.isLoading && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Carregando...</p>}
      {atend.error && <p className="text-sm text-red-600">{mensagemDeErro(atend.error, 'Não foi possível carregar os atendimentos.', 'historico_atendimentos')}</p>}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">Data</th><th className="p-3">Cliente</th><th className="p-3">Serviço</th><th className="p-3">Categoria</th>
              <th className="p-3">Profissional</th><th className="p-3 text-right">Valor</th><th className="p-3">Pagamento</th><th className="p-3">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l) => (
              <tr key={l.id}>
                <td className="p-3 tabular-nums whitespace-nowrap">{dataBR(l.start_time)}</td>
                <td className="p-3">{l.client_id ? <Link to={`/clientes?cliente=${l.client_id}`} className="text-slate-800 hover:underline">{l.cliente_nome}</Link> : l.cliente_nome}</td>
                <td className="p-3">{l.servico_nome}</td>
                <td className="p-3 text-slate-500">{(l.servico_id && nomeCategoria.get(categoriaDoServico.get(l.servico_id) ?? '')) || '-'}</td>
                <td className="p-3">{l.profissional_nome}</td>
                <td className="p-3 text-right tabular-nums">{brl(l.valor_cobrado ?? 0)}</td>
                <td className="p-3">{l.payment_method ? ROTULO_FORMA[l.payment_method as FormaPagamento] ?? l.payment_method : '-'}</td>
                <td className="p-3">{ROTULO_STATUS_ATENDIMENTO[l.status] ?? l.status}</td>
              </tr>
            ))}
            {!atend.isLoading && linhas.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-slate-500">Nenhum atendimento no período com esses filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
