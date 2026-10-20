import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Loader2, MessageCircle, Save, Sparkles, Trash2 } from 'lucide-react';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { editarGeracao, excluirGeracao, type DiagnosticoIa, type GeracaoIa } from './api';
import { useDisponibilidadeIa } from './useIa';
import { nomeProvedor } from '../../../supabase/functions/ia/nucleo/catalogo.ts';

export const classeBotaoIa =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60';
export const classeBotaoSecundario =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60';

const LINK_CONFIGURACAO = '/configuracoes#integracao-ia';

/** Convite discreto quando a pessoa não usa IA (o recurso é opcional). */
export function ConviteIa() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-slate-400">
      <Sparkles size={13} className="text-violet-500" aria-hidden />
      <Link to={LINK_CONFIGURACAO} className="hover:text-violet-700 hover:underline">Ative a integração com IA em Configurações para usar este recurso.</Link>
    </p>
  );
}

/** Selo "Com IA" para títulos de tela; só aparece com IA ativa e chave válida. */
export function SeloIa({ texto }: { texto: string }) {
  const ia = useDisponibilidadeIa();
  if (!ia.ativa || !ia.chaveValida) return null;
  return (
    <span title={texto} className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 align-middle text-[11px] font-bold text-violet-700">
      <Sparkles size={12} aria-hidden /> Com IA<span className="sr-only">: {texto}</span>
    </span>
  );
}

/**
 * Moldura comum dos pontos de entrada de IA. Sem integração ativa mostra só o
 * convite; com integração, o conteúdo. Nunca bloqueia o resto da tela.
 */
export function PainelIa({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  const ia = useDisponibilidadeIa();
  if (ia.carregando) return null;
  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 space-y-3" aria-label={titulo}>
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles size={16} className="text-violet-600" aria-hidden />
        <h4 className="text-sm font-bold text-slate-800">{titulo}</h4>
        {ia.ativa && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">{ia.nomeProvedor}</span>}
      </div>
      {!ia.ativa ? <ConviteIa /> : (
        <>
          {!ia.chaveValida && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              A última chamada recusou a chave de API. <Link to={LINK_CONFIGURACAO} className="font-bold underline">Confira a integração</Link>.
            </p>
          )}
          {descricao && <p className="text-xs text-slate-500">{descricao}</p>}
          {children}
        </>
      )}
    </section>
  );
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Marca "gerado por IA" com provedor, modelo e data. */
export function SeloGeracao({ g }: { g: GeracaoIa }) {
  return (
    <p className="text-[11px] text-slate-400">
      Gerado por IA · {nomeProvedor(g.provider)} · {g.modelo} · {quando(g.created_at)}
      {g.revisado_em && <span className="ml-1 font-bold text-emerald-700">· revisado em {quando(g.revisado_em)}</span>}
    </p>
  );
}

export function Gerando({ texto = 'Gerando com IA; pode levar até um minuto.' }: { texto?: string }) {
  return (
    <p className="flex items-center gap-2 text-xs text-slate-500" role="status">
      <Loader2 size={14} className="animate-spin" /> {texto}
    </p>
  );
}

/** Falha com a linha de diagnóstico do provedor ("Status 401 | authentication_error"); nunca a chave. */
export function ErroIa({ mensagem, diagnostico }: { mensagem: string | null; diagnostico?: DiagnosticoIa | null }) {
  if (!mensagem) return null;
  const diag = diagnostico && /^[a-z0-9_]{1,60}$/.test(diagnostico.tipo) ? `Status ${diagnostico.status ?? 'sem resposta'} | ${diagnostico.tipo}` : null;
  return (
    <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
      <p>{mensagem}</p>
      {diag && <p className="mt-1 font-mono text-[11px] text-red-600/80">{diag}</p>}
    </div>
  );
}

/**
 * Mensagem gerada, editável antes do uso: "Salvar edição" grava o texto revisado;
 * "Marcar como revisado" registra que alguém da equipe conferiu. Texto puro (sem
 * HTML, LLM-09). Enviar é sempre um clique da pessoa no WhatsApp (LLM-03).
 */
export function EditorMensagem({ g, textoInicial, telefoneWhats, linkWhats, onAlterado }: {
  g: GeracaoIa;
  textoInicial: string;
  telefoneWhats?: string | null;
  linkWhats?: (telefone: string, texto: string) => string;
  onAlterado: (g: GeracaoIa | null) => void;
}) {
  const [texto, setTexto] = useState(g.conteudo_editado ?? textoInicial);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { setTexto(g.conteudo_editado ?? textoInicial); }, [g, textoInicial]);

  async function salvar(e: { conteudo_editado?: string; revisado?: boolean }, ok: string) {
    setOcupado(true);
    setAviso(null);
    try {
      onAlterado(await editarGeracao(g.id, e));
      setAviso(ok);
    } catch (erro) {
      setAviso(mensagemDeErro(erro, 'Não foi possível salvar.', 'ia.editor'));
    } finally {
      setOcupado(false);
    }
  }

  async function excluir() {
    if (!window.confirm('Excluir este resultado da IA?')) return;
    setOcupado(true);
    try {
      await excluirGeracao(g.id);
      onAlterado(null);
    } catch (erro) {
      setAviso(mensagemDeErro(erro, 'Não foi possível excluir.', 'ia.excluir'));
      setOcupado(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso('Copiado.');
    } catch {
      setAviso('Não foi possível copiar; selecione o texto.');
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-slate-600" htmlFor={`msg-${g.id}`}>Mensagem sugerida (editável)</label>
      <textarea id={`msg-${g.id}`} value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} maxLength={4000}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-400 focus:outline-none" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={ocupado} onClick={() => salvar({ conteudo_editado: texto }, 'Edição salva.')} className={classeBotaoSecundario}>
          <Save size={13} /> Salvar edição
        </button>
        <button type="button" disabled={ocupado} onClick={() => salvar({ conteudo_editado: texto, revisado: !g.revisado_em }, g.revisado_em ? 'Revisão desfeita.' : 'Marcado como revisado.')} className={classeBotaoSecundario}>
          <Check size={13} /> {g.revisado_em ? 'Desfazer revisão' : 'Marcar como revisado'}
        </button>
        <button type="button" onClick={copiar} className={classeBotaoSecundario}><Copy size={13} /> Copiar</button>
        {telefoneWhats && linkWhats && (
          <a href={linkWhats(telefoneWhats, texto)} target="_blank" rel="noreferrer noopener" className={classeBotaoSecundario}>
            <MessageCircle size={13} className="text-emerald-600" /> Abrir no WhatsApp
          </a>
        )}
        <button type="button" disabled={ocupado} onClick={excluir} className={`${classeBotaoSecundario} text-red-600`} aria-label="Excluir resultado da IA"><Trash2 size={13} /></button>
        {ocupado && <Loader2 size={14} className="animate-spin text-slate-400" aria-label="Salvando" />}
        {aviso && <span className="text-xs text-slate-500" role="status">{aviso}</span>}
      </div>
      <SeloGeracao g={g} />
      <p className="text-[11px] text-slate-400">Sugestão da IA: confira os fatos antes de usar. Nada é enviado sem o seu clique.</p>
    </div>
  );
}

/** Lista simples (texto puro). */
export function ListaIa({ titulo, itens, destaque = false }: { titulo: string; itens: string[]; destaque?: boolean }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className={`text-xs font-bold ${destaque ? 'text-amber-700' : 'text-slate-600'}`}>{titulo}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
        {itens.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
}
