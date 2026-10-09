import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, ShieldCheck, Sparkles, Users, Wallet, type LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { guardarDestino } from '../lib/seguranca/redirecionamento';
import { logger } from '../lib/seguranca/logger';

/** Mensagens pela query ?erro= (seção 5.3 da especificação). Texto neutro: não diz se a conta existe. */
export const MENSAGENS_LOGIN: Record<string, string> = {
  'sem-acesso': 'Sua conta ainda não tem acesso. Peça à administradora do estabelecimento para cadastrar seu e-mail.',
  inatividade: 'Sua sessão foi encerrada depois de 30 minutos sem uso. Entre novamente.',
  falha: 'Não foi possível concluir o login. Tente novamente.',
  limite: 'Muitas tentativas. Aguarde alguns minutos.',
  'estabelecimento-inativo': 'O acesso deste estabelecimento está desativado. Fale com o suporte.',
};

/** Destaques do portal na apresentação (só texto: o acesso continua restrito). */
const RECURSOS: { icone: LucideIcon; titulo: string; texto: string }[] = [
  { icone: CalendarClock, titulo: 'Agenda por profissional', texto: 'Horários, encaixes e conflitos sob controle, para cada profissional.' },
  { icone: Users, titulo: 'Clientes e pacotes', texto: 'Histórico de cada cliente, pacotes de sessões e retornos.' },
  { icone: Wallet, titulo: 'Comissões e financeiro', texto: 'PDV, comissões, fechamentos assinados e resultado do mês.' },
  { icone: ShieldCheck, titulo: 'Segurança', texto: 'Login Google, segundo fator e trilha de auditoria.' },
];

/** Logo do Google (marca oficial em SVG, sem recurso externo). */
function LogoGoogle() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

/**
 * Único jeito de entrar: "Continuar com Google" (L-01 adaptado). Não há formulário de
 * e-mail e senha. Só entra quem a administradora cadastrou (o retorno confere o perfil).
 */
export default function Login() {
  const [params] = useSearchParams();
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(MENSAGENS_LOGIN[params.get('erro') ?? ''] ?? null);

  const entrar = async () => {
    setIndo(true);
    setErro(null);
    guardarDestino(params.get('redirectTo'));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: 'select_account' } },
    });
    if (error) {
      logger.warn('Falha ao iniciar o login com o Google', { codigo: error.code ?? null });
      setErro(error.status === 429 ? MENSAGENS_LOGIN.limite : MENSAGENS_LOGIN.falha);
      setIndo(false);
    }
    // Sem erro, o navegador já está indo para o Google.
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden text-[#f8eef2]"
      style={{
        backgroundColor: '#1a0f1c',
        backgroundImage: [
          'radial-gradient(60rem 40rem at 15% 10%, rgba(225, 29, 72, 0.22), transparent 60%)',
          'radial-gradient(50rem 36rem at 90% 85%, rgba(168, 85, 247, 0.18), transparent 60%)',
          'linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: 'auto, auto, 56px 56px, 56px 56px',
      }}
    >
      {/* Marca */}
      <header className="relative flex flex-col items-center pt-8 sm:pt-10 px-4">
        <div className="flex items-center gap-4">
          <span className="grid place-items-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border border-[#f4a6bd]/40 bg-[#e11d48]/10 shadow-[0_0_40px_rgba(225,29,72,0.25)]">
            <Sparkles className="text-[#f4a6bd]" size={28} aria-hidden="true" />
          </span>
          <div>
            <p className="font-serif text-4xl sm:text-5xl font-bold leading-none text-[#f4a6bd]">Jake Beauty</p>
            <p className="mt-2 text-[11px] sm:text-xs font-semibold tracking-[0.35em] text-[#d9a7b8]">GESTÃO DE SALÃO</p>
          </div>
        </div>
        <div className="mt-5 h-px w-72 max-w-full bg-gradient-to-r from-transparent via-[#f4a6bd]/50 to-transparent" />
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-10 sm:py-16 grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:items-center">
        {/* Apresentação */}
        <section className="order-2 lg:order-1 space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#f4a6bd]/40 bg-[#e11d48]/10 px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-[#f4a6bd]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f4a6bd]" aria-hidden="true" /> PLATAFORMA PARA SALÕES DE BELEZA
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-[#fff7fa]">
            Gestão do seu salão com <span className="text-[#f4a6bd]">elegância</span>: agenda organizada e clientes encantadas.
          </h1>
          <p className="max-w-xl text-sm sm:text-base leading-relaxed text-[#d8c3cc]">
            Agenda por profissional, clientes, pacotes, PDV, comissões e financeiro integrados em um único portal,
            com acesso restrito e dados protegidos.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {RECURSOS.map(({ icone: Icone, titulo, texto }) => (
              <li key={titulo} className="flex gap-3 rounded-xl border border-[#ffffff]/10 bg-[#ffffff]/[0.04] p-4">
                <span className="grid place-items-center shrink-0 w-9 h-9 rounded-lg border border-[#f4a6bd]/30 bg-[#e11d48]/10">
                  <Icone size={18} className="text-[#f4a6bd]" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#fff7fa]">{titulo}</p>
                  <p className="text-xs leading-snug text-[#c9b3bd]">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Acesso */}
        <section aria-labelledby="titulo-acesso" className="order-1 lg:order-2 w-full max-w-md mx-auto rounded-2xl border border-[#ffffff]/10 bg-[#2a1a2c]/80 p-7 sm:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur">
          <h2 id="titulo-acesso" className="font-serif text-2xl font-bold text-center text-[#fff7fa]">Acesso ao estabelecimento</h2>
          <p className="mt-2 text-sm text-center text-[#d8c3cc]">Entre com a conta Google cadastrada pelo estabelecimento.</p>

          {erro && (
            <div role="alert" className="mt-5 rounded-lg border border-[#fb7185]/40 bg-[#e11d48]/15 p-3 text-sm text-center text-[#fecdd3]">
              {erro}
            </div>
          )}

          <button
            type="button"
            onClick={() => { void entrar(); }}
            disabled={indo}
            className="mt-6 w-full flex items-center justify-center gap-3 rounded-xl bg-[#ffffff] hover:bg-[#fff1f4] py-3 px-4 font-bold text-[#1f1320] shadow-sm transition-colors disabled:opacity-60"
          >
            <LogoGoogle />
            {indo ? 'Abrindo o Google...' : 'Continuar com Google'}
          </button>

          <div className="mt-6 pt-5 border-t border-[#ffffff]/10 flex items-start gap-2 text-xs text-[#bfa8b2]">
            <span className="mt-1 w-2 h-2 shrink-0 rounded-full bg-[#34d399]" aria-hidden="true" />
            Conexão criptografada · acesso restrito a membros autorizados
          </div>
        </section>
      </main>
    </div>
  );
}
