import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { codigoValido, confirmarCodigo, fatoresTotp, iniciarCadastro, mensagemMfa, podeRemover, removerFator, type Fator } from '../features/acesso/mfa';
import { useAuth } from '../contexts/AuthContext';
import { registrarAuditoria } from '../lib/seguranca/auditoria';
import { ErroPublico, mensagemDeErro } from '../lib/seguranca/erros';
import { inputCls } from '../features/kanban/components/ui';

const traduzir = (e: unknown, padrao: string) => mensagemMfa((e as { code?: string })?.code) ?? mensagemDeErro(e, padrao, 'mfa');

/** Formulário de 6 dígitos reaproveitado no cadastro, na confirmação e na tela de verificação. */
export function CampoCodigo({ onConfirmar, ocupado, rotulo = 'Confirmar', grande = false }: { onConfirmar: (codigo: string) => void; ocupado: boolean; rotulo?: string; grande?: boolean }) {
  const [codigo, setCodigo] = useState('');
  return (
    <form className={grande ? 'space-y-3' : 'flex flex-wrap items-end gap-2'} onSubmit={(e) => { e.preventDefault(); if (codigoValido(codigo)) onConfirmar(codigo); }}>
      <label className={grande ? 'block' : 'flex-1 min-w-[160px]'}>
        <span className="block text-xs font-bold text-slate-500 mb-1">Código do autenticador</span>
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus={grande}
          className={`${inputCls} font-mono ${grande ? 'text-center text-2xl tracking-[0.5em] py-3' : 'tracking-[0.3em]'}`} aria-label="Código do autenticador" />
      </label>
      <button type="submit" disabled={ocupado || !codigoValido(codigo)} className={`${grande ? 'w-full py-3' : 'px-4 py-2.5'} rounded-lg bg-rose-600 text-white text-sm font-bold disabled:opacity-50`}>
        {ocupado ? 'Conferindo...' : rotulo}
      </button>
    </form>
  );
}

/**
 * Configurações > Segurança (seção 5.9): verificação em duas etapas com aplicativo
 * autenticador. Cadastrar outro e remover exigem a sessão em aal2 (M-02, M-03; o
 * Supabase Auth também confere); administradora não fica sem autenticador.
 */
