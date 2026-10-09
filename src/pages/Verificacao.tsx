import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CampoCodigo } from '../components/SegurancaMfa';
import { confirmarCodigo, fatoresTotp, mensagemMfa } from '../features/acesso/mfa';
import { registrarAuditoria } from '../lib/seguranca/auditoria';
import { mensagemDeErro } from '../lib/seguranca/erros';

/**
 * Tela de verificação logo depois do login (seção 5.9.1): quem tem autenticador ativo
 * digita o código antes de usar o portal. Fica no lugar da tela pedida (a URL não muda);
 * confirmado o código, a sessão vira aal2 e a própria tela pedida aparece.
 */
export default function Verificacao() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [fatorId, setFatorId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const nome = String(user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '').trim().split(/\s+/)[0];

  useEffect(() => {
    fatoresTotp()
      .then((lista) => setFatorId(lista.find((f) => f.verificado)?.id ?? null))
      .catch((e) => setErro(mensagemDeErro(e, 'Não foi possível consultar o autenticador.', 'verificacao')));
  }, []);

  const confirmar = async (codigo: string) => {
    if (!fatorId) return;
    setOcupado(true); setErro(null);
    try {
      await confirmarCodigo(fatorId, codigo);
      await registrarAuditoria('mfa_verificado');
      // O contexto recebe o aviso do Supabase e libera a tela pedida.
    } catch (e) {
      await registrarAuditoria('mfa_falhou');
      setErro(mensagemMfa((e as { code?: string })?.code) ?? 'Código inválido ou expirado.');
      setOcupado(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-5">
        <div className="text-center space-y-2">
          <p className="text-2xl font-bold text-slate-900">Jake Beauty</p>
          <h1 className="text-lg font-bold text-slate-800 flex items-center justify-center gap-2"><ShieldCheck className="text-rose-600" size={20} /> Verificação em duas etapas</h1>
          <p className="text-sm text-slate-600">
            {nome ? `Olá, ${nome}. ` : ''}Abra o aplicativo autenticador e digite o código de 6 dígitos.
          </p>
        </div>
        {fatorId === null && !erro ? (
          <div className="flex justify-center"><Loader2 className="animate-spin text-rose-500" size={24} /></div>
        ) : fatorId && (
          <CampoCodigo grande ocupado={ocupado} onConfirmar={(c) => { void confirmar(c); }} />
        )}
        {erro && <p role="alert" className="text-sm text-rose-600 text-center">{erro}</p>}
        <button type="button" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
          className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50">
          Sair e entrar com outra conta
        </button>
        <p className="text-xs text-slate-500 text-center">
          Perdeu o celular ou trocou de aparelho? Peça à administradora do estabelecimento para redefinir a sua verificação em duas etapas.
        </p>
      </div>
    </div>
  );
}
