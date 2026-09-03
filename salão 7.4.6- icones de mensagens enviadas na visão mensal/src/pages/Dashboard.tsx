import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { TrendingUp, Calendar, Filter, BarChart3, Loader2, DollarSign, CreditCard, X, FileSpreadsheet, Edit2, Trash2, AlertTriangle, Wallet, TrendingDown, Clock, CheckCircle } from 'lucide-react';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Controles de Relatório de Faturamento
  const [reportFilterName, setReportFilterName] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [recordToDelete, setRecordToDelete] = useState<any>(null);
  
  const [editServiceName, setEditServiceName] = useState('');
  const [editServicePrice, setEditServicePrice] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('pix');
  const [editInstallments, setEditInstallments] = useState(1);
  const [editNotes, setEditNotes] = useState('');

  // Controles do Módulo de Despesas
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expensesReportOpen, setExpensesReportOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<any>(null);

  const [expId, setExpId] = useState<string | null>(null);
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('Fixo'); // Fixo ou Variável
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expIsPaid, setExpIsPaid] = useState(true);

  // 1. Busca Agendamentos Concluídos (Receitas)
  const { data: appointments = [], isLoading: isLoadingApt } = useQuery({
    queryKey: ['dashboard-financials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`id, start_time, status, payment_method, installments, notes, clients ( name ), services ( id, name, price )`)
        .eq('status', 'completed')
        .order('start_time', { ascending: false }); 
      if (error) throw error;
      return data || [];
    }
  });

  // 2. Busca Despesas
  const { data: expenses = [], isLoading: isLoadingExp } = useQuery({
    queryKey: ['dashboard-expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  // Lógica de Datas
  const getLocalDateStr = (date: Date) => new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  const now = new Date();
  const todayStr = getLocalDateStr(now);
  const currentDayOfWeek = now.getDay();
  const distanceToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() + distanceToMonday);
  const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6);
  const startOfWeekStr = getLocalDateStr(startOfWeek);
  const endOfWeekStr = getLocalDateStr(endOfWeek);

  const currentDayOfMonth = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  let startOfFortnightStr = ''; let endOfFortnightStr = '';
  if (currentDayOfMonth <= 15) {
    startOfFortnightStr = getLocalDateStr(new Date(currentYear, currentMonth, 1));
    endOfFortnightStr = getLocalDateStr(new Date(currentYear, currentMonth, 15));
  } else {
    startOfFortnightStr = getLocalDateStr(new Date(currentYear, currentMonth, 16));
    endOfFortnightStr = getLocalDateStr(new Date(currentYear, currentMonth + 1, 0));
  }
  const startOfMonthStr = getLocalDateStr(new Date(currentYear, currentMonth, 1));
  const getDaysAgoStr = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return getLocalDateStr(d); };
  
  // Cálculos Consolidados (Receitas + Despesas)
  const financials = useMemo(() => {
    let todayTotal = 0; let weekTotal = 0; let biweekTotal = 0; let monthTotal = 0; let customTotal = 0;
    let week1 = 0; let week2 = 0; let week3 = 0; let week4 = 0;

    appointments.forEach((apt: any) => {
      const aptDate = new Date(apt.start_time).toISOString().split('T')[0];
      const price = parseFloat(apt.services?.price || 0);

      if (aptDate === todayStr) todayTotal += price;
      if (aptDate >= startOfWeekStr && aptDate <= endOfWeekStr) weekTotal += price;
      if (aptDate >= startOfFortnightStr && aptDate <= endOfFortnightStr) biweekTotal += price;
      if (aptDate >= startOfMonthStr) monthTotal += price;
      if (startDate && endDate && aptDate >= startDate && aptDate <= endDate) customTotal += price;

      if (aptDate >= getDaysAgoStr(7)) week4 += price;
      else if (aptDate >= getDaysAgoStr(14)) week3 += price;
      else if (aptDate >= getDaysAgoStr(21)) week2 += price;
      else if (aptDate >= getDaysAgoStr(28)) week1 += price;
    });

    let monthExpensesPaid = 0;
    let monthExpensesPending = 0;

    expenses.forEach((exp: any) => {
      if (exp.expense_date >= startOfMonthStr) {
        if (exp.is_paid) monthExpensesPaid += parseFloat(exp.amount);
        else monthExpensesPending += parseFloat(exp.amount);
      }
    });

    const netIncome = monthTotal - monthExpensesPaid;

    return { 
      todayTotal, weekTotal, biweekTotal, monthTotal, customTotal, chartData: [week1, week2, week3, week4],
      monthExpensesPaid, monthExpensesPending, netIncome
    };
  }, [appointments, expenses, startDate, endDate, todayStr, startOfWeekStr, endOfWeekStr, startOfFortnightStr, endOfFortnightStr, startOfMonthStr]);

  // Filtro do Relatório de Faturamento
  const reportData = useMemo(() => {
    if (!reportFilterName) return [];
    return appointments.filter((apt: any) => {
      const aptDate = new Date(apt.start_time).toISOString().split('T')[0];
      switch (reportFilterName) {
        case 'Faturamento Hoje': return aptDate === todayStr;
        case 'Semana Atual': return aptDate >= startOfWeekStr && aptDate <= endOfWeekStr;
        case 'Quinzena Atual': return aptDate >= startOfFortnightStr && aptDate <= endOfFortnightStr;
        case 'Mês Atual': return aptDate >= startOfMonthStr;
        case 'Período Filtrado': return (startDate && endDate && aptDate >= startDate && aptDate <= endDate);
        default: return false;
      }
    });
  }, [appointments, reportFilterName, todayStr, startOfWeekStr, endOfWeekStr, startOfFortnightStr, endOfFortnightStr, startOfMonthStr, startDate, endDate]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const translatePaymentMethod = (method: string) => {
    const map: Record<string, string> = { 'pix': 'PIX', 'debit': 'Débito', 'credit_cash': 'Crédito à vista', 'credit_installments': 'Crédito parcelado', 'cash': 'Dinheiro' };
    return map[method] || method || 'Não informado';
  };

  // MUTAÇÕES DE FATURAMENTO
  const deleteRecordMutation = useMutation({
    mutationFn: async (id: string) => { await supabase.from('appointments').delete().eq('id', id); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard-financials'] }); setRecordToDelete(null); }
  });

  const updateRecordMutation = useMutation({
    mutationFn: async (data: any) => {
      await supabase.from('appointments').update({
        payment_method: data.paymentMethod, installments: data.paymentMethod === 'credit_installments' ? data.installments : 1, notes: data.notes || null
      }).eq('id', data.id);
      const formattedPrice = parseFloat(String(data.price).replace(',', '.'));
      if (data.serviceId) await supabase.from('services').update({ name: data.serviceName, price: formattedPrice }).eq('id', data.serviceId);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard-financials'] }); setEditingRecord(null); }
  });

  const handleEditOpen = (record: any) => {
    setEditingRecord(record);
    setEditServiceName(record.services?.name || '');
    setEditServicePrice(record.services?.price ? String(record.services.price).replace('.', ',') : '');
    setEditPaymentMethod(record.payment_method || 'pix');
    setEditInstallments(record.installments || 1);
    setEditNotes(record.notes || '');
  };

  // MUTAÇÕES DE DESPESAS
  const saveExpenseMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        description: data.description,
        amount: parseFloat(String(data.amount).replace(',', '.')),
        category: data.category,
        expense_date: data.date,
        is_paid: data.isPaid
      };
      if (data.id) await supabase.from('expenses').update(payload).eq('id', data.id);
      else await supabase.from('expenses').insert([payload]);
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] }); 
      setExpenseModalOpen(false); 
    }
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => { await supabase.from('expenses').delete().eq('id', id); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] }); setExpenseToDelete(null); }
  });

  const openNewExpense = () => {
    setExpId(null); setExpDesc(''); setExpAmount(''); setExpCategory('Fixo'); setExpDate(todayStr); setExpIsPaid(true);
    setExpenseModalOpen(true);
  };

  const handleEditExpense = (exp: any) => {
    setExpId(exp.id); setExpDesc(exp.description); setExpAmount(String(exp.amount).replace('.', ','));
    setExpCategory(exp.category); setExpDate(exp.expense_date); setExpIsPaid(exp.is_paid);
    setExpenseModalOpen(true);
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    saveExpenseMutation.mutate({ id: expId, description: expDesc, amount: expAmount, category: expCategory, date: expDate, isPaid: expIsPaid });
  };

  if (isLoadingApt || isLoadingExp) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-rose-500">
        <Loader2 className="animate-spin mb-4" size={40} />
        <p className="font-medium text-slate-500">Sincronizando fluxo de caixa...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 relative">
      <div>
        <h2 className="text-3xl font-black text-slate-800 tracking-tight">Painel Financeiro</h2>
        <p className="text-sm text-slate-500 mt-1">Gestão de faturamento, despesas e lucro líquido</p>
      </div>

      {/* Cards Superiores (Faturamento) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button onClick={() => setReportFilterName('Faturamento Hoje')} className="text-left bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-rose-300 transition-all">
          <div><p className="text-xs font-bold text-slate-400 mb-1 group-hover:text-rose-500 transition-colors uppercase">Faturamento Hoje</p><p className="text-2xl font-black text-slate-800">{formatCurrency(financials.todayTotal)}</p></div>
          <div className="bg-rose-50 p-3 rounded-xl text-rose-600 group-hover:scale-110 transition-transform"><DollarSign size={20} /></div>
        </button>
        <button onClick={() => setReportFilterName('Semana Atual')} className="text-left bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-rose-300 transition-all">
          <div><p className="text-xs font-bold text-slate-400 mb-1 group-hover:text-rose-500 transition-colors uppercase">Semana Atual</p><p className="text-2xl font-black text-slate-800">{formatCurrency(financials.weekTotal)}</p></div>
          <div className="bg-rose-50 p-3 rounded-xl text-rose-600 group-hover:scale-110 transition-transform"><TrendingUp size={20} /></div>
        </button>
        <button onClick={() => setReportFilterName('Quinzena Atual')} className="text-left bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-rose-300 transition-all">
          <div><p className="text-xs font-bold text-slate-400 mb-1 group-hover:text-rose-500 transition-colors uppercase">Quinzena Atual</p><p className="text-2xl font-black text-slate-800">{formatCurrency(financials.biweekTotal)}</p></div>
          <div className="bg-rose-50 p-3 rounded-xl text-rose-600 group-hover:scale-110 transition-transform"><CreditCard size={20} /></div>
        </button>
        <button onClick={() => setReportFilterName('Mês Atual')} className="text-left bg-slate-800 p-5 rounded-2xl shadow-md flex items-center justify-between text-white transform hover:-translate-y-1 transition-all">
          <div><p className="text-xs font-bold text-slate-300 mb-1 uppercase">Mês Atual</p><p className="text-2xl font-black">{formatCurrency(financials.monthTotal)}</p></div>
          <div className="bg-white/10 p-3 rounded-xl text-white"><Calendar size={20} /></div>
        </button>
      </div>

      {/* Barra de Filtro Customizado (Abaixo dos cards para poupar espaço vertical) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3 text-slate-700 font-bold">
          <Filter className="text-rose-500" size={20} /> <span>Filtro Customizado:</span>
        </div>
        <div className="flex items-center space-x-2">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-rose-500 text-sm" />
          <span className="text-slate-400 text-sm font-bold">até</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-rose-500 text-sm" />
        </div>
        <div className="flex items-center space-x-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Total Filtrado</p>
            <p className="text-lg font-black text-rose-600 leading-none mt-1">{startDate && endDate ? formatCurrency(financials.customTotal) : 'R$ 0,00'}</p>
          </div>
          {startDate && endDate && (
             <button onClick={() => setReportFilterName('Período Filtrado')} className="bg-rose-50 text-rose-600 font-bold px-4 py-2 rounded-lg text-sm hover:bg-rose-100 transition-colors">
               Detalhes
             </button>
          )}
        </div>
      </div>

      {/* Gráfico e Módulo de Despesas/Fluxo de Caixa */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Gráfico de Evolução */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
          <div className="flex items-center space-x-2 mb-8">
            <BarChart3 className="text-rose-500" size={24} />
            <h3 className="text-lg font-bold text-slate-800">Evolução de Faturamento (Últimas 4 Semanas)</h3>
          </div>
          <div className="flex items-end justify-around flex-1 mt-4 gap-4 min-h-[200px]">
            {financials.chartData.map((val, index) => {
              const maxVal = Math.max(...financials.chartData, 1);
              const labels = ["Semana 4", "Semana 3", "Semana 2", "Atual"];
              return (
                <div key={index} className="flex flex-col items-center w-full group">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs font-bold py-1 px-2 rounded mb-2 whitespace-nowrap">{formatCurrency(val)}</div>
                  <div className="w-full max-w-[60px] bg-rose-100 rounded-t-lg relative flex justify-center h-full">
                    <div className="absolute bottom-0 w-full bg-rose-500 rounded-t-lg transition-all duration-700 group-hover:bg-rose-600" style={{ height: `${(val / maxVal) * 100}%`, minHeight: val > 0 ? '4px' : '0' }}></div>
                  </div>
                  <p className="text-xs font-bold text-slate-500 mt-3">{labels[index]}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* FLUXO DE CAIXA E DESPESAS (DRE) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
          <div className="flex items-center space-x-2 mb-6">
            <Wallet className="text-rose-500" size={24} />
            <h3 className="text-lg font-bold text-slate-800">Fluxo de Caixa (Mês)</h3>
          </div>
          
          <div className="space-y-4 mb-8 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 text-sm font-bold uppercase">Entradas (Receitas)</span>
              <span className="text-emerald-600 font-black">{formatCurrency(financials.monthTotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 text-sm font-bold uppercase">Saídas (Despesas Pagas)</span>
              <span className="text-red-500 font-black">- {formatCurrency(financials.monthExpensesPaid)}</span>
            </div>
            <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
              <span className="font-black text-slate-800 uppercase">Lucro Líquido Real</span>
              <span className={`text-2xl font-black ${financials.netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(financials.netIncome)}
              </span>
            </div>
            {financials.monthExpensesPending > 0 && (
               <div className="mt-2 text-right">
                 <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">Despesas Pendentes: {formatCurrency(financials.monthExpensesPending)}</span>
               </div>
            )}
          </div>

          <div className="space-y-3 mt-auto">
            <button onClick={openNewExpense} className="w-full bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 transition-colors shadow-sm">
              + Lançar Despesa
            </button>
            <button onClick={() => setExpensesReportOpen(true)} className="w-full bg-white text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50 border-2 border-slate-100 transition-colors">
              Ver Relatório de Contas
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL: NOVA/EDITAR DESPESA */}
      {/* ========================================================= */}
      {expenseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800">{expId ? 'Editar Despesa' : 'Nova Despesa'}</h3>
              <button onClick={() => setExpenseModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <form onSubmit={handleSaveExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Descrição</label>
                <input type="text" required value={expDesc} onChange={(e) => setExpDesc(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" placeholder="Ex: Conta de Luz, Aluguel..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Valor (R$)</label>
                  <input type="text" required value={expAmount} onChange={(e) => setExpAmount(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" placeholder="150,00" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Data Vencimento/Pago</label>
                  <input type="date" required value={expDate} onChange={(e) => setExpDate(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Categoria</label>
                  <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm font-medium">
                    <option value="Fixo">Custo Fixo</option>
                    <option value="Variável">Custo Variável (Insumos)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Status</label>
                  <div className="flex items-center space-x-2 mt-2">
                    <input type="checkbox" id="isPaid" checked={expIsPaid} onChange={(e) => setExpIsPaid(e.target.checked)} className="w-5 h-5 text-rose-600 rounded focus:ring-rose-500" />
                    <label htmlFor="isPaid" className={`text-sm font-bold ${expIsPaid ? 'text-emerald-600' : 'text-amber-600'}`}>{expIsPaid ? 'Conta Paga' : 'Pendente'}</label>
                  </div>
                </div>
              </div>
              <div className="flex space-x-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setExpenseModalOpen(false)} className="w-1/2 border p-2.5 rounded-lg text-slate-500 font-medium">Cancelar</button>
                <button type="submit" disabled={saveExpenseMutation.isPending} className="w-1/2 bg-rose-600 text-white p-2.5 rounded-lg font-bold">Salvar Despesa</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: RELATÓRIO DE DESPESAS */}
      {/* ========================================================= */}
      {expensesReportOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center space-x-3">
                <div className="bg-rose-100 p-2 rounded-lg text-rose-600"><TrendingDown size={24} /></div>
                <div><h3 className="text-xl font-black text-slate-800">Relatório Geral de Despesas</h3></div>
              </div>
              <button onClick={() => setExpensesReportOpen(false)} className="text-slate-400 hover:text-rose-600 p-2 bg-white rounded-full shadow-sm hover:shadow transition-all"><X size={24} /></button>
            </div>

            <div className="flex-1 overflow-auto bg-white p-6">
              {expenses.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400"><p>Nenhuma despesa registrada.</p></div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 bg-slate-50 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 whitespace-nowrap">Data</th>
                        <th className="px-4 py-3">Descrição / Fornecedor</th>
                        <th className="px-4 py-3">Categoria</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Valor</th>
                        <th className="px-4 py-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expenses.map((exp: any) => {
                        const isP = exp.is_paid;
                        return (
                          <tr key={exp.id} className="hover:bg-rose-50/50 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">{new Date(exp.expense_date).toLocaleDateString('pt-BR')}</td>
                            <td className="px-4 py-3 font-bold text-slate-800">{exp.description}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs uppercase">{exp.category}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase flex items-center justify-center gap-1 w-max mx-auto ${isP ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {isP ? <><CheckCircle size={12}/> Pago</> : <><Clock size={12}/> Pendente</>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-black text-rose-600 whitespace-nowrap">{formatCurrency(exp.amount)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center space-x-2">
                                <button onClick={() => handleEditExpense(exp)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="Editar"><Edit2 size={16} /></button>
                                <button onClick={() => setExpenseToDelete(exp)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Excluir"><Trash2 size={16} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setExpensesReportOpen(false)} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 transition-colors shadow-sm">Fechar Relatório</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMAR EXCLUSÃO DE DESPESA */}
      {expenseToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="flex justify-center text-red-500 mb-2"><AlertTriangle size={48} /></div>
            <h3 className="text-xl font-bold text-slate-800">Apagar Despesa?</h3>
            <p className="text-sm text-slate-500">Isso apagará a conta <strong>{expenseToDelete.description}</strong> e recalculará o seu fluxo de caixa.</p>
            <div className="flex space-x-3 pt-4">
              <button onClick={() => setExpenseToDelete(null)} className="w-1/2 border border-slate-200 bg-slate-50 text-slate-600 p-2.5 rounded-lg font-medium">Voltar</button>
              <button onClick={() => deleteExpenseMutation.mutate(expenseToDelete.id)} disabled={deleteExpenseMutation.isPending} className="w-1/2 bg-red-600 text-white p-2.5 rounded-lg font-bold">Sim, Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: RELATÓRIO DE FATURAMENTO E CONFIRMAR EXCLUSÃO DE AGENDAMENTO */}
      {/* ========================================================= */}
      {/* Estes são os mesmos modais da versão anterior, garantindo que tudo funcione perfeitamente */}
      {reportFilterName && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center space-x-3">
                <div className="bg-rose-100 p-2 rounded-lg text-rose-600"><FileSpreadsheet size={24} /></div>
                <div><h3 className="text-xl font-black text-slate-800">Detalhamento: {reportFilterName}</h3></div>
              </div>
              <button onClick={() => setReportFilterName(null)} className="text-slate-400 hover:text-rose-600 p-2 bg-white rounded-full shadow-sm hover:shadow transition-all"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-auto bg-white p-6">
              {reportData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400"><p>Nenhum faturamento encontrado.</p></div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 bg-slate-50 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Data / Hora</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Procedimento</th>
                        <th className="px-4 py-3">Pagamento</th><th className="px-4 py-3 text-right">Valor</th><th className="px-4 py-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportData.map((row: any) => (
                        <tr key={row.id} className="hover:bg-rose-50/50 transition-colors group">
                          <td className="px-4 py-3 whitespace-nowrap text-slate-500"><span className="font-semibold text-slate-700">{new Date(row.start_time).toLocaleDateString('pt-BR')}</span> às {new Date(row.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-4 py-3 font-bold text-slate-800">{row.clients?.name}</td>
                          <td className="px-4 py-3 text-slate-600">{row.services?.name}</td>
                          <td className="px-4 py-3"><span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider">{translatePaymentMethod(row.payment_method)}</span></td>
                          <td className="px-4 py-3 text-right font-black text-rose-600">{formatCurrency(row.services?.price || 0)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center space-x-2">
                              <button onClick={() => handleEditOpen(row)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Edit2 size={16} /></button>
                              <button onClick={() => setRecordToDelete(row)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <p className="text-sm font-bold text-slate-500">Total Faturado: <span className="text-xl font-black text-rose-600 ml-2">{formatCurrency(reportData.reduce((acc, curr) => acc + (parseFloat(curr.services?.price) || 0), 0))}</span></p>
              <button onClick={() => setReportFilterName(null)} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {editingRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center"><h3 className="text-xl font-bold text-slate-800">Editar Faturamento</h3><button onClick={() => setEditingRecord(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button></div>
            <form onSubmit={(e) => { e.preventDefault(); updateRecordMutation.mutate({ id: editingRecord.id, serviceId: editingRecord.services?.id, serviceName: editServiceName, price: editServicePrice, paymentMethod: editPaymentMethod, installments: editInstallments, notes: editNotes }); }} className="space-y-4">
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Procedimento</label><input type="text" required value={editServiceName} onChange={(e) => setEditServiceName(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Valor (R$)</label><input type="text" required value={editServicePrice} onChange={(e) => setEditServicePrice(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Pagamento</label><select value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="credit_cash">Crédito</option></select></div>
              </div>
              <div className="flex space-x-3 pt-2"><button type="button" onClick={() => setEditingRecord(null)} className="w-1/2 border p-2.5 rounded-lg text-slate-500 font-medium">Cancelar</button><button type="submit" disabled={updateRecordMutation.isPending} className="w-1/2 bg-rose-600 text-white p-2.5 rounded-lg font-bold">Salvar Alteração</button></div>
            </form>
          </div>
        </div>
      )}

      {recordToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="flex justify-center text-red-500 mb-2"><AlertTriangle size={48} /></div><h3 className="text-xl font-bold text-slate-800">Excluir Lançamento?</h3>
            <div className="flex space-x-3 pt-4"><button onClick={() => setRecordToDelete(null)} className="w-1/2 border bg-slate-50 text-slate-600 p-2.5 rounded-lg font-medium">Voltar</button><button onClick={() => deleteRecordMutation.mutate(recordToDelete.id)} className="w-1/2 bg-red-600 text-white p-2.5 rounded-lg font-bold">Sim, Excluir</button></div>
          </div>
        </div>
      )}

    </div>
  );
}