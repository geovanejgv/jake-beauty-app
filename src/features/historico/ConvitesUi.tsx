import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MessageCircle, Plus, SkipForward, Trash2 } from 'lucide-react';
import { Campo, Confirmar, Modal, inputCls } from '../../components/ui';
import { dataHoraBR, formatarTelefone, isoParaBR } from '../../lib/formatos';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import {
  DADOS_EXEMPLO, linkConvite, MODELOS_SUGERIDOS, preencherMensagem, primeiroNome, RESULTADOS_MANUAIS, ROTULO_RESULTADO,
  telefoneWhatsapp, travasDoConvite, VARIAVEIS, type Contato, type DadosConvite, type ModeloMensagem, type ResultadoConvite,
} from './convites';
import {
  atualizarTelefone, definirNaoQuerContato, excluirModelo, historicoKeys, listarContatos, listarContatosDaCliente, listarModelos, listarNaoQuerContato, registrarContato,
  registrarResultado, salvarModelo,
} from './api';
import type { ClienteComRetorno } from './logic';

/** Modelos salvos; sem nenhum, as sugestões (ainda não gravadas). */
export function useModelos() {
  const { data, ...resto } = useQuery({ queryKey: historicoKeys.modelos, queryFn: listarModelos });
  const modelos = data && data.length ? data : MODELOS_SUGERIDOS;
  return { modelos, salvos: data ?? [], ...resto };
}

export function invalidarConvites(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: historicoKeys.contatos });
  void qc.invalidateQueries({ queryKey: historicoKeys.naoQuer });
  // O banco conclui os lembretes pendentes da cliente ao registrar o convite.
  void qc.invalidateQueries({ queryKey: historicoKeys.lembretes });
}

function dadosDaCliente(c: ClienteComRetorno, nomeClinica: string): DadosConvite {
  return {
    primeiro_nome: primeiroNome(c.nome),
    ultimo_servico: (c.ultimo_servico ?? 'atendimento').toLowerCase(),
    data_ultimo_servico: isoParaBR(c.retorno.ultimoDia),
    dias_desde: String(c.retorno.diasSemVir),
    profissional: primeiroNome(c.ultimo_profissional ?? ''),
    nome_clinica: nomeClinica,
    link_agendamento: '',
  };
}

/**
 * Envio assistido: mostra o texto pronto (editável só para este envio), avisa as travas e,
 * ao abrir o WhatsApp, grava o envio. "Enviar para a próxima" percorre a lista filtrada.
 */
