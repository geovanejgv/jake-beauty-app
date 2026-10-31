import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, CalendarHeart, CheckCircle, Send } from 'lucide-react';
import { Modal, inputCls } from '../../components/ui';
import { horaBR, isoParaBR } from '../../lib/formatos';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { marcarLembreteEnviado } from './api';
import { agendamentosParaLembrar, linkLembrete, retornosDoDia, situacaoLembrete, situacaoRetorno, type AgendamentoLembrete, type RetornoLembrete } from './lembrete';

/** Abre o WhatsApp da cliente com o lembrete e registra o envio no atendimento. */
export function useEnviarLembrete(onErro: (texto: string) => void) {
  const queryClient = useQueryClient();
  const marcar = useMutation({
    mutationFn: marcarLembreteEnviado,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments-list'] }),
    onError: (e) => onErro(mensagemDeErro(e, 'O WhatsApp abriu, mas não foi possível registrar o lembrete.', 'agenda.lembrete')),
  });
  return (a: AgendamentoLembrete) => {
    const situacao = situacaoLembrete(a);
    if (situacao === 'contato_restrito') return onErro('O contato da cliente fica com a administração do salão.');
    if (situacao === 'sem_telefone') return onErro(`O cadastro de ${a.clients?.name ?? 'cliente'} está sem WhatsApp com DDD.`);
    // Abre no clique (o navegador bloqueia janela aberta depois de esperar o banco).
    window.open(linkLembrete(a), '_blank', 'noopener');
    marcar.mutate(a.id);
  };
}

const ROTULO: Record<ReturnType<typeof situacaoLembrete>, string> = {
  pronto: 'Falta avisar',
  enviado: 'Avisada',
  sem_telefone: 'Sem WhatsApp no cadastro',
  contato_restrito: 'Contato com a administração',
};

/**
 * Lista do dia (padrão: amanhã) para lembrar cada cliente pelo WhatsApp, uma por vez,
 * e os lembretes de retorno do mesmo dia (chamar a cliente para agendar de novo).
 */
export function LembretesDoDia<T extends RetornoLembrete>({ agendamentos, diaInicial, podeEnviar, nomeProf, onChamarRetorno, secaoContato, onErro, onFechar }: {
  agendamentos: T[];
  diaInicial: string;
  podeEnviar: (a: T) => boolean;
  nomeProf: (id: string | null) => string;
  /** Abre a mensagem de retorno no WhatsApp e registra a chamada (mesma ação da faixa Lembretes). */
  onChamarRetorno: (a: T) => void;
  /** Lembretes de contato da reativação do dia (só a administradora; a tela passa a lista). */
  secaoContato?: (dia: string) => ReactNode;
  onErro: (texto: string) => void;
  onFechar: () => void;
}) {
  const [dia, setDia] = useState(diaInicial);
  const enviar = useEnviarLembrete(onErro);
  const lista = agendamentosParaLembrar(agendamentos, dia);
  const avisadas = lista.filter((a) => situacaoLembrete(a) === 'enviado').length;
  const proxima = lista.find((a) => situacaoLembrete(a) === 'pronto' && podeEnviar(a));
  const retornos = retornosDoDia(agendamentos, dia);

  return (
    <Modal titulo="Lembrar clientes do horário" onClose={onFechar} rodape={
      <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{lista.length ? `${avisadas} de ${lista.length} avisada(s) em ${isoParaBR(dia)}` : ''}</p>
        <button type="button" disabled={!proxima} onClick={() => proxima && enviar(proxima)}
          className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
          <Send size={16} /> {proxima ? `Avisar ${proxima.clients?.name.split(' ')[0]}` : 'Todas avisadas'}
        </button>
      </div>
    }>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          O ideal é avisar na véspera. Cada envio abre o WhatsApp com a mensagem pronta; confira e toque em enviar. O app registra quem já foi avisada.
        </p>
        <label className="block text-xs font-bold text-slate-500">
          Atendimentos do dia
          <input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        {lista.length === 0 && (
          <p className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 text-center">Nenhum atendimento agendado neste dia.</p>
        )}
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {lista.map((a) => {
            const situacao = situacaoLembrete(a);
            const pode = podeEnviar(a) && (situacao === 'pronto' || situacao === 'enviado');
            return (
              <li key={a.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">{horaBR(a.start_time)} · {a.clients?.name ?? 'Cliente'}</p>
                  <p className="text-xs text-slate-500 truncate">{a.services.name} · {nomeProf(a.professional_id)}</p>
                  <p className={`text-[11px] font-semibold mt-0.5 flex items-center gap-1 ${situacao === 'enviado' ? 'text-emerald-600' : situacao === 'pronto' ? 'text-amber-700' : 'text-slate-400'}`}>
                    {situacao === 'enviado' && <CheckCircle size={11} />}
                    {ROTULO[situacao]}{situacao === 'enviado' && a.lembrete_enviado_em ? ` às ${horaBR(a.lembrete_enviado_em)}` : ''}
                  </p>
                </div>
                {pode && (
                  <button type="button" onClick={() => enviar(a)}
                    className={`shrink-0 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${situacao === 'enviado' ? 'border border-slate-200 text-slate-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                    <BellRing size={14} /> {situacao === 'enviado' ? 'Reenviar' : 'Avisar'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {retornos.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-xs font-bold text-indigo-700 flex items-center gap-1.5"><CalendarHeart size={14} /> Lembretes de retorno do dia ({retornos.length})</h4>
            <ul className="divide-y divide-indigo-100 border border-indigo-200 bg-indigo-50/50 rounded-xl">
              {retornos.map((a) => {
                const situacao = situacaoRetorno(a);
                const pode = podeEnviar(a) && (situacao === 'pronto' || situacao === 'enviado');
                return (
                  <li key={`ret-${a.id}`} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-indigo-900 text-sm truncate">{a.clients?.name ?? 'Cliente'}</p>
                      <p className="text-xs text-indigo-600 truncate">Lembrar de agendar: {a.services.name}</p>
                      <p className={`text-[11px] font-semibold mt-0.5 flex items-center gap-1 ${situacao === 'enviado' ? 'text-emerald-600' : situacao === 'pronto' ? 'text-amber-700' : 'text-slate-400'}`}>
                        {situacao === 'enviado' && <CheckCircle size={11} />}
                        {situacao === 'enviado' ? `Chamada${a.return_reminder_sent_at ? ` às ${horaBR(a.return_reminder_sent_at)}` : ''}` : situacao === 'pronto' ? 'Falta chamar' : ROTULO[situacao]}
                      </p>
                    </div>
                    {pode && (
                      <button type="button" onClick={() => onChamarRetorno(a)}
                        className={`shrink-0 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${situacao === 'enviado' ? 'border border-slate-200 text-slate-600' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                        <Send size={14} /> {situacao === 'enviado' ? 'Chamar de novo' : 'Chamar'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {secaoContato?.(dia)}
      </div>
    </Modal>
  );
}
