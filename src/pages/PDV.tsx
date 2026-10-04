import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { ShoppingCart, CalendarHeart, CheckCircle, ArrowLeft, CreditCard, Banknote, Smartphone, Wallet, HandCoins, NotebookPen } from 'lucide-react';
import { brl, dataLocal, lerValor, valorParaCampo } from '../lib/formatos';
import { catalogoKeys, listarServicos } from '../features/catalogo/api';
import { comissoesKeys } from '../features/comissoes/api';

const FORMAS = [
  { id: 'pix', rotulo: 'PIX', icone: Smartphone, cor: 'emerald' },
  { id: 'debito', rotulo: 'Débito', icone: CreditCard, cor: 'indigo' },
  { id: 'credito', rotulo: 'Crédito', icone: CreditCard, cor: 'violet' },
  { id: 'dinheiro', rotulo: 'Dinheiro', icone: Banknote, cor: 'amber' },
  { id: 'outro', rotulo: 'Outro', icone: Wallet, cor: 'slate' },
] as const;

const ATIVO: Record<string, string> = {
  emerald: 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500',
  indigo: 'bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500',
  violet: 'bg-violet-50 border-violet-500 text-violet-700 ring-1 ring-violet-500',
  amber: 'bg-amber-50 border-amber-500 text-amber-700 ring-1 ring-amber-500',
  slate: 'bg-slate-100 border-slate-500 text-slate-700 ring-1 ring-slate-500',
};

