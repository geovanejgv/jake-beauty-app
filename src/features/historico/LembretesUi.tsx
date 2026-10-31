import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Eye, EyeOff, MessageCircle, X } from 'lucide-react';
import { Campo, Modal, inputCls } from '../../components/ui';
import { dataLocal, isoParaBR } from '../../lib/formatos';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { equipeKeys, listarAtivos } from '../equipe/api';
import {
  criarLembrete, historicoKeys, listarClientesReativacao, listarContatos, listarLembretesPendentes, listarNaoQuerContato,
  listarNomesClientes, mudarDataLembrete, mudarStatusLembrete,
} from './api';
import { ultimoPorCliente } from './convites';
import { EnviarConvite, useModelos } from './ConvitesUi';
import { ADIAMENTOS, adiar, contatosParaHoje, lembretesDoDia, sugerirDataLembrete, type Lembrete } from './lembretes';
import { retornoDaCliente, type ClienteComRetorno } from './logic';

function invalidarLembretes(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: historicoKeys.lembretes });
}

/** Agendar lembrete de contato, com a data sugerida pelo ciclo ou pelo convite sem resposta. */
export function AgendarLembrete({ clienteId, nome, retornoPrevisto, onFechar }: {
  clienteId: string; nome: string; retornoPrevisto: string | null; onFechar: () => void;
}) {
  const qc = useQueryClient();
  const hoje = dataLocal();
  const { modelos } = useModelos();
  const { data: equipe = [] } = useQuery({ queryKey: equipeKeys.ativos, queryFn: listarAtivos });
  const { data: contatos = [] } = useQuery({ queryKey: historicoKeys.contatos, queryFn: listarContatos });
  const sugestao = sugerirDataLembrete({ retornoPrevisto, ultimoConvite: ultimoPorCliente(contatos).get(clienteId) ?? null }, hoje);
  const [data, setData] = useState<string | null>(null);
  const [hora, setHora] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [modeloId, setModeloId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () => criarLembrete({
      client_id: clienteId, data: data ?? sugestao, hora: hora || null, responsavel_id: responsavel || null,
      modelo_id: modeloId || null, observacao,
    }),
    onSuccess: () => { invalidarLembretes(qc); onFechar(); },
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível agendar o lembrete.', 'criar_lembrete')),
  });
  return (
    <Modal titulo={`Lembrete de contato: ${nome}`} onClose={onFechar} rodape={
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFechar} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg">Cancelar</button>
        <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate()} className="px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded-lg disabled:opacity-50">Agendar lembrete</button>
      </div>
    }>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">Aparece na faixa de lembretes da agenda, sem ocupar horário de profissional.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Data" obrigatorio dica={`Sugestão: ${isoParaBR(sugestao)}`}>
            <input type="date" min={hoje} value={data ?? sugestao} onChange={(e) => e.target.value && setData(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Hora (opcional)">
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Responsável (opcional)">
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={inputCls}>
              <option value="">Qualquer pessoa</option>
              {equipe.map((m) => <option key={m.id} value={m.id}>{m.apelido || m.name}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Modelo de mensagem">
            <select value={modeloId} onChange={(e) => setModeloId(e.target.value)} className={inputCls}>
              <option value="">Padrão</option>
              {modelos.filter((m) => m.id).map((m) => <option key={m.id} value={m.id!}>{m.nome}</option>)}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Observação">
          <textarea rows={2} maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} className={inputCls} />
        </Campo>
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

/** Cliente para o convite a partir do lembrete; sem atendimento concluído, monta o mínimo. */
function clienteDoLembrete(id: string, lista: ClienteComRetorno[], nomes: Map<string, { nome: string; telefone: string | null }>, hoje: string): ClienteComRetorno {
  const achada = lista.find((c) => c.cliente_id === id);
  if (achada) return achada;
  const base = {
    cliente_id: id, nome: nomes.get(id)?.nome ?? 'Cliente', telefone: nomes.get(id)?.telefone ?? null,
    ultimo_atendimento: new Date().toISOString(), ultimo_servico: null, ultimo_profissional: null, retorno_ciclo_dias: null,
    visitas_12m: 0, intervalo_medio_dias: null, total_12m: 0, ticket_medio_12m: null, proximo_agendamento: null,
  };
  return { ...base, retorno: retornoDaCliente(base, hoje) };
}

/**
 * Faixa no topo do dia da agenda: lembretes de contato (cor e ícone próprios), com
 * Enviar agora, Adiar e Cancelar. Só a administradora.
 */
/** Lembretes de contato pendentes do dia (hoje inclui os atrasados). Só a administradora lê (RLS). */
function useLembretesContatoDoDia(dia: string) {
  const hoje = dataLocal();
  const { data: lembretes = [] } = useQuery({ queryKey: historicoKeys.lembretes, queryFn: listarLembretesPendentes });
  return useMemo(() => lembretesDoDia(lembretes, dia, hoje), [lembretes, dia, hoje]);
}

/**
 * Lista dos lembretes de contato do dia, com enviar o convite, adiar e cancelar.
 * Usada na faixa da agenda e na janela "Lembrar clientes"; some quando não há lembrete.
 */
export function ListaLembretesContato({ dia, nomeClinica, titulo = false }: { dia: string; nomeClinica: string; titulo?: boolean }) {
  const qc = useQueryClient();
  const hoje = dataLocal();
  const [enviar, setEnviar] = useState<Lembrete | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const doDia = useLembretesContatoDoDia(dia);
  const { data: nomes = new Map() } = useQuery({ queryKey: historicoKeys.nomes, queryFn: listarNomesClientes });
  const precisaConvite = enviar !== null;
  const { data: reativacao = [] } = useQuery({ queryKey: historicoKeys.reativacao, queryFn: listarClientesReativacao, enabled: precisaConvite });
  const { data: contatos = [] } = useQuery({ queryKey: historicoKeys.contatos, queryFn: listarContatos, enabled: precisaConvite });
  const { data: naoQuer = new Set<string>() } = useQuery({ queryKey: historicoKeys.naoQuer, queryFn: listarNaoQuerContato, enabled: precisaConvite });

  const mudar = useMutation({
    mutationFn: (a: { id: string; data?: string; cancelar?: boolean }) => (a.cancelar ? mudarStatusLembrete(a.id, 'cancelado') : mudarDataLembrete(a.id, a.data!)),
    onSuccess: () => { setErro(null); invalidarLembretes(qc); },
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível alterar o lembrete.', 'alterar_lembrete')),
  });

  if (doDia.length === 0 && !enviar) return null;
  const listaConvite = enviar ? [clienteDoLembrete(enviar.client_id, reativacao.map((c) => ({ ...c, retorno: retornoDaCliente(c, hoje) })), nomes, hoje)] : [];

  return (
    <div className="space-y-2">
      {titulo && <h4 className="text-xs font-bold text-violet-800 flex items-center gap-1.5"><BellRing size={14} /> Lembretes de contato da reativação ({doDia.length})</h4>}
      <ul className="flex flex-col gap-1.5">
        {doDia.map((l) => (
          <li key={l.id} className="bg-white rounded-lg border border-violet-100 px-2.5 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span className="font-semibold text-slate-800">{nomes.get(l.client_id)?.nome ?? 'Cliente'}</span>
            <span className="text-xs text-slate-500">
              {l.data < hoje ? `atrasado desde ${isoParaBR(l.data)}` : l.hora ? `às ${l.hora}` : 'no dia'}{l.observacao ? ` · ${l.observacao}` : ''}
            </span>
            <span className="flex flex-wrap gap-1.5 ml-auto">
              <button type="button" onClick={() => setEnviar(l)} className="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"><MessageCircle size={12} /> Enviar agora</button>
              {ADIAMENTOS.map((d) => (
                <button key={d} type="button" disabled={mudar.isPending} onClick={() => mudar.mutate({ id: l.id, data: adiar(l.data, d, hoje) })}
                  className="px-2 py-1 rounded-md border border-slate-200 text-xs text-slate-600">+{d}d</button>
              ))}
              <button type="button" disabled={mudar.isPending} onClick={() => mudar.mutate({ id: l.id, cancelar: true })} aria-label="Cancelar lembrete"
                className="px-2 py-1 rounded-md border border-slate-200 text-xs text-slate-500"><X size={12} /></button>
            </span>
          </li>
        ))}
      </ul>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {enviar && listaConvite.length > 0 && (
        <EnviarConvite fila={listaConvite} inicio={0} nomeClinica={nomeClinica} modeloId={enviar.modelo_id}
          ultimoConvite={ultimoPorCliente(contatos)} naoQuer={naoQuer} onFechar={() => setEnviar(null)} />
      )}
    </div>
  );
}

export function FaixaLembretes({ dia, nomeClinica }: { dia: string; nomeClinica: string }) {
  const [visivel, setVisivel] = useState(true);
  const doDia = useLembretesContatoDoDia(dia);

  // Mostrar/esconder vale enquanto a agenda está aberta (sem gravar no navegador, SES-02).
  const alternar = () => setVisivel(!visivel);

  if (doDia.length === 0 && visivel) return null;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 shrink-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-violet-800 flex items-center gap-1.5"><BellRing size={14} /> Lembretes de contato ({doDia.length})</p>
        <button type="button" onClick={alternar} className="text-xs text-violet-700 flex items-center gap-1" aria-pressed={visivel}>
          {visivel ? <><EyeOff size={14} /> Esconder</> : <><Eye size={14} /> Mostrar</>}
        </button>
      </div>
      {visivel && <div className="mt-2"><ListaLembretesContato dia={dia} nomeClinica={nomeClinica} /></div>}
    </div>
  );
}

/** "X contatos para hoje" no painel inicial (administradora). */
export function PendenciasContato() {
  const hoje = dataLocal();
  const { data: lembretes = [] } = useQuery({ queryKey: historicoKeys.lembretes, queryFn: listarLembretesPendentes });
  const total = contatosParaHoje(lembretes, hoje);
  if (total === 0) return null;
  return (
    <Link to="/agenda" className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800 hover:bg-violet-100">
      <BellRing size={16} /> {total} {total === 1 ? 'contato' : 'contatos'} para hoje
    </Link>
  );
}
