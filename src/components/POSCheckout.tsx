import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { offlineDB } from '../db/offlineStore';
import { useNetworkState } from 'react-use';
import { Users } from 'lucide-react';

interface CheckoutProps {
  appointmentId: string;
  professionalId: string;
  service: { id: string; name: string; price: number; commission_rate: number };
  onSuccess: () => void;
}

export default function POSCheckout({ appointmentId, professionalId, service, onSuccess }: CheckoutProps) {
  const { online } = useNetworkState();
  const queryClient = useQueryClient();
  
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit' | 'debit' | 'cash'>('pix');
  const [installments, setInstallments] = useState(1);

  const checkoutMutation = useMutation({
    mutationFn: async (payload: any) => {
      // 1. Contingência Offline
      if (!online) {
        await offlineDB.outbox.add({
          url: 'transactions',
          method: 'POST',
          body: payload,
          timestamp: Date.now()
        });
        return payload;
      }
      
      // 2. Integração Real com Supabase (Dando baixa no agendamento)
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', payload.appointment_id);

      if (error) throw error;

      return payload;
    },
    onSuccess: () => {
      // Atualiza todas as listas da interface em tempo real após o sucesso
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-list'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-today'] });
      onSuccess();
    }
  });

  const handleFinalize = () => {
    const payload = {
      appointment_id: appointmentId,
      total_amount: service.price,
      payment_method: paymentMethod,
      installments
    };
    checkoutMutation.mutate(payload);
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg w-full max-w-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Checkout</h2>
        {!online && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-medium shadow-sm">Modo Offline Ativo</span>}
      </div>

      <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
        <p className="text-slate-500 text-sm">Serviço Realizado</p>
        <p className="text-lg font-semibold text-slate-800">{service.name}</p>
      </div>

      <div className="mb-6 flex justify-between items-end border-b border-slate-200 pb-4">
        <p className="text-slate-500 font-medium">Total a Pagar</p>
        <p className="text-3xl font-bold text-rose-600">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.price)}
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Forma de Pagamento</label>
          <select 
            value={paymentMethod} 
            onChange={(e) => setPaymentMethod(e.target.value as any)}
            className="w-full border border-slate-300 rounded-lg p-3 shadow-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none font-medium text-slate-700"
          >
            <option value="pix">PIX</option>
            <option value="credit">Cartão de Crédito</option>
            <option value="debit">Cartão de Débito</option>
            <option value="cash">Dinheiro</option>
          </select>
        </div>

        {paymentMethod === 'credit' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Parcelas</label>
            <select 
              value={installments} 
              onChange={(e) => setInstallments(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-lg p-3 shadow-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none font-medium text-slate-700"
            >
              {[1, 2, 3, 4, 5, 6].map(num => (
                <option key={num} value={num}>
                  {num}x de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.price / num)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <button 
        onClick={handleFinalize}
        disabled={checkoutMutation.isPending}
        className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all flex justify-center items-center shadow-sm disabled:bg-rose-400 text-lg"
      >
        {checkoutMutation.isPending ? 'Processando...' : 'Confirmar e Finalizar'}
      </button>
    </div>
  );
}