import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, History, Loader2, MessageCircle, MessageSquareText, Pencil, UserRoundCheck, UserRoundX, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { brl, dataBR, dataLocal, formatarTelefone, isoParaBR } from '../lib/formatos';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { inputCls } from '../components/ui';
import { comissoesKeys, listarAtendimentos } from '../features/comissoes/api';
import { ROTULO_FORMA, type FormaPagamento, type StatusAgendamento } from '../features/comissoes/logic';
import { equipeKeys, listarAtivos } from '../features/equipe/api';
import {
  historicoKeys, listarCatalogoHistorico, listarClientesReativacao, listarContatos, listarLembretesPendentes, listarNaoQuerContato, listarTelefones, registrarResultado,
  valoresDosAgendamentos,
} from '../features/historico/api';
import {
  convitesParados, filtrarAtendimentosPorConvite, filtrarPorConvite, FILTRO_CONVITE_ATENDIMENTOS, FILTRO_CONVITE_PADRAO, indicadoresConvites,
  PERIODOS_SEM_CONVITE, ROTULO_RESULTADO, ultimoPorCliente, type Contato, type FiltroConvite,
} from '../features/historico/convites';
import { EditarTelefone, EnviarConvite, HistoricoMensagens, invalidarConvites, ModelosMensagem, SeletorResultado } from '../features/historico/ConvitesUi';
import { AgendarLembrete } from '../features/historico/LembretesUi';
import { proximoPorCliente } from '../features/historico/lembretes';
import {
  clientesDosAtendimentos, clientesParaReativar, filtrarAtendimentos, retornoDaCliente, FILTROS_ATENDIMENTOS_PADRAO, FILTROS_REATIVAR_PADRAO, indicadoresRetorno, periodoDoAtalho,
  ROTULO_SITUACAO_RETORNO, ROTULO_STATUS_ATENDIMENTO, SITUACOES_RETORNO, totaisAtendimentos,
  type Atalho, type ClienteComRetorno, type FiltrosAtendimentos, type FiltrosReativar, type SituacaoRetorno,
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

/** Filtro "quem ainda não recebeu mensagem" no período escolhido. */
function FiltroMensagem({ fc, setFc }: { fc: FiltroConvite; setFc: (f: FiltroConvite) => void }) {
  return (
    <>
      <select aria-label="Mensagem" value={fc.convite} onChange={(e) => setFc({ ...fc, convite: e.target.value as FiltroConvite['convite'] })} className={`${inputCls} md:max-w-[240px]`}>
        <option value="todos">Qualquer mensagem</option>
        <option value="antigo">Sem mensagem no período</option>
        <option value="nunca">Nunca recebeu mensagem</option>
      </select>
      {fc.convite === 'antigo' && (
        <select aria-label="Período sem mensagem" value={fc.diasSemConvite} onChange={(e) => setFc({ ...fc, diasSemConvite: Number(e.target.value) })} className={`${inputCls} md:max-w-[200px]`}>
          {PERIODOS_SEM_CONVITE.map((d) => <option key={d} value={d}>Últimos {d} dias</option>)}
        </select>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={fc.incluirNaoQuer} onChange={(e) => setFc({ ...fc, incluirNaoQuer: e.target.checked })} className="h-4 w-4 accent-rose-600" />
        Incluir quem não quer contato
      </label>
    </>
  );
}

/** Última mensagem da cliente, com o resultado e o acesso ao histórico completo. */
function UltimaMensagem({ contato, naoQuer, onHistorico }: { contato: Contato | undefined; naoQuer: boolean; onHistorico: () => void }) {
  return (
    <>
      {naoQuer && <p className="text-xs font-bold text-red-600 mb-1">Não quer contato</p>}
      {contato ? (
        <>
          <p className="text-xs text-slate-500 mb-1" title={ROTULO_RESULTADO[contato.resultado]}>{dataBR(contato.enviado_em)}</p>
          <SeletorResultado contato={contato} />
          <button type="button" onClick={onHistorico} className="text-[11px] text-slate-500 underline hover:text-slate-800 mt-1">Ver histórico</button>
        </>
      ) : <p className="text-xs text-slate-400">Nunca recebeu</p>}
    </>
  );
}

function Reativar() {
  const hoje = dataLocal();
  const [f, setF] = useState<FiltrosReativar>(FILTROS_REATIVAR_PADRAO);
  const { perfil } = useAuth();
  const qc = useQueryClient();
  const [fc, setFc] = useState<FiltroConvite>(FILTRO_CONVITE_PADRAO);
  // A fila é congelada ao abrir: registrar um convite pode tirar a cliente da lista filtrada.
  const [envio, setEnvio] = useState<{ fila: typeof lista; inicio: number } | null>(null);
  const [mensagens, setMensagens] = useState(false);
  const [erroLote, setErroLote] = useState<string | null>(null);
  const { data = [], isLoading, error } = useQuery({ queryKey: historicoKeys.reativacao, queryFn: listarClientesReativacao });
  const { data: contatos = [] } = useQuery({ queryKey: historicoKeys.contatos, queryFn: listarContatos });
  const { data: lembretes = [] } = useQuery({ queryKey: historicoKeys.lembretes, queryFn: listarLembretesPendentes });
  const proximoLembrete = useMemo(() => proximoPorCliente(lembretes), [lembretes]);
  const [lembrete, setLembrete] = useState<ClienteComRetorno | null>(null);
  const [historico, setHistorico] = useState<{ id: string; nome: string } | null>(null);
  const { data: naoQuer = new Set<string>() } = useQuery({ queryKey: historicoKeys.naoQuer, queryFn: listarNaoQuerContato });
  const ultimo = useMemo(() => ultimoPorCliente(contatos), [contatos]);
  const ind = useMemo(() => indicadoresRetorno(data.filter((c) => !naoQuer.has(c.cliente_id)), hoje), [data, hoje, naoQuer]);
  const lista = useMemo(() => filtrarPorConvite(clientesParaReativar(data, f, hoje), ultimo, naoQuer, fc), [data, f, hoje, ultimo, naoQuer, fc]);
  // Indicadores dos convites dos últimos 30 dias.
  const recentes = useMemo(() => contatos.filter((c) => new Date(c.enviado_em).getTime() >= Date.now() - 30 * 86_400_000), [contatos]);
  const idsAgendados = useMemo(() => recentes.map((c) => c.agendamento_id).filter((x): x is string => !!x), [recentes]);
  const { data: valores = new Map<string, number>() } = useQuery({ queryKey: historicoKeys.valores(idsAgendados), queryFn: () => valoresDosAgendamentos(idsAgendados) });
  const indC = indicadoresConvites(recentes, valores);
  const parados = convitesParados(contatos);
  const lote = useMutation({
    mutationFn: () => registrarResultado(parados.map((c) => c.id), 'sem_resposta'),
    onSuccess: () => { setErroLote(null); invalidarConvites(qc); },
    onError: (e) => setErroLote(mensagemDeErro(e, 'Não foi possível marcar.', 'sem_resposta_lote')),
  });
  const alternar = (s: SituacaoRetorno) => setF({ ...f, situacoes: f.situacoes.includes(s) ? f.situacoes.filter((x) => x !== s) : [...f.situacoes, s] });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Indicador titulo="Ativas" valor={String(ind.ativas)} icone={<UserRoundCheck size={14} />} />
        <Indicador titulo="Retorno vencido" valor={String(ind.vencido)} icone={<CalendarClock size={14} />} />
        <Indicador titulo="Inativas (90+ dias)" valor={String(ind.inativas)} icone={<Users size={14} />} />
        <Indicador titulo="Perdidas (180+ dias)" valor={String(ind.perdidas)} icone={<UserRoundX size={14} />} />
        <Indicador titulo="Convites (30 dias)" valor={String(indC.enviados)} icone={<MessageCircle size={14} />} />
        <Indicador titulo="Taxa de resposta" valor={`${indC.taxaResposta}%`} icone={<MessageSquareText size={14} />} />
        <Indicador titulo="Taxa de reativação" valor={`${indC.taxaReativacao}%`} icone={<CalendarClock size={14} />} />
        <Indicador titulo="Faturamento reativado" valor={brl(indC.faturamentoReativado)} icone={<UserRoundCheck size={14} />} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setMensagens(true)} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 flex items-center gap-2">
          <MessageSquareText size={16} /> Mensagens
        </button>
        <button type="button" disabled={lista.length === 0} onClick={() => setEnvio({ fila: lista, inicio: 0 })} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50">
          <MessageCircle size={16} /> Enviar em sequência ({lista.length})
        </button>
        {parados.length > 0 && (
          <button type="button" disabled={lote.isPending} onClick={() => lote.mutate()} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700">
            Marcar {parados.length} convite(s) de mais de 7 dias como "sem resposta"
          </button>
        )}
        {erroLote && <p className="text-sm text-red-600">{erroLote}</p>}
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
          <FiltroMensagem fc={fc} setFc={setFc} />
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
              <th className="p-3">Frequência (12 meses)</th><th className="p-3">Valor (12 meses)</th><th className="p-3">Último convite</th><th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map((c, i) => (
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
                <td className="p-3 min-w-[150px]">
                  <UltimaMensagem contato={ultimo.get(c.cliente_id)} naoQuer={naoQuer.has(c.cliente_id)} onHistorico={() => setHistorico({ id: c.cliente_id, nome: c.nome })} />
                  {proximoLembrete.get(c.cliente_id) && <p className="text-[11px] text-violet-700 mt-1">Lembrete em {isoParaBR(proximoLembrete.get(c.cliente_id)!.data)}</p>}
                </td>
                <td className="p-3">
                  <div className="flex flex-col gap-1.5">
                    <button type="button" onClick={() => setEnvio({ fila: lista, inicio: i })} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1"><MessageCircle size={14} /> Enviar convite</button>
                    <button type="button" onClick={() => setLembrete(c)} className="px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 text-xs font-bold">Agendar lembrete</button>
                    <Link to={`/clientes?cliente=${c.cliente_id}`} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold text-center">Abrir ficha</Link>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && lista.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-slate-500">Nenhuma cliente com esses filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {envio !== null && (
        <EnviarConvite fila={envio.fila} inicio={envio.inicio} nomeClinica={perfil?.estabelecimento?.nome ?? ''} ultimoConvite={ultimo} naoQuer={naoQuer} onFechar={() => setEnvio(null)} />
      )}
      {mensagens && <ModelosMensagem onFechar={() => setMensagens(false)} />}
      {historico && <HistoricoMensagens clienteId={historico.id} nome={historico.nome} onFechar={() => setHistorico(null)} />}
      {lembrete && <AgendarLembrete clienteId={lembrete.cliente_id} nome={lembrete.nome} retornoPrevisto={lembrete.retorno.previsto} onFechar={() => setLembrete(null)} />}
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
  // Convite por WhatsApp a partir do atendimento (mesmo registro da reativação).
  const { perfil } = useAuth();
  const [fc, setFc] = useState<FiltroConvite>(FILTRO_CONVITE_ATENDIMENTOS);
  const [envio, setEnvio] = useState<{ fila: ClienteComRetorno[]; inicio: number } | null>(null);
  const [historico, setHistorico] = useState<{ id: string; nome: string } | null>(null);
  const [mensagens, setMensagens] = useState(false);
  const [editarTelefone, setEditarTelefone] = useState<{ id: string; nome: string } | null>(null);
  const { data: reativacao = [] } = useQuery({ queryKey: historicoKeys.reativacao, queryFn: listarClientesReativacao });
  const { data: contatos = [] } = useQuery({ queryKey: historicoKeys.contatos, queryFn: listarContatos });
  const { data: naoQuer = new Set<string>() } = useQuery({ queryKey: historicoKeys.naoQuer, queryFn: listarNaoQuerContato });
  const ultimo = useMemo(() => ultimoPorCliente(contatos), [contatos]);
  const comRetorno = useMemo(() => reativacao.map((c) => ({ ...c, retorno: retornoDaCliente(c, hoje) })), [reativacao, hoje]);

  const categoriaDoServico = useMemo(() => new Map((catalogo?.servicos ?? []).map((s) => [s.id, s.categoria_id])), [catalogo]);
  const nomeCategoria = useMemo(() => new Map((catalogo?.categorias ?? []).map((c) => [c.id, c.nome])), [catalogo]);
  const linhas = useMemo(
    () => filtrarAtendimentosPorConvite(filtrarAtendimentos(atend.data ?? [], f, categoriaDoServico, telefones), ultimo, naoQuer, fc),
    [atend.data, f, categoriaDoServico, telefones, ultimo, naoQuer, fc],
  );
  const totais = totaisAtendimentos(linhas);
  // Uma vez por cliente, na ordem da tabela: "Enviar para a próxima" não repete ninguém.
  const fila = useMemo(() => clientesDosAtendimentos(linhas, comRetorno, telefones, hoje), [linhas, comRetorno, telefones, hoje]);
  const abrirConvite = (clienteId: string) => setEnvio({ fila, inicio: Math.max(0, fila.findIndex((c) => c.cliente_id === clienteId)) });

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
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <FiltroMensagem fc={fc} setFc={setFc} />
          <span className="text-xs text-slate-500 md:ml-auto">{fila.length} cliente(s)</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setMensagens(true)} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 flex items-center gap-2">
          <MessageSquareText size={16} /> Mensagens
        </button>
        <button type="button" disabled={fila.length === 0} onClick={() => setEnvio({ fila, inicio: 0 })} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50">
          <MessageCircle size={16} /> Enviar em sequência ({fila.length})
        </button>
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
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">Data</th><th className="p-3">Cliente</th><th className="p-3">Serviço</th><th className="p-3">Categoria</th>
              <th className="p-3">Profissional</th><th className="p-3 text-right">Valor</th><th className="p-3">Pagamento</th><th className="p-3">Situação</th>
              <th className="p-3">Última mensagem</th><th className="p-3">WhatsApp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l) => (
              <tr key={l.id}>
                <td className="p-3 tabular-nums whitespace-nowrap">{dataBR(l.start_time)}</td>
                <td className="p-3">
                  {l.client_id ? <Link to={`/clientes?cliente=${l.client_id}`} className="text-slate-800 hover:underline">{l.cliente_nome}</Link> : l.cliente_nome}
                  {/* Telefone ao lado do nome para conferir antes do convite. */}
                  {l.client_id && (
                    <span className="ml-2 text-xs text-slate-500 whitespace-nowrap tabular-nums inline-flex items-center gap-1">
                      {telefones.get(l.client_id) ? formatarTelefone(telefones.get(l.client_id)!) : 'Sem telefone'}
                      <button type="button" onClick={() => setEditarTelefone({ id: l.client_id!, nome: l.cliente_nome })} aria-label={`Editar telefone de ${l.cliente_nome}`}
                        title="Editar telefone" className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Pencil size={12} /></button>
                    </span>
                  )}
                </td>
                <td className="p-3">{l.servico_nome}</td>
                <td className="p-3 text-slate-500">{(l.servico_id && nomeCategoria.get(categoriaDoServico.get(l.servico_id) ?? '')) || '-'}</td>
                <td className="p-3">{l.profissional_nome}</td>
                <td className="p-3 text-right tabular-nums">{brl(l.valor_cobrado ?? 0)}</td>
                <td className="p-3">{l.payment_method ? ROTULO_FORMA[l.payment_method as FormaPagamento] ?? l.payment_method : '-'}</td>
                <td className="p-3">{ROTULO_STATUS_ATENDIMENTO[l.status] ?? l.status}</td>
                <td className="p-3 min-w-[150px]">
                  {l.client_id && <UltimaMensagem contato={ultimo.get(l.client_id)} naoQuer={naoQuer.has(l.client_id)} onHistorico={() => setHistorico({ id: l.client_id!, nome: l.cliente_nome })} />}
                </td>
                <td className="p-3">
                  {l.client_id && (
                    <button type="button" onClick={() => abrirConvite(l.client_id!)} aria-label={`Enviar convite por WhatsApp para ${l.cliente_nome}`}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1"><MessageCircle size={14} /> Convite</button>
                  )}
                </td>
              </tr>
            ))}
            {!atend.isLoading && linhas.length === 0 && (
              <tr><td colSpan={10} className="p-6 text-center text-slate-500">Nenhum atendimento no período com esses filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {envio !== null && (
        <EnviarConvite fila={envio.fila} inicio={envio.inicio} nomeClinica={perfil?.estabelecimento?.nome ?? ''} ultimoConvite={ultimo} naoQuer={naoQuer} onFechar={() => setEnvio(null)} />
      )}
      {mensagens && <ModelosMensagem onFechar={() => setMensagens(false)} />}
      {historico && <HistoricoMensagens clienteId={historico.id} nome={historico.nome} onFechar={() => setHistorico(null)} />}
      {editarTelefone && (
        <EditarTelefone clienteId={editarTelefone.id} nome={editarTelefone.nome} telefone={telefones.get(editarTelefone.id) ?? null} onFechar={() => setEditarTelefone(null)} />
      )}
    </div>
  );
}
