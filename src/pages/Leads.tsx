import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Magnet, MessageCircle, Pencil, Plus, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { brl, dataLocal, isoParaBR, lerValor, valorParaCampo } from '../lib/formatos';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { Aviso, Campo, Modal, inputCls } from '../components/ui';
import { AvisoBackup } from '../features/backup/AvisoBackup';
import { PALAVRA_EXCLUSAO, confirmacaoExclusaoValida } from '../features/clientes/logic';
import {
  COR_ETAPA, ETAPAS_LEAD, ORIGENS_LEAD, ROTULO_ETAPA, ROTULO_ORIGEM, acaoAtrasada, dadosDoFormulario, indicadoresLeads,
  linkWhatsapp, mensagemBoasVindas, mensagemContato, opcoesDeInteresse, temTelefone, validarLead, type DadosLead, type EtapaLead, type Lead,
} from '../features/leads/logic';
import { TriagemLeadIa } from '../features/ia/TriagemLeadIa';
import { atualizarLead, criarLead, excluirLead, leadsKeys, listarEquipe, listarLeads, listarNomesServicos, moverLead } from '../features/leads/api';

/**
 * Leads: a possível cliente, do primeiro contato até virar cliente (funil em colunas).
 * Só a administradora acessa (rota e RLS). Regras de datas e motivo ficam no banco.
 */
