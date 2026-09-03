import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ShoppingCart, CalendarHeart, CheckCircle, ArrowLeft, CreditCard, Banknote, Smartphone } from 'lucide-react';

export default function PDV() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Recebe o agendamento da tela de Agenda
  const appointment = location.state?.appointment;

  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [returnDate, setReturnDate] = useState(''); // Nova Data de Lembrete
  const [notes, setNotes] = useState('');

  const completeCheckoutMutation = useMutation({
    mutationFn: async () => {
      // Atualiza o agendamento para concluído e salva a data do lembrete (se preenchida)
      const { error } = await supabase
        .from('appointments')
        .update({ 
          status: 'completed',
          return_reminder_date: returnDate || null,
          return_reminder_sent: false
        })
        .eq('id', appointment.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments-list'] });
      alert('Checkout finalizado com sucesso!');
      navigate('/agenda');
    }
  });

  if (!appointment) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <h2 className="text-xl font-bold text-slate-800">Nenhum agendamento selecionado.</h2>
        <button onClick={() => navigate('/agenda')} className="mt-4 text-rose-600 font-bold hover:underline">Voltar para a Agenda</button>
      </div>
    );
  }

  const sPrice = Array.isArray(appointment.services) ? appointment.services[0]?.price : appointment.services?.price;
  const sName = Array.isArray(appointment.services) ? appointment.services[0]?.name : appointment.services?.name;
  const formattedPrice = parseFloat(sPrice || 0).toFixed(2).replace('.', ',');

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/agenda')} className="p-2 bg-white rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 shadow-sm"><ArrowLeft size={20} /></button>
        <div>
          <h2 className="text-3xl font-black text-slate-800 flex items-center gap-2"><ShoppingCart size={28} className="text-rose-600" /> Checkout PDV</h2>
          <p className="text-sm text-slate-500 mt-1">Finalização de atendimento e agendamento de retorno</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
        {/* Resumo do Cliente */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cliente em Atendimento</p>
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-slate-800">{appointment.clients?.name}</h3>
            <span className="text-xl font-black text-rose-600">R$ {formattedPrice}</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Serviço: {sName}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Forma de Pagamento */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Forma de Pagamento</label>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setPaymentMethod('pix')} className={`flex items-center gap-2 p-3 rounded-xl border font-bold transition-all ${paymentMethod === 'pix' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Smartphone size={18}/> PIX</button>
              <button onClick={() => setPaymentMethod('cartao')} className={`flex items-center gap-2 p-3 rounded-xl border font-bold transition-all ${paymentMethod === 'cartao' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><CreditCard size={18}/> Cartão</button>
              <button onClick={() => setPaymentMethod('dinheiro')} className={`flex items-center gap-2 p-3 rounded-xl border font-bold transition-all ${paymentMethod === 'dinheiro' ? 'bg-amber-50 border-amber-500 text-amber-700 ring-1 ring-amber-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Banknote size={18}/> Dinheiro</button>
            </div>
          </div>

          {/* O NOVO CAMPO DE LEMBRETE DE RETORNO */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><CalendarHeart size={14} className="text-rose-500"/> Agendar Lembrete de Retorno</label>
            <input 
              type="date" 
              value={returnDate} 
              onChange={(e) => setReturnDate(e.target.value)} 
              className="w-full border border-slate-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm font-medium text-slate-700 bg-rose-50/30" 
            />
            <p className="text-xs text-slate-400">Selecione uma data futura para o sistema te lembrar de chamar a cliente pelo WhatsApp.</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Observações Internas</label>
          <input type="text" placeholder="Ex: Cliente quer fazer outro procedimento da próxima vez..." value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-slate-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm" />
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button 
            onClick={() => completeCheckoutMutation.mutate()} 
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