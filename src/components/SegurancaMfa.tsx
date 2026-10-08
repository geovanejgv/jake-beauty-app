import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { codigoValido, confirmarCodigo, fatoresTotp, iniciarCadastro, mensagemMfa, removerFator, type Fator } from '../features/acesso/mfa';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { inputCls } from '../features/kanban/components/ui';

const traduzir = (e: unknown, padrao: string) => mensagemMfa((e as { code?: string })?.code) ?? mensagemDeErro(e, padrao, 'mfa');

/** Formulário de 6 dígitos reaproveitado no cadastro e na confirmação. */
export function CampoCodigo({ onConfirmar, ocupado, rotulo = 'Confirmar' }: { onConfirmar: (codigo: string) => void; ocupado: boolean; rotulo?: string }) {
  const [codigo, setCodigo] = useState('');
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (codigoValido(codigo)) onConfirmar(codigo); }}>
      <label className="flex-1 min-w-[160px]">
        <span className="block text-xs font-bold text-slate-500 mb-1">Código de 6 dígitos do aplicativo</span>
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={codigo} onChange={(e) => setCodigo(e.target.value)}
          className={`${inputCls} tracking-[0.3em] font-mono`} aria-label="Código do autenticador" />
      </label>
      <button type="submit" disabled={ocupado || !codigoValido(codigo)} className="px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-bold disabled:opacity-50">
        {ocupado ? 'Conferindo...' : rotulo}
      </button>
    </form>
  );
}

/** Configurações > Verificação em duas etapas: cadastrar, conferir e remover o autenticador. */
export default function SegurancaMfa({ onAviso }: { onAviso: (t: string) => void }) {
  const [fatores, setFatores] = useState<Fator[] | null>(null);
  const [cadastro, setCadastro] = useState<{ fatorId: string; qr: string; segredo: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try { setFatores(await fatoresTotp()); } catch (e) { setErro(traduzir(e, 'Não foi possível consultar a verificação em duas etapas.')); setFatores([]); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const executar = async (fn: () => Promise<void>) => {
    setOcupado(true); setErro(null);
    try { await fn(); } catch (e) { setErro(traduzir(e, 'Não foi possível concluir.')); } finally { setOcupado(false); }
  };
  const ativo = (fatores ?? []).find((f) => f.verificado);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4" aria-labelledby="titulo-mfa">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-rose-600" />
        <h3 id="titulo-mfa" className="font-bold text-slate-800">Verificação em duas etapas</h3>
      </div>
      <p className="text-xs text-slate-500">
        Além da senha, um código de 6 dígitos de um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password...).
        Obrigatória para a administração global.
      </p>
      {fatores === null ? <Loader2 className="animate-spin text-rose-400" size={18} /> : ativo ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
            <ShieldCheck size={16} /> Ativa
          </span>
          <button type="button" disabled={ocupado}
            onClick={() => executar(async () => { await removerFator(ativo.id); await carregar(); onAviso('Verificação em duas etapas removida.'); })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 disabled:opacity-60">
            <Trash2 size={15} /> Remover
          </button>
        </div>
      ) : cadastro ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">1. No aplicativo autenticador, leia o QR code (ou digite o código abaixo).</p>
          <div className="flex flex-wrap items-center gap-4">
            <img src={cadastro.qr} alt="QR code para o aplicativo autenticador" className="w-40 h-40 bg-white rounded-lg border border-slate-200 p-2" />
            <code className="text-xs break-all bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 max-w-xs">{cadastro.segredo}</code>
          </div>
          <p className="text-sm text-slate-700">2. Digite o código que o aplicativo mostrar.</p>
          <CampoCodigo ocupado={ocupado} rotulo="Ativar"
            onConfirmar={(codigo) => executar(async () => {
              await confirmarCodigo(cadastro.fatorId, codigo);
              setCadastro(null); await carregar(); onAviso('Verificação em duas etapas ativada.');
            })} />
        </div>
      ) : (
        <button type="button" disabled={ocupado} onClick={() => executar(async () => setCadastro(await iniciarCadastro()))}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-sm disabled:opacity-60">
          <ShieldCheck size={18} /> Ativar verificação em duas etapas
        </button>
      )}
      {erro && <p role="alert" className="text-sm text-rose-600">{erro}</p>}
    </section>
  );
}