/** Soma dias a uma data YYYY-MM-DD. */
function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export default function PDV() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Recebe o agendamento da tela de Agenda
  const appointment = location.state?.appointment;
  const { data: servicos = [] } = useQuery({ queryKey: catalogoKeys.servicos, queryFn: listarServicos });
  const servico = useMemo(() => servicos.find((s) => s.id === appointment?.servico_id), [servicos, appointment?.servico_id]);

  const valorInicial = appointment?.services?.price ?? appointment?.valor_cobrado ?? 0;
  const [paymentMethod, setPaymentMethod] = useState<string>('pix');
  const [valor, setValor] = useState(valorParaCampo(valorInicial));
  const [gorjeta, setGorjeta] = useState('');
  const [returnDate, setReturnDate] = useState(''); // Data do lembrete de retorno
  const [notes, setNotes] = useState('');
  const [tecnico, setTecnico] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const completeCheckoutMutation = useMutation({
    mutationFn: async () => {
      const v = lerValor(valor);
      const g = gorjeta.trim() ? lerValor(gorjeta) : 0;
      if (v === null) throw Object.assign(new Error('VALOR'), { publico: 'Valor final inválido.' });
      if (g === null) throw Object.assign(new Error('GORJETA'), { publico: 'Gorjeta inválida.' });
      const observacao = notes.trim() ? [appointment.notes, notes.trim()].filter(Boolean).join('\n') : appointment.notes ?? null;
      // Forma de pagamento, valor e gorjeta alimentam o cálculo de comissão (taxas por forma).
      const { error } = await supabase
        .from('appointments')
        .update({
          status: 'completed',
          payment_method: paymentMethod,
          valor_cobrado: v,
          gorjeta: g,
          notes: observacao,
          return_reminder_date: returnDate || null,
          return_reminder_sent: false
        })
        .eq('id', appointment.id);
      if (error) throw error;
      if (tecnico.trim() && appointment.client_id) {
        const { error: e2 } = await supabase.from('cliente_historico').insert([{ cliente_id: appointment.client_id, agendamento_id: appointment.id, tipo: 'tecnico', texto: tecnico.trim() }]);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments-list'] });
      queryClient.invalidateQueries({ queryKey: comissoesKeys.base });
      navigate('/agenda');
    },
    onError: (e: unknown) => setErro((e as { publico?: string }).publico ?? mensagemDeErro(e, 'Não foi possível concluir o atendimento.', 'pdv.checkout'))
  });

  if (!appointment) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <h2 className="text-xl font-bold text-slate-800">Nenhum agendamento selecionado.</h2>
        <p className="text-sm text-slate-500 mt-1">Abra o checkout pelo botão "Checkout" do atendimento na agenda.</p>
        <button onClick={() => navigate('/agenda')} className="mt-4 text-rose-600 font-bold hover:underline">Voltar para a Agenda</button>
      </div>
    );
  }

  const sName = appointment.services?.name ?? 'Atendimento';
  const valorNum = lerValor(valor) ?? 0;
  const gorjetaNum = lerValor(gorjeta || '0') ?? 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/agenda')} className="p-2 bg-white rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 shadow-sm" aria-label="Voltar para a agenda"><ArrowLeft size={20} /></button>
        <div>
          <h2 className="text-3xl font-black text-slate-800 flex items-center gap-2"><ShoppingCart size={28} className="text-rose-600" /> Checkout PDV</h2>
          <p className="text-sm text-slate-500 mt-1">Finalização de atendimento, pagamento e agendamento de retorno</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
        {/* Resumo do Cliente */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cliente em Atendimento</p>
          <div className="flex justify-between items-center gap-3">
            <h3 className="text-xl font-bold text-slate-800">{appointment.clients?.name ?? 'Cliente'}</h3>
            <span className="text-xl font-black text-rose-600">{brl(valorNum + gorjetaNum)}</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Serviço: {sName}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Forma de Pagamento */}
          <div className="space-y-3">
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Forma de Pagamento</span>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Forma de pagamento">
              {FORMAS.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={paymentMethod === f.id} onClick={() => setPaymentMethod(f.id)}
                  className={`flex items-center gap-2 p-3 rounded-xl border font-bold transition-all ${paymentMethod === f.id ? ATIVO[f.cor] : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <f.icone size={18} /> {f.rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Valor final do serviço (R$)
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="mt-1 w-full border border-slate-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm font-bold text-slate-800 normal-case" />
            </label>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><HandCoins size={14} className="text-emerald-600" /> Gorjeta (opcional)</label>
            <input inputMode="decimal" value={gorjeta} onChange={(e) => setGorjeta(e.target.value)} placeholder="0,00" aria-label="Gorjeta" className="w-full border border-slate-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm" />
            <p className="text-xs text-slate-400">A gorjeta vai integralmente para o profissional no fechamento de comissões.</p>
          </div>
        </div>

        {/* Lembrete de retorno */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><CalendarHeart size={14} className="text-rose-500"/> Agendar Lembrete de Retorno</label>
          <div className="flex flex-wrap gap-2">
            <input type="date" value={returnDate} min={dataLocal()} onChange={(e) => setReturnDate(e.target.value)} aria-label="Data do lembrete de retorno"
              className="flex-1 min-w-[180px] border border-slate-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm font-medium text-slate-700 bg-rose-50/30" />
            {servico?.retorno_dias && (
              <button type="button" onClick={() => setReturnDate(somarDias(dataLocal(), servico.retorno_dias!))} className="px-3 py-2 rounded-xl border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-50">
                Sugestão: em {servico.retorno_dias} dias
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">Selecione uma data futura para o sistema te lembrar de chamar a cliente pelo WhatsApp.</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><NotebookPen size={14} className="text-rose-500" /> Registro técnico (histórico da cliente)</label>
          <textarea value={tecnico} onChange={(e) => setTecnico(e.target.value)} maxLength={2000} rows={2} placeholder="Ex.: Coloração 7.1 + 20 vol, 35 min de pausa. Couro cabeludo sensível."
            className="w-full border border-slate-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm" />
          <p className="text-xs text-slate-400 mt-1">Fica no histórico técnico da cliente, visível para a equipe.</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Observações Internas</label>
          <input type="text" placeholder="Ex: Cliente quer fazer outro procedimento da próxima vez..." value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} className="w-full border border-slate-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm" />
        </div>

        {erro && <p role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{erro}</p>}

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={() => { setErro(null); completeCheckoutMutation.mutate(); }}
            disabled={completeCheckoutMutation.isPending}
            className="w-full md:w-auto bg-rose-600 hover:bg-rose-700 text-white px-8 py-3.5 rounded-xl font-bold transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <CheckCircle size={20} /> {completeCheckoutMutation.isPending ? 'Finalizando...' : 'Concluir Atendimento'}
          </button>
        </div>
      </div>
    </div>
  );
}