export default function SegurancaMfa({ onAviso }: { onAviso: (t: string) => void }) {
  const { perfil, nivel, atualizarNivel } = useAuth();
  const ehAdmin = perfil?.role === 'admin';
  const [fatores, setFatores] = useState<Fator[] | null>(null);
  const [cadastro, setCadastro] = useState<{ fatorId: string; qr: string; segredo: string } | null>(null);
  const [removendo, setRemovendo] = useState<Fator | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try { setFatores(await fatoresTotp()); } catch (e) { setErro(traduzir(e, 'Não foi possível consultar a verificação em duas etapas.')); setFatores([]); }
    await atualizarNivel();
  }, [atualizarNivel]);
  useEffect(() => { void carregar(); }, [carregar]);

  const executar = async (fn: () => Promise<void>) => {
    setOcupado(true); setErro(null);
    try { await fn(); } catch (e) { setErro(traduzir(e, 'Não foi possível concluir.')); } finally { setOcupado(false); }
  };
  const verificados = (fatores ?? []).filter((f) => f.verificado);
  const ativa = verificados.length > 0;
  const aal2 = nivel.atual === 'aal2';

  const confirmarSessao = (codigo: string) => executar(async () => {
    try { await confirmarCodigo(verificados[0].id, codigo); } catch (e) { await registrarAuditoria('mfa_falhou'); throw e; }
    await registrarAuditoria('mfa_verificado');
    await carregar();
    onAviso('Código confirmado. Esta sessão está protegida com MFA.');
  });

  const ativarNovo = (codigo: string) => executar(async () => {
    if (!cadastro) return;
    try { await confirmarCodigo(cadastro.fatorId, codigo); } catch (e) { await registrarAuditoria('mfa_falhou'); throw e; }
    await registrarAuditoria('mfa_ativado');
    setCadastro(null);
    await carregar();
    onAviso('Código confirmado. Esta sessão está protegida com MFA.');
  });

  const remover = (f: Fator) => executar(async () => {
    const motivo = podeRemover({ ehAdmin, aal2, verificados: verificados.length });
    if (motivo) throw new ErroPublico(motivo);
    await removerFator(f.id);
    await registrarAuditoria('mfa_removido');
    setRemovendo(null);
    await carregar();
    onAviso('Autenticador removido.');
  });

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4" aria-labelledby="titulo-mfa">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck size={18} className="text-rose-600" />
        <h3 id="titulo-mfa" className="font-bold text-slate-800">
          {fatores === null ? 'Verificação em duas etapas' : ativa ? 'Verificação em duas etapas ativa' : 'Verificação em duas etapas desativada'}
        </h3>
        <span title="Nível da sessão atual"
          className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full border ${aal2 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
          {aal2 ? 'aal2' : 'aal1'}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Verificação em duas etapas (MFA) com aplicativo autenticador: Google Authenticator, Microsoft Authenticator, Authy, 1Password etc.
        Com ela ativa, o código é pedido logo depois de cada login.
      </p>
      {ehAdmin && (
        <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Para administradoras, o MFA é <strong>obrigatório</strong>: criar acessos, alterar papel ou status da equipe e consultar os logs só funcionam depois de confirmar o código do autenticador nesta sessão.
        </p>
      )}

      {fatores === null ? <Loader2 className="animate-spin text-rose-400" size={18} /> : cadastro ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">1. No aplicativo autenticador, leia o QR code (ou digite a chave abaixo).</p>
          <div className="flex flex-wrap items-center gap-4">
            <img src={cadastro.qr} alt="QR code para o aplicativo autenticador" className="w-40 h-40 bg-white rounded-lg border border-slate-200 p-2" />
            <code className="text-xs break-all bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 max-w-xs">{cadastro.segredo}</code>
          </div>
          <p className="text-sm text-slate-700">2. Digite o código que o aplicativo mostrar.</p>
          <CampoCodigo ocupado={ocupado} rotulo="Confirmar" onConfirmar={(c) => { void ativarNovo(c); }} />
          <button type="button" onClick={() => setCadastro(null)} className="text-xs font-bold text-slate-500 hover:underline">Cancelar</button>
        </div>
      ) : !ativa ? (
        <button type="button" disabled={ocupado} onClick={() => executar(async () => setCadastro(await iniciarCadastro()))}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-sm disabled:opacity-60">
          <ShieldCheck size={18} /> Ativar verificação em duas etapas
        </button>
      ) : !aal2 ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">Digite o código do autenticador para proteger esta sessão (aal2).</p>
          <CampoCodigo ocupado={ocupado} onConfirmar={(c) => { void confirmarSessao(c); }} />
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {verificados.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{f.nome ?? 'Autenticador'}</span>
                {removendo?.id === f.id ? (
                  <span className="flex items-center gap-2">
                    <button type="button" disabled={ocupado} onClick={() => { void remover(f); }} className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-60">Confirmar remoção</button>
                    <button type="button" onClick={() => setRemovendo(null)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600">Cancelar</button>
                  </span>
                ) : (
                  <button type="button" disabled={ocupado} onClick={() => { setErro(null); setRemovendo(f); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 disabled:opacity-60">
                    <Trash2 size={13} /> Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button type="button" disabled={ocupado} onClick={() => executar(async () => setCadastro(await iniciarCadastro()))}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-60">
            <Plus size={15} /> Cadastrar outro autenticador
          </button>
        </div>
      )}
      {erro && <p role="alert" className="text-sm text-rose-600">{erro}</p>}
      <p className="text-xs text-slate-500">
        Perdeu o celular ou trocou de aparelho? Peça à administradora do estabelecimento para usar "Redefinir 2 etapas" na tela Profissionais.
        Você cadastra um novo autenticador no próximo login.
      </p>
    </section>
  );
}
