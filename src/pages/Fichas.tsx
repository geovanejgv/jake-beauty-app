import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ClipboardSignature, Copy, ExternalLink, Eye, FileText, Link2, Loader2, MessageCircle, Palette, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { Aviso, Campo, Confirmar, Modal, inputCls } from '../components/ui';
import { equipeKeys, listarAtivos } from '../features/equipe/api';
import {
  cancelarFicha, criarFicha, excluirFicha, fichasKeys, gerarLink, listarClientes, listarFichas, listarPreferencias, salvarPreferencia,
  type FichaResumo, type StatusFicha,
} from '../features/fichas/api';
import { DocumentoFicha } from '../features/fichas/DocumentoFicha';
import { EXEMPLO_RESPOSTAS, EXEMPLO_SALAO } from '../features/fichas/exemplos';
import { FormularioFicha } from '../features/fichas/FormularioFicha';
import { limparRespostas, linkDaFicha, mensagemLink, validarRespostas } from '../features/fichas/logic';
import { MODELOS, ROTULO_TIPO, TIPOS_FICHA } from '../features/fichas/modelos';
import { LISTA_TEMAS, TEMAS } from '../features/fichas/temas';
import type { IdTema, Respostas, TipoFicha } from '../features/fichas/tipos';
import { linkWhatsapp } from '../features/leads/logic';

const ROTULO_STATUS: Record<StatusFicha, string> = { pendente: 'Aguardando a cliente', assinada: 'Assinada', cancelada: 'Cancelada' };
const COR_STATUS: Record<StatusFicha, string> = {
  pendente: 'bg-amber-100 text-amber-800',
  assinada: 'bg-emerald-100 text-emerald-800',
  cancelada: 'bg-slate-200 text-slate-600',
};

const dataCurta = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

type LinkGerado = { ficha: FichaResumo; link: string; expira: string };

/**
 * Fichas de anamnese, fotodepilação e termos: a equipe cria, envia o link e a cliente
 * preenche e assina no celular. A profissional vê só as fichas dela (RLS).
 */
