import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ArrowUpCircle, ArrowDownCircle, Trash2, Repeat, CheckCircle, Clock, Edit2, X, AlertTriangle, Calendar, Wallet, TrendingUp, TrendingDown, PieChart, ChevronLeft, ChevronRight, LayoutList, Columns, Grid, Plus, Loader2, Camera, Upload, ScanBarcode, Copy } from 'lucide-react';

export default function Financeiro() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>(
    window.innerWidth < 768 ? 'day' : 'month'
  );
  
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [actionMenuDate, setActionMenuDate] = useState<string | null>(null);

  // ESTADOS DO ESCANER INTELIGENTE
  const [isScanning, setIsScanning] = useState(false);
  const [scannedData, setScannedData] = useState<any>(null);

  const [financeType, setFinanceType] = useState<'income' | 'expense'>('expense');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [financeDate, setFinanceDate] = useState(todayStr);
  const [category, setCategory] = useState('Geral');
  const [isRecurring, setIsRecurring] = useState(false);
  const [notes, setNotes] = useState('');
  const [receiver, setReceiver] = useState('');
  const [barcode, setBarcode] = useState('');

  const { data: records = [], isLoading } = useQuery({ 
    queryKey: ['personal-finances'], 
    queryFn: async () => { 
      const { data, error } = await supabase.from('personal_finances').select('*').order('finance_date', { ascending: true }); 
      if (error) throw error;
      return data || []; 
    }
  });

  const safeSelectedDate = selectedDate || todayStr;
  const currentMonthStr = safeSelectedDate.substring(0, 7);
  
  const metrics = useMemo(() => {
    let totalIncomes = 0; let receivedIncomes = 0;
    let totalExpenses = 0; let paidExpenses = 0;

    records.filter((r: any) => r.finance_date?.startsWith(currentMonthStr)).forEach((r: any) => {
      const val = parseFloat(r.amount || 0);
      if (r.type === 'income') {
        totalIncomes += val;
        if (r.is_completed) receivedIncomes += val;
      } else {
        totalExpenses += val;
        if (r.is_completed) paidExpenses += val;
      }
    });

    return { 
      totalIncomes, receivedIncomes, 
      totalExpenses, paidExpenses, 
      netRealCash: receivedIncomes - paidExpenses, 
      netProjected: totalIncomes - totalExpenses 
    };
  }, [records, currentMonthStr]);

  const handleNavigateDate = (direction: 'prev' | 'next') => {
    const currentDate = new Date(safeSelectedDate + 'T12:00:00');
    const modifier = direction === 'next' ? 1 : -1;
    if (viewMode === 'month') currentDate.setMonth(currentDate.getMonth() + modifier);
    else if (viewMode === 'week') currentDate.setDate(currentDate.getDate() + (7 * modifier));
    else currentDate.setDate(currentDate.getDate() + modifier);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  const getWeekDates = (dateStr: string) => {
    const curr = new Date(dateStr + 'T00:00:00'); 
    const day = curr.getDay(); 
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1); 
    const week = [];
    for (let i = 0; i < 7; i++) { 
      const tempDate = new Date(curr);
      tempDate.setDate(diff + i);
      week.push(tempDate.toISOString().split('T')[0]); 
    } 
    return week;
  };

  const getMonthDates = (dateStr: string) => {
    const curr = new Date(dateStr + 'T00:00:00'); 
    const year = curr.getFullYear(); 
    const month = curr.getMonth();
    const firstDay = new Date(year, month, 1); 
    const lastDay = new Date(year, month + 1, 0);
    let startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const daysArray = [];
    for (let i = startDay; i > 0; i--) { 
      daysArray.push({ dateStr: new Date(year, month, 1 - i).toISOString().split('T')[0], isCurrentMonth: false }); 
    }
    for (let i = 1; i <= lastDay.getDate(); i++) { 
      daysArray.push({ dateStr: new Date(year, month, i).toISOString().split('T')[0], isCurrentMonth: true }); 
    }
    return daysArray;
  };

  const weekDates = getWeekDates(safeSelectedDate);
  const monthDays = getMonthDates(safeSelectedDate);

  const filteredRecords = records.filter((r: any) => {
    if (!r.finance_date) return false;
    if (viewMode === 'day') return r.finance_date === safeSelectedDate;
    if (viewMode === 'week') return weekDates.includes(r.finance_date);
    if (viewMode === 'month') {
      if (monthDays.length === 0) return false;
      return r.finance_date >= monthDays[0].dateStr && r.finance_date <= monthDays[monthDays.length - 1].dateStr;
    }
    return false;
  });

  const addMutation = useMutation({
    mutationFn: async (payload?: any) => {
      const dataToSave = payload || {
        description: desc, amount: parseFloat(String(amount).replace(',', '.')), 
        finance_date: financeDate, type: financeType, category, is_recurring: isRecurring, 
        is_completed: false, notes: notes || null, receiver_name: receiver || null, barcode: barcode || null
      };

      const { error } = await supabase.from('personal_finances').insert([dataToSave]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-finances'] });
      setShowAddModal(false); 
      setScannedData(null);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: any) => {
      const formattedAmount = parseFloat(String(data.amount).replace(',', '.'));
      const { error } = await supabase.from('personal_finances').update({
        description: data.desc, amount: formattedAmount, finance_date: data.date, category: data.category, 
        notes: data.notes || null, receiver_name: data.receiver || null, barcode: data.barcode || null
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['personal-finances'] }); setEditingItem(null); }
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: any) => {
      const { error } = await supabase.from('personal_finances').update({ is_completed: !currentStatus }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['personal-finances'] }); }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('personal_finances').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['personal-finances'] }); setItemToDelete(null); setEditingItem(null); }
  });

  const resetForm = () => { setDesc(''); setAmount(''); setNotes(''); setIsRecurring(false); setCategory('Geral'); setReceiver(''); setBarcode(''); };

  const openAddModalForType = (type: 'income' | 'expense', dateStr?: string) => {
    setFinanceType(type);
    if (dateStr) setFinanceDate(dateStr);
    setActionMenuDate(null);
    setShowAddModal(true);
  };

  const formatCurrency = (val: number) => {
    if (isNaN(val) || val === null || val === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setActionMenuDate(null);

    setTimeout(() => {
      setIsScanning(false);
      setScannedData({
        description: 'Boleto Digitalizado',
        amount: '145,90',
        finance_date: new Date(new Date().setDate(new Date().getDate() + 3)).toISOString().split('T')[0], 
        receiver_name: 'ENEL DISTRIBUICAO SAO PAULO',
        barcode: '8468000000145900001000000000000000000000',
        type: 'expense',
        category: 'Fixas'
      });
    }, 2500);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmScannedData = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      description: scannedData.description,
      amount: parseFloat(String(scannedData.amount).replace(',', '.')),
      finance_date: scannedData.finance_date,
      type: 'expense',
      category: scannedData.category,
      receiver_name: scannedData.receiver_name,
      barcode: scannedData.barcode,
      is_completed: false,
      is_recurring: false
    };
    addMutation.mutate(payload);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Código copiado!');
  };

  const renderFinanceRow = (item: any) => {
    const isIncome = item.type === 'income';
    const isComp = item.is_completed ?? false;
    
    let boxClass = isIncome ? 'border-emerald-100 hover:bg-emerald-50/50' : 'border-rose-100 hover:bg-rose-50/50';
    let iconClass = isIncome ? 'text-emerald-500 bg-emerald-100' : 'text-rose-500 bg-rose-100';
    let textClass = isIncome ? 'text-emerald-700' : 'text-rose-700';

    if (isComp) {
      boxClass = 'border-slate-100 bg-slate-50';
      iconClass = 'text-slate-400 bg-slate-200';
      textClass = 'text-slate-500 line-through opacity-70';
    }

    return (
      <div key={item.id} className={`p-3 mb-2 flex flex-col md:flex-row md:items-center justify-between transition-colors border rounded-xl bg-white ${boxClass}`}>
        <div className="flex items-center space-x-3 mb-2 md:mb-0 w-full md:w-auto">
          <div className={`p-2 rounded-lg flex items-center justify-center shrink-0 ${iconClass}`}>
            {isIncome ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className={`font-bold flex items-center space-x-2 text-sm ${textClass}`}>
              <span className="truncate">{item.description}</span>
              <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded uppercase font-bold no-underline shrink-0">{item.category || 'Geral'}</span>
              {item.barcode && <ScanBarcode size={14} className="text-slate-400 shrink-0" title="Contém Código de Barras/Pix"/>}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <Calendar size={12} /> {isComp ? 'Baixado' : 'Vencimento'}: {new Date(item.finance_date + 'T00:00:00').toLocaleDateString('pt-BR')}
            </p>
            {item.receiver_name && <p className="text-[10px] text-slate-400 truncate mt-0.5">Recebedor: {item.receiver_name}</p>}
          </div>
        </div>
        
        <div className="flex items-center space-x-2 flex-wrap gap-y-2 justify-end">
          <span className={`font-black text-base mr-2 ${isComp ? 'text-slate-500' : isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatCurrency(item.amount)}
          </span>

          <button onClick={() => toggleStatusMutation.mutate({ id: item.id, currentStatus: isComp })} className={`px-2.5 py-1.5 rounded-lg font-bold uppercase flex items-center gap-1 transition-all text-[10px] shadow-sm ${isComp ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : isIncome ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'}`}>
            {isComp ? <><X size={12}/> Desfazer</> : <><CheckCircle size={12}/> {isIncome ? 'Receber' : 'Pagar'}</>}
          </button>

          <button onClick={() => setItemToDelete(item)} className="p-1.5 border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-lg transition-colors"><Trash2 size={14} /></button>
          <button onClick={() => setEditingItem(item)} className="p-1.5 border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors"><Edit2 size={14} /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-[calc(100dvh-100px)] md:h-[calc(100vh-4rem)] flex flex-col space-y-2 md:space-y-3 pb-4 relative">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 leading-none">Calendário Financeiro</h2>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="bg-slate-200 p-0.5 rounded-lg flex items-center space-x-0.5">
            <button onClick={() => setViewMode('day')} className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === 'day' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><LayoutList size={12} /> <span>Dia</span></button>
            <button onClick={() => setViewMode('week')} className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === 'week' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Columns size={12} /> <span>Semana</span></button>
            <button onClick={() => setViewMode('month')} className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === 'month' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Grid size={12} /> <span>Mês</span></button>
          </div>

          <div className="flex items-center bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden h-8">
            <button onClick={() => handleNavigateDate('prev')} className="px-2 hover:text-rose-600 hover:bg-rose-50 transition-colors border-r border-slate-200 h-full flex items-center"><ChevronLeft size={16} /></button>
            <button onClick={() => setSelectedDate(todayStr)} className="px-3 text-xs font-bold text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors border-r border-slate-200 h-full flex items-center">Hoje</button>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="px-2 text-xs font-bold text-slate-700 outline-none focus:ring-0 bg-transparent border-none h-full" />
            <button onClick={() => handleNavigateDate('next')} className="px-2 hover:text-rose-600 hover:bg-rose-50 transition-colors border-l border-slate-200 h-full flex items-center"><ChevronRight size={16} /></button>
          </div>
          
          <div className="flex space-x-2 h-8">
            <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <button onClick={() => fileInputRef.current?.click()} className="bg-slate-800 text-white px-3 rounded-lg font-bold hover:bg-slate-900 transition-colors flex items-center space-x-1.5 shadow-sm text-xs" title="Tirar foto ou enviar PDF da conta">
              <Camera size={14} /> <span className="hidden sm:inline">Escanear Conta</span>
            </button>
            <button onClick={() => openAddModalForType('expense', safeSelectedDate)} className="bg-rose-600 text-white px-3 rounded-lg font-bold hover:bg-rose-700 transition-colors flex items-center space-x-1.5 shadow-sm text-xs"><Plus size={14} /> <span className="hidden sm:inline">Lançamento</span></button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 shrink-0">
        <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div><p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Caixa Real</p><p className={`text-base md:text-xl font-black ${metrics.netRealCash >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(metrics.netRealCash)}</p></div><div className="bg-slate-50 p-2 md:p-3 rounded-lg text-slate-600 hidden sm:block"><Wallet size={20} /></div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div><p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Projeção Mês</p><p className={`text-base md:text-xl font-black ${metrics.netProjected >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{formatCurrency(metrics.netProjected)}</p></div><div className="bg-slate-50 p-2 md:p-3 rounded-lg text-slate-600 hidden sm:block"><PieChart size={20} /></div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div><p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Receitas</p><p className="text-base md:text-xl font-black text-emerald-600">{formatCurrency(metrics.receivedIncomes)} <span className="text-[10px] md:text-xs font-normal text-slate-400 block sm:inline">/ {formatCurrency(metrics.totalIncomes)}</span></p></div><div className="bg-emerald-50 p-2 md:p-3 rounded-lg text-emerald-600 hidden sm:block"><TrendingUp size={20} /></div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div><p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Despesas</p><p className="text-base md:text-xl font-black text-rose-600">{formatCurrency(metrics.paidExpenses)} <span className="text-[10px] md:text-xs font-normal text-slate-400 block sm:inline">/ {formatCurrency(metrics.totalExpenses)}</span></p></div><div className="bg-rose-50 p-2 md:p-3 rounded-lg text-rose-600 hidden sm:block"><TrendingDown size={20} /></div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col min-h-0 overflow-hidden w-full">
        <div className="py-2 px-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between text-slate-600 font-medium shrink-0 text-sm">
          <div className="flex items-center space-x-2"><Calendar size={16} /> <span>{viewMode === 'day' && `Contas do dia ${safeSelectedDate.split('-').reverse().join('/')}`} {viewMode === 'week' && `Contas da Semana`} {viewMode === 'month' && `Contas do Mês (${new Date(safeSelectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })})`}</span></div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400"><Loader2 className="animate-spin mb-2 text-rose-500" size={32} /></div>
        ) : viewMode === 'day' ? (
          <div className="flex-1 overflow-y-auto min-h-0 p-3 bg-slate-50/50">
             {filteredRecords.length === 0 ? <div className="text-center text-slate-400 py-12">Nenhuma conta para este dia.</div> : filteredRecords.map((item: any) => renderFinanceRow(item))}
          </div>
        ) : viewMode === 'week' ? (
          <div className="flex-1 flex min-h-0 divide-x divide-slate-200 bg-slate-50 overflow-x-auto">
            {weekDates.map((dateStr) => {
              const dayItems = filteredRecords.filter((r: any) => r.finance_date === dateStr);
              const isToday = dateStr === todayStr; const dateObj = new Date(dateStr + 'T00:00:00');
              return (
                <div key={dateStr} onClick={() => setActionMenuDate(dateStr)} className={`flex flex-col bg-white min-w-[160px] flex-1 cursor-pointer hover:bg-slate-50/50 transition-colors ${isToday ? 'ring-2 ring-rose-500 ring-inset' : ''}`}>
                  <div className={`py-1.5 text-center border-b border-slate-200 shrink-0 ${isToday ? 'bg-rose-600 text-white font-bold' : 'bg-slate-100 text-slate-700'}`}><p className="text-[10px] tracking-wider uppercase">{dateObj.toLocaleDateString('pt-BR', { weekday: 'short' })}</p><p className="text-xs font-extrabold">{dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</p></div>
                  <div className="p-1.5 space-y-1.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {dayItems.length === 0 ? <p className="text-[10px] text-slate-300 text-center py-4 italic">Sem contas</p> : dayItems.map((item: any) => {
                      const isComp = item.is_completed ?? false; const isInc = item.type === 'income';
                      let bgClass = isInc ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800';
                      if (isComp) bgClass = 'bg-slate-100 border-slate-200 text-slate-500 line-through opacity-70';
                      return (
                        <div key={item.id} onClick={(e) => { e.stopPropagation(); setEditingItem(item); }} className={`p-1.5 rounded border text-[10px] transition-all cursor-pointer shadow-sm ${bgClass}`}>
                          <div className="flex justify-between items-center mb-0.5 font-bold"><span className="flex items-center gap-0.5">{isInc ? <ArrowUpCircle size={10}/> : <ArrowDownCircle size={10}/>} R$ {parseFloat(item.amount).toFixed(2)}</span><button onClick={(e) => { e.stopPropagation(); toggleStatusMutation.mutate({ id: item.id, currentStatus: isComp }); }} className="opacity-60 hover:opacity-100" title={isComp ? 'Desfazer' : 'Baixar'}>{isComp ? <X size={12}/> : <CheckCircle size={12}/>}</button></div><p className="font-semibold truncate">{item.description}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="grid grid-cols-7 bg-slate-100 border-b border-slate-200 text-center text-[10px] font-extrabold text-slate-500 uppercase shrink-0"><div className="py-1.5">Seg</div><div className="py-1.5">Ter</div><div className="py-1.5">Qua</div><div className="py-1.5">Qui</div><div className="py-1.5">Sex</div><div className="py-1.5">Sáb</div><div className="py-1.5">Dom</div></div>
            <div className="flex-1 grid grid-cols-7 auto-rows-fr bg-slate-200 gap-px min-h-0">
              {monthDays.map((dayItem, idx) => {
                const dayItems = filteredRecords.filter((r: any) => r.finance_date === dayItem.dateStr);
                const isToday = dayItem.dateStr === todayStr; const dayNum = dayItem.dateStr.split('-')[2];
                return (
                  <div key={idx} onClick={() => setActionMenuDate(dayItem.dateStr)} className={`bg-white p-1 flex flex-col min-h-0 cursor-pointer hover:bg-slate-50/50 transition-colors ${!dayItem.isCurrentMonth ? 'opacity-40 bg-slate-50' : ''} ${isToday ? 'ring-2 ring-rose-500 ring-inset bg-rose-50/10' : ''}`}>
                    <div className="mb-1 shrink-0"><span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${isToday ? 'bg-rose-600 text-white' : 'text-slate-600'}`}>{dayNum}</span></div>
                    <div className="space-y-1 overflow-y-auto flex-1 min-h-0 pr-0.5 custom-scrollbar">
                      {dayItems.map((item: any) => {
                        const isComp = item.is_completed ?? false; const isInc = item.type === 'income';
                        let bgClass = isInc ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800';
                        if (isComp) bgClass = 'bg-slate-100 border-slate-200 text-slate-400 line-through opacity-60';

                        // AQUI ESTÁ A ALTERAÇÃO DO TESTE (Valor aparecendo na visão mensal)
                        return (
                          <div key={item.id} onClick={(e) => { e.stopPropagation(); setEditingItem(item); }} className={`p-1 rounded border text-[9px] cursor-pointer transition-all flex items-center justify-between ${bgClass}`} title={`${item.description} - R$ ${item.amount}`}>
                            <span className="truncate flex items-center gap-0.5 font-bold">
                              {isInc ? <ArrowUpCircle size={8} className="shrink-0"/> : <ArrowDownCircle size={8} className="shrink-0"/>} {item.description}
                            </span>
                            <span className="shrink-0 ml-1 font-black tracking-tighter">
                              R$ {parseFloat(item.amount || 0).toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {isScanning && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-[60]">
          <div className="bg-white p-6 rounded-2xl flex flex-col items-center max-w-sm w-full animate-in zoom-in-95 shadow-2xl">
            <ScanBarcode size={48} className="text-rose-500 animate-pulse mb-4" />
            <h3 className="text-lg font-black text-slate-800 mb-1">Analisando Arquivo...</h3>
            <p className="text-sm text-slate-500 text-center">Nossa inteligência está lendo os dados, código de barras e valores. Aguarde.</p>
            <div className="w-full bg-slate-100 h-2 rounded-full mt-6 overflow-hidden">
               <div className="bg-rose-500 h-full animate-[progress_2.5s_ease-in-out_forwards]" style={{width: '100%'}}></div>
            </div>
          </div>
        </div>
      )}

      {scannedData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><ScanBarcode className="text-rose-600"/> Dados Encontrados</h3>
              <button onClick={() => setScannedData(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            
            <p className="text-xs text-slate-500">Revise os dados que o sistema identificou na imagem antes de salvar na agenda.</p>

            <form onSubmit={handleConfirmScannedData} className="space-y-4 pt-2">
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Recebedor Identificado</label><input required value={scannedData.receiver_name} onChange={e => setScannedData({...scannedData, receiver_name: e.target.value})} className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-sm font-medium bg-slate-50" /></div>
              
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Descrição</label><input required value={scannedData.description} onChange={e => setScannedData({...scannedData, description: e.target.value})} className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-sm" /></div>
              
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Valor do Boleto</label><input required value={scannedData.amount} onChange={e => setScannedData({...scannedData, amount: e.target.value})} className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm font-black text-rose-600 bg-rose-50" /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Data de Vencimento</label><input type="date" required value={scannedData.finance_date} onChange={e => setScannedData({...scannedData, finance_date: e.target.value})} className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm font-bold bg-rose-50 text-rose-700" /></div>
              </div>
              
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Código de Barras / Linha Digitável PIX</label><textarea required value={scannedData.barcode} onChange={e => setScannedData({...scannedData, barcode: e.target.value})} rows={2} className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-[11px] font-mono resize-none bg-slate-50" /></div>
              
              <div className="flex space-x-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setScannedData(null)} className="w-1/2 border p-2.5 rounded-xl text-slate-500 font-bold text-sm hover:bg-slate-50">Descartar</button>
                <button type="submit" disabled={addMutation.isPending} className="w-1/2 bg-slate-800 hover:bg-slate-900 text-white p-2.5 rounded-xl font-bold text-sm shadow-sm">Confirmar e Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {actionMenuDate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-40" onClick={() => setActionMenuDate(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-xs w-full p-4 space-y-2 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 text-center border-b border-slate-100 pb-3">Lançamentos para {new Date(actionMenuDate + 'T12:00:00').toLocaleDateString('pt-BR')}</h3>
            <button onClick={() => { fileInputRef.current?.click(); setActionMenuDate(null); }} className="w-full flex items-center gap-3 p-3.5 bg-slate-800 text-white hover:bg-slate-900 rounded-xl font-bold transition-colors shadow-sm"><Camera size={20}/> Escanear Arquivo</button>
            <button onClick={() => openAddModalForType('income', actionMenuDate)} className="w-full flex items-center gap-3 p-3.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold transition-colors mt-2"><ArrowUpCircle size={20}/> Adicionar Receita</button>
            <button onClick={() => openAddModalForType('expense', actionMenuDate)} className="w-full flex items-center gap-3 p-3.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl font-bold transition-colors"><ArrowDownCircle size={20}/> Adicionar Despesa</button>
            <button onClick={() => { setViewMode('day'); setSelectedDate(actionMenuDate); setActionMenuDate(null); }} className="w-full flex items-center gap-3 p-3.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-colors">
              <LayoutList size={20}/> Ver Detalhes do Dia
            </button>
            <button onClick={() => setActionMenuDate(null)} className="w-full p-2.5 mt-2 text-slate-400 hover:text-slate-600 font-medium text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center"><h3 className="text-xl font-bold text-slate-800">Novo Lançamento</h3><button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button></div>
            <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
              <button onClick={() => setFinanceType('income')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${financeType === 'income' ? 'bg-emerald-500 shadow-sm text-white' : 'text-slate-500 hover:text-slate-700'}`}><ArrowUpCircle size={14}/> Receita</button>
              <button onClick={() => setFinanceType('expense')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${financeType === 'expense' ? 'bg-rose-500 shadow-sm text-white' : 'text-slate-500 hover:text-slate-700'}`}><ArrowDownCircle size={14}/> Despesa</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }} className="space-y-4">
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Descrição</label><input required value={desc} onChange={e => setDesc(e.target.value)} className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-sm" placeholder="Ex: Aluguel, Produto..." /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Valor (R$)</label><input required value={amount} onChange={e => setAmount(e.target.value)} className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-sm font-bold" placeholder="0,00" /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Data</label><input type="date" required value={financeDate} onChange={e => setFinanceDate(e.target.value)} className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-sm" /></div>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Categoria</label><select value={category} onChange={e => setCategory(e.target.value)} className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-sm bg-white font-medium"><option value="Geral">Geral</option><option value="Fixas">Despesa Fixa</option><option value="Variáveis">Despesa Variável</option><option value="Investimentos">Investimento</option><option value="Clientes">Receita de Clientes</option></select></div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="w-1/2 border p-2.5 rounded-xl text-slate-500 font-medium text-sm">Cancelar</button>
                <button type="submit" disabled={addMutation.isPending} className={`w-1/2 text-white p-2.5 rounded-xl font-bold text-sm shadow-sm ${financeType === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <div><h3 className="text-xl font-bold text-slate-800">Editar Conta</h3>{editingItem.is_completed && <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold uppercase mt-1 inline-block">Baixado</span>}</div>
              <div className="flex gap-1"><button onClick={() => setItemToDelete(editingItem)} className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={20}/></button><button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg"><X size={20}/></button></div>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault(); const form = e.currentTarget;
              const data = {
                desc: (form.elements.namedItem('editDesc') as HTMLInputElement).value,
                amount: (form.elements.namedItem('editAmount') as HTMLInputElement).value,
                date: (form.elements.namedItem('editDate') as HTMLInputElement).value,
                category: (form.elements.namedItem('editCategory') as HTMLSelectElement).value,
                receiver: (form.elements.namedItem('editReceiver') as HTMLInputElement).value,
                barcode: (form.elements.namedItem('editBarcode') as HTMLInputElement).value,
                notes: (form.elements.namedItem('editNotes') as HTMLInputElement).value
              };
              updateMutation.mutate({ id: editingItem.id, data });
            }} className="space-y-4">
              {editingItem.receiver_name && (
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Recebedor</label><input name="editReceiver" defaultValue={editingItem.receiver_name} className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-sm font-medium bg-slate-50 text-slate-600" /></div>
              )}
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Descrição</label><input name="editDesc" defaultValue={editingItem.description} required className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-sm" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Valor (R$)</label><input name="editAmount" defaultValue={String(editingItem.amount).replace('.', ',')} required className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-sm font-bold" /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Data</label><input type="date" name="editDate" defaultValue={editingItem.finance_date} required className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-sm" /></div>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Categoria</label><select name="editCategory" defaultValue={editingItem.category || 'Geral'} className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-sm bg-white font-medium"><option value="Geral">Geral</option><option value="Fixas">Despesa Fixa</option><option value="Variáveis">Despesa Variável</option><option value="Investimentos">Investimento</option><option value="Clientes">Receita de Clientes</option></select></div>
              {editingItem.barcode && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Código de Barras / PIX</label>
                  <div className="flex gap-2">
                    <input name="editBarcode" defaultValue={editingItem.barcode} className="w-full border p-2 rounded-lg text-[10px] font-mono bg-white outline-none" />
                    <button type="button" onClick={() => copyToClipboard(editingItem.barcode)} className="p-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700" title="Copiar"><Copy size={16}/></button>
                  </div>
                </div>
              )}
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Observações</label><textarea name="editNotes" defaultValue={editingItem.notes || ''} rows={2} className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-400 text-xs resize-none" /></div>
              <div className="pt-2"><button type="button" onClick={() => toggleStatusMutation.mutate({ id: editingItem.id, currentStatus: editingItem.is_completed })} className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${editingItem.is_completed ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : editingItem.type === 'income' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'}`}>{editingItem.is_completed ? <><X size={18}/> Desfazer Baixa</> : <><CheckCircle size={18}/> Marcar como {editingItem.type === 'income' ? 'Recebido' : 'Pago'}</>}</button></div>
              <div className="flex space-x-3 pt-2"><button type="button" onClick={() => setEditingItem(null)} className="w-1/2 border p-2.5 rounded-xl text-slate-500 font-medium text-sm">Cancelar</button><button type="submit" disabled={updateMutation.isPending} className="w-1/2 bg-slate-800 hover:bg-slate-900 text-white p-2.5 rounded-xl font-bold text-sm shadow-sm">Atualizar Conta</button></div>
            </form>
          </div>
        </div>
      )}

      {itemToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="flex justify-center text-red-500 mb-2"><AlertTriangle size={48} /></div><h3 className="text-xl font-bold text-slate-800">Excluir Conta?</h3><p className="text-sm text-slate-500">Tem certeza que deseja remover <strong>{itemToDelete.description}</strong> permanentemente?</p>
            <div className="flex space-x-3 pt-4"><button onClick={() => setItemToDelete(null)} className="w-1/2 border border-slate-200 bg-slate-50 text-slate-600 p-2.5 rounded-xl font-medium text-sm">Cancelar</button><button onClick={() => deleteMutation.mutate(itemToDelete.id)} disabled={deleteMutation.isPending} className="w-1/2 bg-red-600 hover:bg-red-700 text-white p-2.5 rounded-xl font-bold text-sm shadow-sm">Sim, Excluir</button></div>
          </div>
        </div>
      )}
    </div>
  );
}