export default function Leads() {
  const { perfil } = useAuth();
  const queryClient = useQueryClient();
  const hoje = dataLocal();
  const [editando, setEditando] = useState<Lead | 'novo' | null>(null);
  const [verPerdidos, setVerPerdidos] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const { data: leads = [], isLoading, error } = useQuery({ queryKey: leadsKeys.lista, queryFn: listarLeads });
  const { data: equipe = [] } = useQuery({ queryKey: leadsKeys.equipe, queryFn: listarEquipe });
  const { data: servicos = [] } = useQuery({ queryKey: leadsKeys.interesses, queryFn: listarNomesServicos });
  const nomeDe = useMemo(() => new Map(equipe.map((p) => [p.id, p.name])), [equipe]);
  const interesses = useMemo(() => opcoesDeInteresse(servicos, leads.map((l) => l.interesse)), [servicos, leads]);

  const porEtapa = useMemo(() => {
    const m = new Map<EtapaLead, Lead[]>(ETAPAS_LEAD.map((e) => [e, []]));
    for (const l of leads) m.get(l.etapa)?.push(l);
    return m;
  }, [leads]);
  const ind = indicadoresLeads(leads, hoje);
  const colunas = ETAPAS_LEAD.filter((e) => e !== 'perdido' || verPerdidos);
  const atualizar = () => queryClient.invalidateQueries({ queryKey: leadsKeys.lista });

  const mover = useMutation({
    mutationFn: ({ id, etapa }: { id: string; etapa: EtapaLead }) => moverLead(id, etapa),
    onSuccess: atualizar,
    onError: (e) => setAviso(mensagemDeErro(e, 'Não foi possível mover o lead.', 'leads.mover')),
  });
  const aoMover = (l: Lead, etapa: EtapaLead) => {
    if (etapa === l.etapa) return;
    // Perdido pede o motivo: abre o formulário já na etapa.
    if (etapa === 'perdido') setEditando({ ...l, etapa });
    else mover.mutate({ id: l.id, etapa });
  };

  const assinatura = perfil?.name ?? null;
  const estabelecimento = perfil?.estabelecimento?.nome ?? null;

  return (
    <div className="w-full space-y-4 md:space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2"><Magnet className="text-rose-600" /> Leads</h2>
          <p className="text-sm text-slate-500 mt-1">Controle da possível cliente, do primeiro contato até virar cliente.</p>
        </div>
        <button type="button" onClick={() => setEditando('novo')} className="self-start md:self-auto bg-rose-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-rose-700 flex items-center gap-2 shadow-sm">
          <Plus size={18} /> Novo lead
        </button>
      </div>

      <AvisoBackup tipo="leads" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Indicador titulo="Em andamento" valor={String(ind.emAndamento)} />
        <Indicador titulo="Valor em negociação" valor={brl(ind.valorEmNegociacao)} />
        <Indicador titulo="Fecharam" valor={String(ind.fechados)} detalhe={ind.conversao === null ? undefined : `${ind.conversao}% de conversão`} />
        <Indicador titulo="Próxima ação atrasada" valor={String(ind.atrasados)} alerta={ind.atrasados > 0} />
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={verPerdidos} onChange={(e) => setVerPerdidos(e.target.checked)} className="w-4 h-4 accent-rose-600" />
        Mostrar perdidos ({ind.perdidos})
      </label>

      {error && <p className="text-sm text-red-600">{mensagemDeErro(error, 'Não foi possível carregar os leads.', 'leads.lista')}</p>}
      {isLoading ? <p className="text-center text-slate-400 py-12">Carregando...</p> : (
        <div className="flex gap-3 overflow-x-auto pb-3 snap-x md:snap-none">
          {colunas.map((etapa) => {
            const lista = porEtapa.get(etapa)!;
            const soma = lista.reduce((s, l) => s + (l.valor_estimado ?? 0), 0);
            return (
              <section key={etapa} aria-label={ROTULO_ETAPA[etapa]}
                className={`w-[85vw] sm:w-72 shrink-0 snap-center flex flex-col rounded-2xl border border-slate-200 border-t-4 bg-slate-100 ${COR_ETAPA[etapa]}`}>
                <header className="flex items-baseline justify-between gap-2 px-3 pt-3 pb-2">
                  <h3 className="text-sm font-bold text-slate-800">{ROTULO_ETAPA[etapa]} <span className="font-normal text-slate-500">({lista.length})</span></h3>
                  {soma > 0 && <span className="text-xs text-slate-500">{brl(soma)}</span>}
                </header>
                <div className="flex flex-1 flex-col gap-2 px-2 pb-3">
                  {lista.length === 0 && <p className="px-1 text-xs text-slate-400">Nenhum lead nesta etapa.</p>}
                  {lista.map((l) => (
                    <CartaoLead key={l.id} lead={l} hoje={hoje} responsavel={l.responsavel_id ? nomeDe.get(l.responsavel_id) ?? null : null}
                      textoWhats={l.etapa === 'fechado' ? mensagemBoasVindas(l.nome, estabelecimento, assinatura) : mensagemContato(l.nome, estabelecimento, assinatura)}
                      onEditar={() => setEditando(l)} onMover={(e) => aoMover(l, e)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {editando && (
        <FormLead lead={editando === 'novo' ? null : editando} equipe={equipe} interesses={interesses}
          onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); void atualizar(); }} />
      )}
      <Aviso texto={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}

function Indicador({ titulo, valor, detalhe, alerta = false }: { titulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-1 text-xl md:text-2xl font-black ${alerta ? 'text-red-600' : 'text-slate-800'}`}>{valor}</p>
      {detalhe && <p className="text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

function CartaoLead({ lead: l, hoje, responsavel, textoWhats, onEditar, onMover }: {
  lead: Lead; hoje: string; responsavel: string | null; textoWhats: string; onEditar: () => void; onMover: (e: EtapaLead) => void;
}) {
  const fechado = l.etapa === 'fechado';
  const atrasada = acaoAtrasada(l, hoje);
  return (
    <article className="bg-white rounded-xl border border-slate-200 p-3 text-sm shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-slate-800 break-words">{l.nome}</p>
        <button type="button" onClick={onEditar} aria-label={`Editar ${l.nome}`} className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-600">
          <Pencil size={15} />
        </button>
      </div>
      <p className="text-xs text-slate-500">{[l.interesse, l.origem ? ROTULO_ORIGEM[l.origem] : null].filter(Boolean).join(' · ') || 'Sem interesse informado'}</p>
      {l.resumo && <p className="mt-1 line-clamp-3 text-xs text-slate-600 whitespace-pre-wrap">{l.resumo}</p>}
      {l.valor_estimado !== null && <p className="mt-1 text-xs font-bold text-slate-700">{brl(l.valor_estimado)}</p>}
      {l.proxima_acao && !fechado && (
        <p className={`mt-1 flex items-center gap-1 text-xs ${atrasada ? 'font-bold text-red-600' : 'text-slate-600'}`}>
          <CalendarClock size={12} className="shrink-0" /> {l.proxima_acao}{l.proxima_acao_em ? ` (${isoParaBR(l.proxima_acao_em)})` : ''}
        </p>
      )}
      {l.etapa === 'perdido' && l.motivo_perda && <p className="mt-1 text-xs text-red-600">Motivo: {l.motivo_perda}</p>}
      {fechado && l.fechado_em && <p className="mt-1 text-xs text-emerald-700">Fechou em {new Date(l.fechado_em).toLocaleDateString('pt-BR')}</p>}
      {responsavel && <p className="mt-1 text-[11px] text-slate-500">Responsável: {responsavel}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {temTelefone(l.telefone) && (
          <a href={linkWhatsapp(l.telefone, textoWhats)} target="_blank" rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${fechado ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-emerald-600 text-emerald-700 hover:bg-emerald-50'}`}>
            <MessageCircle size={12} /> {fechado ? 'Chamar no WhatsApp' : 'WhatsApp'}
          </a>
        )}
        {fechado && l.client_id && (
          <Link to={`/clientes?cliente=${l.client_id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <UserCheck size={12} /> Ver cliente
          </Link>
        )}
        {fechado && !l.client_id && (
          <Link to={`/clientes?nova=cliente&lead=${l.id}`} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50">
            <UserPlus size={12} /> Cadastrar como cliente
          </Link>
        )}
      </div>
      {fechado && !temTelefone(l.telefone) && <p className="mt-1 text-[11px] text-slate-500">Cadastre o telefone para chamar no WhatsApp.</p>}

      <select value={l.etapa} onChange={(e) => onMover(e.target.value as EtapaLead)} aria-label={`Mover ${l.nome} para a etapa`}
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
        {ETAPAS_LEAD.map((e) => <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>)}
      </select>
    </article>
  );
}

type Campos = Record<keyof DadosLead, string>;

function FormLead({ lead, equipe, interesses, onFechar, onSalvo }: {
  lead: Lead | null; equipe: { id: string; name: string }[]; interesses: string[]; onFechar: () => void; onSalvo: () => void;
}) {
  const [f, setF] = useState<Campos>(() => ({
    nome: lead?.nome ?? '', telefone: lead?.telefone ?? '', email: lead?.email ?? '', origem: lead?.origem ?? '',
    interesse: lead?.interesse ?? '', resumo: lead?.resumo ?? '', etapa: lead?.etapa ?? 'novo',
    valor_estimado: valorParaCampo(lead?.valor_estimado), proxima_acao: lead?.proxima_acao ?? '',
    proxima_acao_em: lead?.proxima_acao_em ?? '', motivo_perda: lead?.motivo_perda ?? '', responsavel_id: lead?.responsavel_id ?? '',
  }));
  const [erro, setErro] = useState<string | null>(null);
  // Exclusão em duas etapas, como em Clientes: confirmar e digitar a palavra.
  const [exclusao, setExclusao] = useState<0 | 1 | 2>(0);
  const [textoExclusao, setTextoExclusao] = useState('');
  const muda = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  const salvar = useMutation({
    mutationFn: async () => {
      const valor = f.valor_estimado.trim() ? lerValor(f.valor_estimado) : null;
      if (f.valor_estimado.trim() && valor === null) throw new Error('valor');
      const dados = dadosDoFormulario(f, valor);
      const invalido = validarLead(dados);
      if (invalido) throw new Error(invalido);
      if (lead) await atualizarLead(lead.id, dados);
      else await criarLead(dados);
    },
    onSuccess: onSalvo,
    onError: (e) => {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'valor') return setErro('Valor estimado inválido. Use, por exemplo, 150,00.');
      if (e instanceof Error && !('code' in e)) return setErro(msg);
      setErro(mensagemDeErro(e, 'Não foi possível salvar o lead.', 'leads.salvar'));
    },
  });
  const excluir = useMutation({
    mutationFn: () => excluirLead(lead!.id),
    onSuccess: onSalvo,
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível excluir o lead.', 'leads.excluir')),
  });

  if (lead && exclusao > 0) {
    return (
      <Modal titulo="Excluir lead?" onClose={() => setExclusao(0)} largura="md:max-w-[420px]">
        <div className="text-center space-y-3">
          <div className="flex justify-center text-red-500"><AlertTriangle size={40} /></div>
          {exclusao === 1 ? (
            <>
              <p className="text-sm text-slate-600">Tem certeza que deseja excluir permanentemente o lead <strong>{lead.nome}</strong>?</p>
              <p className="text-xs text-slate-400">Etapa 1 de 2</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setExclusao(0)} className="flex-1 border border-slate-200 p-2.5 rounded-xl text-slate-600 font-medium">Voltar</button>
                <button type="button" onClick={() => setExclusao(2)} className="flex-1 bg-red-600 text-white p-2.5 rounded-xl font-bold">Sim, continuar</button>
              </div>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (confirmacaoExclusaoValida(textoExclusao)) excluir.mutate(); }} className="space-y-3">
              <p className="text-sm text-slate-600">Para confirmar, digite <strong className="text-red-600">{PALAVRA_EXCLUSAO}</strong> abaixo.</p>
              <input value={textoExclusao} onChange={(e) => setTextoExclusao(e.target.value)} autoFocus autoComplete="off" aria-label={`Digite ${PALAVRA_EXCLUSAO} para confirmar`}
                className={`${inputCls} text-center font-bold tracking-widest uppercase`} />
              <p className="text-xs text-slate-400">Etapa 2 de 2</p>
              {erro && <p className="text-sm text-red-600">{erro}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setExclusao(0)} className="flex-1 border border-slate-200 p-2.5 rounded-xl text-slate-600 font-medium">Cancelar</button>
                <button type="submit" disabled={!confirmacaoExclusaoValida(textoExclusao) || excluir.isPending} className="flex-1 bg-red-600 text-white p-2.5 rounded-xl font-bold disabled:opacity-40">
                  {excluir.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo={lead ? 'Editar lead' : 'Novo lead'} onClose={onFechar}
      rodape={
        <div className="flex items-center gap-2">
          {lead && (
            <button type="button" onClick={() => { setTextoExclusao(''); setErro(null); setExclusao(1); }} className="mr-auto inline-flex items-center gap-1 text-sm font-bold text-red-600 hover:underline">
              <Trash2 size={15} /> Excluir
            </button>
          )}
          <button type="button" onClick={onFechar} className="ml-auto px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-600">Cancelar</button>
          <button type="submit" form="form-lead" disabled={salvar.isPending} className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-bold disabled:opacity-50">
            {salvar.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      }>
      <form id="form-lead" onSubmit={(e) => { e.preventDefault(); setErro(null); salvar.mutate(); }} className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2"><Campo rotulo="Nome" obrigatorio><input value={f.nome} onChange={muda('nome')} required minLength={2} maxLength={200} className={inputCls} /></Campo></div>
        <Campo rotulo="Telefone (WhatsApp)"><input value={f.telefone} onChange={muda('telefone')} inputMode="tel" maxLength={30} placeholder="(11) 9 0000-0000" className={inputCls} /></Campo>
        <Campo rotulo="E-mail"><input value={f.email} onChange={muda('email')} type="email" maxLength={200} className={inputCls} /></Campo>
        <Campo rotulo="Como chegou">
          <select value={f.origem} onChange={muda('origem')} className={inputCls}>
            <option value="">Não informado</option>
            {ORIGENS_LEAD.map((o) => <option key={o} value={o}>{ROTULO_ORIGEM[o]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Interesse" dica="Serviço que a cliente procura.">
          <input value={f.interesse} onChange={muda('interesse')} list="lead-interesses" maxLength={80} placeholder="Ex.: Design de sobrancelhas" className={inputCls} />
          <datalist id="lead-interesses">{interesses.map((i) => <option key={i} value={i} />)}</datalist>
        </Campo>
        <div className="md:col-span-2"><Campo rotulo="Resumo"><textarea value={f.resumo} onChange={muda('resumo')} rows={3} maxLength={4000} className={`${inputCls} resize-none`} /></Campo></div>
        <Campo rotulo="Etapa">
          <select value={f.etapa} onChange={muda('etapa')} className={inputCls}>
            {ETAPAS_LEAD.map((e) => <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Valor estimado (R$)"><input value={f.valor_estimado} onChange={muda('valor_estimado')} inputMode="decimal" placeholder="0,00" className={inputCls} /></Campo>
        {f.etapa === 'perdido' && (
          <div className="md:col-span-2"><Campo rotulo="Motivo da perda"><input value={f.motivo_perda} onChange={muda('motivo_perda')} maxLength={500} placeholder="Ex.: achou caro, fechou com outro salão" className={inputCls} /></Campo></div>
        )}
        <Campo rotulo="Próxima ação"><input value={f.proxima_acao} onChange={muda('proxima_acao')} maxLength={300} placeholder="Ex.: enviar orçamento" className={inputCls} /></Campo>
        <Campo rotulo="Data da próxima ação"><input value={f.proxima_acao_em} onChange={muda('proxima_acao_em')} type="date" className={inputCls} /></Campo>
        <div className="md:col-span-2">
          <Campo rotulo="Responsável">
            <select value={f.responsavel_id} onChange={muda('responsavel_id')} className={inputCls}>
              <option value="">{lead ? 'Sem responsável' : 'Eu mesma(o)'}</option>
              {equipe.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Campo>
        </div>
        {erro && <p role="alert" className="md:col-span-2 text-sm text-red-600">{erro}</p>}
      </form>
      {lead && (
        <div className="mt-4">
          <TriagemLeadIa leadId={lead.id} telefone={lead.telefone} onUsarProximoPasso={(texto) => setF((v) => ({ ...v, proxima_acao: texto }))} />
        </div>
      )}
    </Modal>
  );
}