export function EnviarConvite({ fila, inicio, nomeClinica, ultimoConvite, naoQuer, onFechar, modeloId }: {
  fila: ClienteComRetorno[];
  inicio: number;
  nomeClinica: string;
  ultimoConvite: Map<string, Contato>;
  naoQuer: Set<string>;
  onFechar: () => void;
  /** Modelo escolhido no lembrete; sem ele, o padrão. */
  modeloId?: string | null;
}) {
  const qc = useQueryClient();
  const { modelos } = useModelos();
  const [pos, setPos] = useState(inicio);
  const padrao = (modeloId && modelos.find((m) => m.id === modeloId)) || modelos.find((m) => m.padrao) || modelos[0];
  const [modeloIdx, setModeloIdx] = useState(Math.max(0, modelos.indexOf(padrao)));
  const cliente = fila[pos];
  const modelo = modelos[modeloIdx] ?? padrao;
  const textoBase = cliente ? preencherMensagem(modelo.texto, dadosDaCliente(cliente, nomeClinica)) : '';
  const [editado, setEditado] = useState<string | null>(null);
  const texto = editado ?? textoBase;
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const travas = cliente ? travasDoConvite({
    naoQuerContato: naoQuer.has(cliente.cliente_id),
    telefone: cliente.telefone,
    proximoAgendamento: cliente.proximo_agendamento,
    ultimoConvite: ultimoConvite.get(cliente.cliente_id) ?? null,
  }) : [];
  const bloqueado = travas.some((t) => t.bloqueia);
  const telefone = cliente ? telefoneWhatsapp(cliente.telefone) : null;

  const registrar = useMutation({
    mutationFn: () => registrarContato({ client_id: cliente!.cliente_id, modelo_id: modelo.id, texto }),
    onSuccess: () => { setEnviado(true); invalidarConvites(qc); },
    onError: (e) => setErro(mensagemDeErro(e, 'O WhatsApp abriu, mas o envio não foi registrado. Registre de novo.', 'registrar_convite')),
  });

  const proxima = () => { setPos(pos + 1); setEditado(null); setEnviado(false); setErro(null); };

  if (!cliente) {
    return (
      <Modal titulo="Convites" onClose={onFechar}>
        <p className="text-sm text-slate-600">Fim da lista filtrada.</p>
      </Modal>
    );
  }

  return (
    <Modal titulo={`Convite para ${cliente.nome}`} onClose={onFechar} rodape={
      <div className="flex flex-wrap justify-end gap-2">
        {pos + 1 < fila.length && (
          <button type="button" onClick={proxima} className="px-4 py-2 text-sm font-bold text-slate-700 border border-slate-200 rounded-lg flex items-center gap-1.5">
            <SkipForward size={16} /> {enviado ? 'Enviar para a próxima' : 'Pular'}
          </button>
        )}
        {bloqueado || !telefone ? (
          <button type="button" disabled className="px-4 py-2 text-sm font-bold text-white bg-slate-300 rounded-lg">Abrir WhatsApp</button>
        ) : (
          <a href={linkConvite(telefone, texto)} target="_blank" rel="noopener noreferrer"
            onClick={() => { if (!enviado && !registrar.isPending) registrar.mutate(); }}
            className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5">
            <MessageCircle size={16} /> {enviado ? 'Abrir de novo' : 'Abrir WhatsApp'}
          </a>
        )}
      </div>
    }>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">Cliente {pos + 1} de {fila.length} na lista filtrada.</p>
        {travas.map((t) => (
          <p key={t.mensagem} className={`text-sm rounded-lg p-2.5 flex items-center gap-2 ${t.bloqueia ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
            <AlertTriangle size={16} className="shrink-0" /> {t.mensagem}
          </p>
        ))}
        <Campo rotulo="Modelo">
          <select value={modeloIdx} onChange={(e) => { setModeloIdx(Number(e.target.value)); setEditado(null); }} className={inputCls}>
            {modelos.map((m, i) => <option key={m.id ?? m.nome} value={i}>{m.nome}{m.padrao ? ' (padrão)' : ''}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Mensagem (a mudança vale só para este envio)">
          <textarea rows={6} maxLength={2000} value={texto} onChange={(e) => setEditado(e.target.value)} className={inputCls} />
        </Campo>
        {enviado && <p className="text-sm text-emerald-700">Envio registrado. Depois marque o resultado na lista.</p>}
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

/** Todas as mensagens que a cliente recebeu, com o texto enviado e o resultado de cada uma. */
export function HistoricoMensagens({ clienteId, nome, onFechar }: { clienteId: string; nome: string; onFechar: () => void }) {
  const { modelos } = useModelos();
  const { data = [], isLoading, error } = useQuery({ queryKey: historicoKeys.contatosDaCliente(clienteId), queryFn: () => listarContatosDaCliente(clienteId) });
  const nomeModelo = new Map(modelos.filter((m) => m.id).map((m) => [m.id!, m.nome]));
  return (
    <Modal titulo={`Mensagens de ${nome}`} onClose={onFechar}>
      {isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
      {error && <p role="alert" className="text-sm text-red-700">{mensagemDeErro(error, 'Não foi possível carregar as mensagens.', 'historico_mensagens')}</p>}
      {!isLoading && !error && data.length === 0 && <p className="text-sm text-slate-600">A cliente ainda não recebeu nenhuma mensagem pelo sistema.</p>}
      <ol className="space-y-3">
        {data.map((c) => (
          <li key={c.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-800">
                {dataHoraBR(c.enviado_em)}
                {c.modelo_id && nomeModelo.get(c.modelo_id) && <span className="font-normal text-slate-500"> · {nomeModelo.get(c.modelo_id)}</span>}
              </p>
              <div className="w-40"><SeletorResultado contato={c} /></div>
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-line bg-emerald-50 rounded-lg p-2.5">{c.texto_enviado}</p>
          </li>
        ))}
      </ol>
    </Modal>
  );
}

/** Corrige o telefone da cliente sem sair do histórico; avisa quando o número não serve para o WhatsApp. */
export function EditarTelefone({ clienteId, nome, telefone, onFechar }: { clienteId: string; nome: string; telefone: string | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState(formatarTelefone(telefone));
  const [erro, setErro] = useState<string | null>(null);
  const digitos = valor.replace(/\D/g, '');
  const valido = digitos.length === 10 || digitos.length === 11;
  const salvar = useMutation({
    mutationFn: () => atualizarTelefone(clienteId, valor),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: historicoKeys.telefones });
      void qc.invalidateQueries({ queryKey: historicoKeys.reativacao });
      void qc.invalidateQueries({ queryKey: historicoKeys.nomes });
      void qc.invalidateQueries({ queryKey: ['clients'] });
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível salvar o telefone.', 'historico_editar_telefone')),
  });
  return (
    <Modal titulo={`Telefone de ${nome}`} onClose={onFechar} rodape={
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFechar} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg">Cancelar</button>
        <button type="button" disabled={!valido || salvar.isPending} onClick={() => salvar.mutate()} className="px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded-lg disabled:opacity-50">Salvar</button>
      </div>
    }>
      <div className="space-y-3">
        <Campo rotulo="Telefone (com DDD)" obrigatorio>
          <input type="tel" autoFocus value={valor} placeholder="(11) 99999-9999" onChange={(e) => setValor(formatarTelefone(e.target.value))} className={inputCls} />
        </Campo>
        {valido && !telefoneWhatsapp(valor) && <p className="text-sm text-amber-700">Esse número não parece um celular válido para o WhatsApp.</p>}
        {!valido && digitos.length > 0 && <p className="text-sm text-slate-500">Informe DDD e número: 10 ou 11 dígitos.</p>}
        <p className="text-xs text-slate-500">A alteração vale para o cadastro da cliente.</p>
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

/** Resultado do último convite, num clique. */
export function SeletorResultado({ contato }: { contato: Contato }) {
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const mudar = useMutation({
    mutationFn: (r: ResultadoConvite) => registrarResultado([contato.id], r),
    onSuccess: () => invalidarConvites(qc),
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível registrar.', 'resultado_convite')),
  });
  return (
    <div>
      <select aria-label="Resultado do convite" value={contato.resultado} disabled={mudar.isPending}
        onChange={(e) => mudar.mutate(e.target.value as ResultadoConvite)} className={`${inputCls} !py-1 !text-xs`}>
        {contato.resultado === 'enviado' && <option value="enviado">{ROTULO_RESULTADO.enviado}</option>}
        {RESULTADOS_MANUAIS.map((r) => <option key={r} value={r}>{ROTULO_RESULTADO[r]}</option>)}
      </select>
      {erro && <p className="text-[11px] text-red-600 mt-1">{erro}</p>}
    </div>
  );
}

/** Modelos de mensagem com prévia (Configurações da reativação). */
export function ModelosMensagem({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient();
  const { salvos } = useModelos();
  const [editando, setEditando] = useState<ModeloMensagem | null>(null);
  const [excluindo, setExcluindo] = useState<ModeloMensagem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const lista = salvos.length ? salvos : [];
  const atualizar = () => qc.invalidateQueries({ queryKey: historicoKeys.modelos });
  const salvar = useMutation({
    mutationFn: (m: ModeloMensagem) => salvarModelo(m),
    onSuccess: () => { setEditando(null); setErro(null); void atualizar(); },
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível salvar o modelo.', 'salvar_modelo_mensagem')),
  });
  const excluir = useMutation({
    mutationFn: (id: string) => excluirModelo(id),
    onSuccess: () => { setExcluindo(null); void atualizar(); },
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível excluir.', 'excluir_modelo_mensagem')),
  });
  const previa = useMemo(() => (editando ? preencherMensagem(editando.texto, DADOS_EXEMPLO) : ''), [editando]);

  return (
    <Modal titulo="Mensagens de reativação" onClose={onFechar} largura="md:max-w-[720px]">
      {editando ? (
        <div className="space-y-4">
          <Campo rotulo="Nome do modelo" obrigatorio>
            <input value={editando.nome} maxLength={60} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} className={inputCls} />
          </Campo>
          <Campo rotulo="Texto" obrigatorio dica={`Variáveis: ${VARIAVEIS.map((v) => `{${v}}`).join(' ')}. Evite {dias_desde}: "faz 97 dias" soa como cobrança.`}>
            <textarea rows={6} maxLength={1000} value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} className={inputCls} />
          </Campo>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editando.padrao} onChange={(e) => setEditando({ ...editando, padrao: e.target.checked })} className="h-4 w-4 accent-rose-600" /> Usar como padrão</label>
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
            <p className="text-xs font-bold text-emerald-800 mb-1">Prévia com dados de exemplo</p>
            <p className="text-sm text-slate-800 whitespace-pre-line">{previa}</p>
          </div>
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditando(null)} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg">Voltar</button>
            <button type="button" disabled={salvar.isPending || editando.nome.trim().length < 2 || editando.texto.trim().length < 5}
              onClick={() => salvar.mutate(editando)} className="px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded-lg disabled:opacity-50">Salvar</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Nenhum modelo salvo. Os convites usam as sugestões abaixo; salve uma para editar.</p>
              {MODELOS_SUGERIDOS.map((m) => (
                <button key={m.nome} type="button" onClick={() => setEditando({ ...m })} className="w-full text-left p-3 rounded-xl border border-dashed border-slate-300 hover:border-rose-400">
                  <p className="text-sm font-bold text-slate-800">{m.nome}{m.padrao ? ' (padrão)' : ''}</p>
                  <p className="text-xs text-slate-500 line-clamp-2">{m.texto}</p>
                </button>
              ))}
            </div>
          )}
          {lista.map((m) => (
            <div key={m.id} className="p-3 rounded-xl border border-slate-200 flex items-start gap-3">
              <button type="button" onClick={() => setEditando({ ...m })} className="flex-1 text-left min-w-0">
                <p className="text-sm font-bold text-slate-800">{m.nome}{m.padrao ? ' (padrão)' : ''}</p>
                <p className="text-xs text-slate-500 line-clamp-2">{m.texto}</p>
              </button>
              <button type="button" onClick={() => setExcluindo(m)} aria-label={`Excluir ${m.nome}`} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setEditando({ id: null, nome: '', texto: '', padrao: lista.length === 0 })}
            className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold flex items-center gap-2"><Plus size={16} /> Novo modelo</button>
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
        </div>
      )}
      {excluindo?.id && (
        <Confirmar titulo="Excluir modelo" texto={`O modelo "${excluindo.nome}" será apagado. Os convites já enviados continuam registrados.`} botao="Excluir"
          ocupado={excluir.isPending} onCancelar={() => setExcluindo(null)} onConfirmar={() => excluir.mutate(excluindo.id!)} />
      )}
    </Modal>
  );
}

/** Na ficha da cliente: último convite e "não quer contato" (só a administradora). */
export function ContatoDaCliente({ clienteId, onAgendarLembrete }: { clienteId: string; onAgendarLembrete?: () => void }) {
  const qc = useQueryClient();
  const { data: contatos = [] } = useQuery({ queryKey: historicoKeys.contatos, queryFn: listarContatos });
  const { data: naoQuer = new Set<string>() } = useQuery({ queryKey: historicoKeys.naoQuer, queryFn: listarNaoQuerContato });
  const [erro, setErro] = useState<string | null>(null);
  const ultimo = contatos.find((c) => c.client_id === clienteId) ?? null;
  const bloqueada = naoQuer.has(clienteId);
  const alternar = useMutation({
    mutationFn: () => definirNaoQuerContato(clienteId, !bloqueada),
    onSuccess: () => invalidarConvites(qc),
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível alterar.', 'nao_quer_contato')),
  });
  return (
    <div className="px-6 py-2 border-b border-slate-100 text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>Último convite: {ultimo ? `${new Date(ultimo.enviado_em).toLocaleDateString('pt-BR')}, ${ROTULO_RESULTADO[ultimo.resultado].toLowerCase()}` : 'nenhum'}</span>
      {bloqueada && <span className="font-bold text-red-600">Não quer contato</span>}
      <button type="button" disabled={alternar.isPending} onClick={() => alternar.mutate()} className="underline text-slate-500 hover:text-slate-800">
        {bloqueada ? 'Voltar a aceitar contato' : 'Marcar "não quer contato"'}
      </button>
      {onAgendarLembrete && !bloqueada && <button type="button" onClick={onAgendarLembrete} className="underline text-slate-500 hover:text-slate-800">Agendar lembrete</button>}
      {erro && <span className="text-red-600">{erro}</span>}
    </div>
  );
}