export default function Fichas() {
  const { perfil } = useAuth();
  const admin = perfil?.role === 'admin';
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<StatusFicha>('pendente');
  const [params, setParams] = useSearchParams();
  // Vindo da ficha da cliente: ?nova=<tipo>&cliente=<id> abre a criação; ?link=<ficha> gera novo link.
  const tipoParam = params.get('nova');
  const novaInicial = tipoParam && ['anamnese', 'fotodepilacao', 'termo'].includes(tipoParam)
    ? { tipo: tipoParam as TipoFicha, cliente: params.get('cliente') ?? '' } : null;
  const [nova, setNova] = useState<boolean>(!!novaInicial);
  const [novaPadrao] = useState(novaInicial);
  const [link, setLink] = useState<LinkGerado | null>(null);
  const [cancelando, setCancelando] = useState<FichaResumo | null>(null);
  const [excluindo, setExcluindo] = useState<FichaResumo | null>(null);
  const [visual, setVisual] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const { data: fichas = [], isLoading, error } = useQuery({ queryKey: fichasKeys.lista, queryFn: listarFichas });
  const { data: clientes = [] } = useQuery({ queryKey: fichasKeys.clientes, queryFn: listarClientes });
  const { data: equipe = [] } = useQuery({ queryKey: equipeKeys.ativos, queryFn: listarAtivos });
  const nomeCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c.name])), [clientes]);
  const nomeEquipe = useMemo(() => new Map(equipe.map((m) => [m.id, m.apelido || m.name])), [equipe]);

  const atualizar = () => queryClient.invalidateQueries({ queryKey: fichasKeys.lista });

  const enviarLink = useMutation({
    mutationFn: async (f: FichaResumo) => ({ f, r: await gerarLink(f.id) }),
    onSuccess: ({ f, r }) => { setLink({ ficha: f, link: linkDaFicha(window.location.origin, r.token), expira: r.expira_em }); void atualizar(); },
    onError: (e) => setAviso(mensagemDeErro(e, 'Não foi possível gerar o link.', 'ficha_gerar_link')),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => excluirFicha(id),
    onSuccess: () => { setExcluindo(null); void atualizar(); },
    onError: (e) => setAviso(mensagemDeErro(e, 'Não foi possível excluir.', 'excluir_ficha')),
  });

  const linkPedido = useRef(params.get('link'));
  useEffect(() => {
    const id = linkPedido.current;
    if (!id || isLoading) return;
    linkPedido.current = null;
    const f = fichas.find((x) => x.id === id && x.status === 'pendente');
    if (f) enviarLink.mutate(f);
    params.delete('link');
    setParams(params, { replace: true });
  }, [fichas, isLoading, params, setParams, enviarLink]);

  const lista = fichas.filter((f) => f.status === filtro);
  const contagem = (s: StatusFicha) => fichas.filter((f) => f.status === s).length;

  return (
    <div className="w-full space-y-4 md:space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2"><ClipboardSignature className="text-rose-600" /> Fichas e Termos</h2>
          <p className="text-sm text-slate-500 mt-1">Anamnese, fotodepilação e termo de consentimento preenchidos e assinados pela cliente no celular.</p>
        </div>
        <div className="flex gap-2 self-start md:self-auto">
          {admin && (
            <button type="button" onClick={() => setVisual(true)} className="px-4 py-2.5 rounded-xl font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-2">
              <Palette size={18} /> Modelos visuais
            </button>
          )}
          <button type="button" onClick={() => setNova(true)} className="bg-rose-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-rose-700 flex items-center gap-2 shadow-sm">
            <Plus size={18} /> Nova ficha
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {(['pendente', 'assinada', 'cancelada'] as StatusFicha[]).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={filtro === s} onClick={() => setFiltro(s)}
            className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${filtro === s ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {ROTULO_STATUS[s]} ({contagem(s)})
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Carregando...</p>}
      {error && <p className="text-sm text-red-600">{mensagemDeErro(error, 'Não foi possível carregar as fichas.', 'listar_fichas')}</p>}
      {!isLoading && !error && lista.length === 0 && (
        <p className="text-sm text-slate-500 bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center">Nenhuma ficha aqui.</p>
      )}

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lista.map((f) => (
          <li key={f.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-slate-800 truncate">{nomeCliente.get(f.client_id) ?? 'Cliente'}</p>
                <p className="text-sm text-slate-500">{ROTULO_TIPO[f.tipo]}</p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${COR_STATUS[f.status]}`}>{ROTULO_STATUS[f.status]}</span>
            </div>
            <p className="text-xs text-slate-500">
              {f.profissional_id ? `${nomeEquipe.get(f.profissional_id) ?? 'Profissional'} · ` : ''}
              {f.status === 'assinada' && f.assinado_em ? `assinada em ${dataCurta(f.assinado_em)}` : `criada em ${dataCurta(f.created_at)}`}
              {f.status === 'pendente' && f.token_expira_em && (new Date(f.token_expira_em) > new Date() ? ` · link até ${dataCurta(f.token_expira_em)}` : ' · link vencido')}
            </p>
            <div className="flex flex-wrap gap-2">
              {f.status === 'pendente' && (
                <button type="button" disabled={enviarLink.isPending} onClick={() => enviarLink.mutate(f)}
                  className="px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                  <Link2 size={14} /> {f.token_expira_em ? 'Novo link' : 'Gerar link'}
                </button>
              )}
              <Link to={`/fichas/${f.id}/imprimir`} target="_blank" rel="noopener"
                className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5">
                {f.status === 'assinada' ? <><FileText size={14} /> Ver / PDF</> : <><Eye size={14} /> Ver</>}
              </Link>
              {f.status !== 'cancelada' && (f.status === 'pendente' || admin) && (
                <button type="button" onClick={() => setCancelando(f)} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1.5">
                  <Ban size={14} /> Cancelar
                </button>
              )}
              {admin && f.status !== 'assinada' && (
                <button type="button" onClick={() => setExcluindo(f)} className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-bold flex items-center gap-1.5">
                  <Trash2 size={14} /> Excluir
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {nova && (
        <NovaFicha
          clientes={clientes} equipe={equipe} admin={admin} meuId={perfil?.id ?? null}
          tipoInicial={novaPadrao?.tipo} clienteInicial={novaPadrao?.cliente}
          onFechar={() => { setNova(false); if (params.get('nova')) { params.delete('nova'); params.delete('cliente'); setParams(params, { replace: true }); } }}
          onCriada={(f) => { setNova(false); setFiltro('pendente'); enviarLink.mutate(f); }}
        />
      )}
      {link && (
        <CompartilharLink dados={link} cliente={clientes.find((c) => c.id === link.ficha.client_id) ?? null}
          estabelecimento={perfil?.estabelecimento?.nome ?? null} onFechar={() => setLink(null)} onAviso={setAviso} />
      )}
      {cancelando && <CancelarFicha ficha={cancelando} onFechar={() => setCancelando(null)} onFeito={() => { setCancelando(null); void atualizar(); }} onAviso={setAviso} />}
      {excluindo && (
        <Confirmar titulo="Excluir ficha" texto="A ficha ainda não assinada será apagada. Esta ação não pode ser desfeita." botao="Excluir"
          ocupado={excluir.isPending} onCancelar={() => setExcluindo(null)} onConfirmar={() => excluir.mutate(excluindo.id)} />
      )}
      {visual && <ModelosVisuais onFechar={() => setVisual(false)} onAviso={setAviso} estabelecimento={perfil?.estabelecimento?.nome ?? 'Seu salão'} />}
      <Aviso texto={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}

function NovaFicha({ clientes, equipe, admin, meuId, onFechar, onCriada, tipoInicial, clienteInicial }: {
  clientes: { id: string; name: string }[];
  equipe: { id: string; name: string; apelido: string | null }[];
  admin: boolean;
  meuId: string | null;
  onFechar: () => void;
  onCriada: (f: FichaResumo) => void;
  tipoInicial?: TipoFicha;
  clienteInicial?: string;
}) {
  const [tipo, setTipo] = useState<TipoFicha>(tipoInicial ?? 'anamnese');
  const [busca, setBusca] = useState('');
  const [clienteId, setClienteId] = useState(clienteInicial ?? '');
  const [profissionalId, setProfissionalId] = useState(admin ? '' : meuId ?? '');
  const [dadosSalao, setDadosSalao] = useState<Respostas>({});
  const [erro, setErro] = useState<{ campo: string | null; mensagem: string } | null>(null);
  const esquema = MODELOS[tipo];
  const temCamposSalao = esquema.secoes.some((s) => s.campos.some((c) => c.origem === 'salao'));
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = (t ? clientes.filter((c) => c.name.toLowerCase().includes(t)) : clientes).slice(0, 50);
    // A cliente já escolhida (vinda da ficha dela) continua na lista.
    const escolhida = clientes.find((c) => c.id === clienteId);
    return escolhida && !lista.includes(escolhida) ? [escolhida, ...lista] : lista;
  }, [busca, clientes, clienteId]);

  const criar = useMutation({
    mutationFn: async () => {
      const limpos = limparRespostas(esquema, dadosSalao, 'salao');
      const id = await criarFicha({ client_id: clienteId, profissional_id: profissionalId || null, esquema, dados_salao: limpos });
      return { id, client_id: clienteId, profissional_id: profissionalId || null, tipo, titulo: esquema.titulo, status: 'pendente', token_expira_em: null, assinado_em: null, created_at: new Date().toISOString() } as FichaResumo;
    },
    onSuccess: onCriada,
    onError: (e) => setErro({ campo: null, mensagem: mensagemDeErro(e, 'Não foi possível criar a ficha.', 'criar_ficha') }),
  });

  const confirmar = () => {
    if (!clienteId) return setErro({ campo: null, mensagem: 'Escolha a cliente.' });
    const problema = validarRespostas(esquema, limparRespostas(esquema, dadosSalao, 'salao'), 'salao');
    if (problema) return setErro({ campo: problema.campo, mensagem: problema.mensagem });
    setErro(null);
    criar.mutate();
  };

  return (
    <Modal titulo="Nova ficha" onClose={onFechar} largura="md:max-w-[720px]" rodape={
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFechar} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg">Cancelar</button>
        <button type="button" onClick={confirmar} disabled={criar.isPending} className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
          {criar.isPending && <Loader2 size={16} className="animate-spin" />} Criar e gerar link
        </button>
      </div>
    }>
      <div className="space-y-5">
        <Campo rotulo="Documento" obrigatorio composto>
          <div className="grid gap-2 sm:grid-cols-3">
            {TIPOS_FICHA.map((t) => (
              <button key={t} type="button" aria-pressed={tipo === t} onClick={() => { setTipo(t); setDadosSalao({}); setErro(null); }}
                className={`p-3 rounded-xl border text-left text-sm font-semibold ${tipo === t ? 'border-rose-600 bg-rose-50 text-rose-800' : 'border-slate-200 text-slate-700'}`}>
                {ROTULO_TIPO[t]}
              </button>
            ))}
          </div>
        </Campo>
        <Campo rotulo="Cliente" obrigatorio composto dica="A cliente nova é cadastrada em Clientes.">
          <input type="search" placeholder="Buscar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} className={inputCls} />
          <select size={5} value={clienteId} onChange={(e) => { setClienteId(e.target.value); setErro(null); }} className={`${inputCls} mt-2`} aria-label="Cliente">
            {filtrados.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Campo>
        {admin && (
          <Campo rotulo="Profissional" dica="A profissional escolhida vê a ficha e as respostas de saúde.">
            <select value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)} className={inputCls}>
              <option value="">Nenhuma (só a administradora vê)</option>
              {equipe.map((m) => <option key={m.id} value={m.id}>{m.apelido || m.name}</option>)}
            </select>
          </Campo>
        )}
        {temCamposSalao && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-500">Dados do procedimento (a cliente vê e assina)</p>
            <FormularioFicha esquema={esquema} origem="salao" respostas={dadosSalao} onMudar={(r) => { setDadosSalao(r); setErro(null); }}
              tema={TEMAS.minimal} campoComErro={erro?.campo ?? null} />
          </div>
        )}
        {erro && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro.mensagem}</p>}
      </div>
    </Modal>
  );
}

function CompartilharLink({ dados, cliente, estabelecimento, onFechar, onAviso }: {
  dados: LinkGerado;
  cliente: { name: string; phone: string | null; contato_visivel: boolean } | null;
  estabelecimento: string | null;
  onFechar: () => void;
  onAviso: (t: string) => void;
}) {
  const texto = mensagemLink(cliente?.name ?? '', estabelecimento, dados.ficha.titulo, dados.link);
  const whats = cliente?.contato_visivel && cliente.phone && cliente.phone.replace(/\D/g, '').length >= 10
    ? linkWhatsapp(cliente.phone, texto)
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(dados.link); onAviso('Link copiado.'); } catch { onAviso('Não foi possível copiar. Selecione o link e copie.'); }
  };
  return (
    <Modal titulo="Link da ficha" onClose={onFechar}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Envie para {cliente?.name ?? 'a cliente'} ou abra neste aparelho para ela preencher agora. O link é pessoal, vale até {dataCurta(dados.expira)} e
          só pode ser usado uma vez. Gerar um novo link cancela este.
        </p>
        <input readOnly value={dados.link} onFocus={(e) => e.currentTarget.select()} className={`${inputCls} font-mono text-xs`} aria-label="Link da ficha" />
        <div className="grid gap-2 sm:grid-cols-3">
          <a href={whats} target="_blank" rel="noopener noreferrer" className="px-3 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2">
            <MessageCircle size={16} /> WhatsApp
          </a>
          <a href={dados.link} target="_blank" rel="noopener noreferrer" className="px-3 py-3 rounded-xl bg-rose-600 text-white text-sm font-bold flex items-center justify-center gap-2">
            <ExternalLink size={16} /> Abrir aqui
          </a>
          <button type="button" onClick={() => { void copiar(); }} className="px-3 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold flex items-center justify-center gap-2">
            <Copy size={16} /> Copiar
          </button>
        </div>
        <p className="text-xs text-slate-400">O salão não guarda o link, só uma assinatura dele. Se perder, gere outro.</p>
      </div>
    </Modal>
  );
}

function CancelarFicha({ ficha, onFechar, onFeito, onAviso }: { ficha: FichaResumo; onFechar: () => void; onFeito: () => void; onAviso: (t: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const cancelar = useMutation({
    mutationFn: () => cancelarFicha(ficha.id, motivo.trim()),
    onSuccess: onFeito,
    onError: (e) => onAviso(mensagemDeErro(e, 'Não foi possível cancelar.', 'cancelar_ficha')),
  });
  return (
    <Modal titulo="Cancelar ficha" onClose={onFechar} rodape={
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFechar} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg">Voltar</button>
        <button type="button" disabled={motivo.trim().length < 3 || cancelar.isPending} onClick={() => cancelar.mutate()}
          className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg disabled:opacity-50">Cancelar ficha</button>
      </div>
    }>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {ficha.status === 'assinada'
            ? 'A ficha assinada continua guardada como prova, marcada como cancelada. O link deixa de valer.'
            : 'O link deixa de valer e a cliente não consegue mais assinar.'}
        </p>
        <Campo rotulo="Motivo" obrigatorio>
          <textarea rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} />
        </Campo>
      </div>
    </Modal>
  );
}

function ModelosVisuais({ onFechar, onAviso, estabelecimento }: { onFechar: () => void; onAviso: (t: string) => void; estabelecimento: string }) {
  const queryClient = useQueryClient();
  const { data: prefs = {} } = useQuery({ queryKey: fichasKeys.preferencias, queryFn: listarPreferencias });
  const [previa, setPrevia] = useState<{ tipo: TipoFicha; tema: IdTema } | null>(null);
  const salvar = useMutation({
    mutationFn: ({ tipo, tema }: { tipo: TipoFicha; tema: IdTema }) => salvarPreferencia(tipo, tema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: fichasKeys.preferencias }),
    onError: (e) => onAviso(mensagemDeErro(e, 'Não foi possível salvar.', 'salvar_modelo_visual')),
  });

  return (
    <Modal titulo="Modelo visual de cada documento" onClose={onFechar} largura="md:max-w-[900px]">
      <div className="space-y-6">
        <p className="text-sm text-slate-600">Vale para as próximas fichas. As já criadas mantêm o modelo com que foram enviadas.</p>
        {TIPOS_FICHA.map((tipo) => {
          const atual = prefs[tipo] ?? 'classico';
          return (
            <section key={tipo} className="space-y-2">
              <h4 className="font-bold text-slate-800">{ROTULO_TIPO[tipo]}</h4>
              <div className="grid gap-2 sm:grid-cols-5">
                {LISTA_TEMAS.map((id) => {
                  const t = TEMAS[id];
                  return (
                    <div key={id} className={`rounded-xl border p-3 space-y-2 ${atual === id ? 'border-rose-600 ring-2 ring-rose-200' : 'border-slate-200'}`}>
                      <div className="flex h-6 overflow-hidden rounded-md">
                        {t.amostra.map((cor) => <span key={cor} className="flex-1" style={{ backgroundColor: cor }} />)}
                      </div>
                      <p className="text-sm font-bold text-slate-800">{t.nome}</p>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => setPrevia({ tipo, tema: id })} className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">Ver</button>
                        <button type="button" disabled={atual === id || salvar.isPending} onClick={() => salvar.mutate({ tipo, tema: id })}
                          className="flex-1 px-2 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold disabled:bg-slate-200 disabled:text-slate-500">
                          {atual === id ? 'Em uso' : 'Usar'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {previa && (
        <Modal titulo={`${ROTULO_TIPO[previa.tipo]}: ${TEMAS[previa.tema].nome}`} onClose={() => setPrevia(null)} largura="md:max-w-[820px]">
          <p className="text-xs text-slate-500 mb-3">{TEMAS[previa.tema].descricao} Exemplo com dados fictícios.</p>
          <div className={`${TEMAS[previa.tema].pagina} p-3 rounded-xl`}>
            <DocumentoFicha esquema={MODELOS[previa.tipo]} tema={TEMAS[previa.tema]} estabelecimento={estabelecimento} profissional="Profissional Exemplo"
              dadosSalao={EXEMPLO_SALAO[previa.tipo]} respostas={EXEMPLO_RESPOSTAS[previa.tipo]} mostrarAlertas
              assinatura={{ assinaturaCliente: null }} />
          </div>
        </Modal>
      )}
    </Modal>
  );
}
