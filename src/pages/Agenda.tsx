import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, Clock, User, Plus, Loader2, Edit2, X, LayoutList, Columns, Grid, Trash2, AlertTriangle, Search, Lock, Coffee, ChevronLeft, ChevronRight, CheckCircle, CalendarHeart, Repeat } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNetworkState } from 'react-use';
import { useNavigate } from 'react-router-dom';

export default function Agenda() {
  const { online } = useNetworkState();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [editingBlock, setEditingBlock] = useState<any>(null);
  const [appointmentToDelete, setAppointmentToDelete] = useState<any>(null);
  
  const [actionMenuDate, setActionMenuDate] = useState<string | null>(null);
  const [appointmentType, setAppointmentType] = useState<'appointment' | 'reminder'>('appointment');

  const [showAppointments, setShowAppointments] = useState(true);
  const [showReminders, setShowReminders] = useState(true);

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>(
    window.innerWidth < 768 ? 'day' : 'month'
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [serviceName, setServiceName] = useState('');
  const [servicePrice, setServicePrice] = useState('65,00');
  const [appointmentDate, setAppointmentDate] = useState(todayStr);
  const [appointmentTime, setAppointmentTime] = useState('09:00');
  const [isRecurring, setIsRecurring] = useState(false);

  const [blockDate, setBlockDate] = useState(todayStr);
  const [blockStartTime, setBlockStartTime] = useState('12:00');
  const [blockEndTime, setBlockEndTime] = useState('13:00');
  const [blockReason, setBlockReason] = useState('Almoço');

  const [editServiceName, setEditServiceName] = useState('');
  const [editServicePrice, setEditServicePrice] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`id, start_time, end_time, status, is_block, block_reason, whatsapp_sent_at, return_reminder_date, return_reminder_sent, return_reminder_sent_at, is_manual_reminder, is_recurring, recurring_group_id, clients ( id, name, phone ), services ( id, name, price, commission_rate )`)
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  const { data: clientsList = [] } = useQuery({
    queryKey: ['clients-list-agenda'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name, phone').order('name');
      if (error) throw error;
      return data || [];
    }
  });

  const addAppointmentMutation = useMutation({
    mutationFn: async (newApt: any) => {
      const formattedPrice = parseFloat(String(newApt.service_price).replace(',', '.'));
      const { data: service, error: sError } = await supabase.from('services').insert([{ name: newApt.service_name, price: formattedPrice, commission_rate: 40.0, duration_minutes: 45 }]).select().single();
      if (sError) throw sError;
      
      const inserts = [];
      const groupId = newApt.is_recurring ? Math.random().toString(36).substring(2, 15) : null;
      const loopCount = newApt.is_recurring ? 24 : 1;

      for (let i = 0; i < loopCount; i++) {
        const start = new Date(`${newApt.date}T${newApt.time}:00`);
        start.setMonth(start.getMonth() + i);
        const end = new Date(start.getTime() + 45 * 60000);
        
        inserts.push({ 
          client_id: newApt.client_id, 
          service_id: service.id, 
          start_time: start.toISOString(), 
          end_time: end.toISOString(), 
          status: 'scheduled', 
          is_block: false,
          is_manual_reminder: newApt.type === 'reminder',
          is_recurring: newApt.is_recurring,
          recurring_group_id: groupId
        });
      }

      const { error: aError } = await supabase.from('appointments').insert(inserts);
      if (aError) throw aError;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['appointments-list'] }); 
      setShowAddModal(false); 
      setSelectedClient(null); 
      setClientSearchTerm(''); 
      setServiceName(''); 
      setServicePrice('65,00'); 
      setIsRecurring(false);
    }
  });

  const addBlockMutation = useMutation({
    mutationFn: async (block: any) => {
      const start = new Date(`${block.date}T${block.startTime}:00`);
      const end = new Date(`${block.date}T${block.endTime}:00`);
      const { error } = await supabase.from('appointments').insert([{ is_block: true, block_reason: block.reason, start_time: start.toISOString(), end_time: end.toISOString(), status: 'scheduled' }]);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments-list'] }); closeBlockModal(); }
  });

  const updateBlockMutation = useMutation({
    mutationFn: async (blockData: any) => {
      const start = new Date(`${blockData.date}T${blockData.startTime}:00`);
      const end = new Date(`${blockData.date}T${blockData.endTime}:00`);
      const { error } = await supabase.from('appointments').update({ 
        start_time: start.toISOString(), 
        end_time: end.toISOString(), 
        block_reason: blockData.reason 
      }).eq('id', blockData.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments-list'] }); closeBlockModal(); }
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async (updatedData: any) => {
      const start = new Date(`${updatedData.date}T${updatedData.time}:00`);
      const end = new Date(start.getTime() + 45 * 60000);
      const { error: aError } = await supabase.from('appointments').update({ start_time: start.toISOString(), end_time: end.toISOString() }).eq('id', updatedData.id);
      if (aError) throw aError;
      const formattedPrice = parseFloat(String(updatedData.price).replace(',', '.'));
      if (updatedData.serviceId) {
        const { error: sError } = await supabase.from('services').update({ name: updatedData.serviceName, price: formattedPrice }).eq('id', updatedData.serviceId);
        if (sError) throw sError;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments-list'] }); setEditingAppointment(null); }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments-list'] }); setEditingAppointment(null); }
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: async (apt: any) => {
      if (apt.is_reminder_event && !apt.is_manual_reminder) {
        const { error } = await supabase.from('appointments').update({ return_reminder_date: null }).eq('id', apt.id);
        if (error) throw error;
      } else if (apt.is_recurring && apt.recurring_group_id) {
        const { error } = await supabase.from('appointments')
          .delete()
          .eq('recurring_group_id', apt.recurring_group_id)
          .gte('start_time', apt.start_time);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('appointments').delete().eq('id', apt.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['appointments-list'] }); 
      setAppointmentToDelete(null); 
      setEditingAppointment(null);
      setEditingBlock(null);
      setShowBlockModal(false);
    }
  });

  const markWhatsAppSentMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string, type: 'appointment' | 'reminder' }) => {
      const payload = type === 'appointment' ? { whatsapp_sent_at: new Date().toISOString() } : { return_reminder_sent: true, return_reminder_sent_at: new Date().toISOString() };
      const { error } = await supabase.from('appointments').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments-list'] }); }
  });

  const closeBlockModal = () => {
    setShowBlockModal(false);
    setEditingBlock(null);
    setBlockDate(todayStr);
    setBlockStartTime('12:00');
    setBlockEndTime('13:00');
    setBlockReason('Almoço');
  };

  const openAddModalForType = (type: 'appointment' | 'reminder', dateStr?: string) => {
    setAppointmentType(type);
    setIsRecurring(false);
    if (dateStr) setAppointmentDate(dateStr);
    setActionMenuDate(null);
    setShowAddModal(true);
  };

  const openBlockModalForDate = (dateStr?: string) => {
    if (dateStr) setBlockDate(dateStr);
    setActionMenuDate(null);
    setEditingBlock(null);
    setBlockStartTime('12:00');
    setBlockEndTime('13:00');
    setBlockReason('Almoço');
    setShowBlockModal(true);
  };

  const openEditBlockModal = (block: any) => {
    setEditingBlock(block);
    const start = new Date(block.start_time);
    const end = new Date(block.end_time);
    setBlockDate(start.toISOString().split('T')[0]);
    setBlockStartTime(start.toTimeString().slice(0, 5));
    setBlockEndTime(end.toTimeString().slice(0, 5));
    setBlockReason(block.block_reason || '');
    setShowBlockModal(true);
  };

  const handleAddSubmit = (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (!selectedClient) return alert("Selecione uma cliente."); 
    addAppointmentMutation.mutate({ 
      client_id: selectedClient.id, 
      service_name: serviceName, 
      service_price: servicePrice, 
      date: appointmentDate, 
      time: appointmentTime, 
      type: appointmentType,
      is_recurring: isRecurring
    }); 
  };
  
  const handleAddBlockSubmit = (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (blockEndTime <= blockStartTime) return alert("O horário final deve ser maior que o inicial."); 
    if (editingBlock) {
      updateBlockMutation.mutate({ id: editingBlock.id, date: blockDate, startTime: blockStartTime, endTime: blockEndTime, reason: blockReason });
    } else {
      addBlockMutation.mutate({ date: blockDate, startTime: blockStartTime, endTime: blockEndTime, reason: blockReason }); 
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!editingAppointment) return; updateAppointmentMutation.mutate({ id: editingAppointment.id, serviceId: editingAppointment.services?.id, serviceName: editServiceName, price: editServicePrice, date: editDate, time: editTime }); };

  const openEditModal = (apt: any) => {
    setEditingAppointment(apt); setEditServiceName(apt.services?.name || ''); setEditServicePrice(apt.services?.price ? String(apt.services.price).replace('.', ',') : '');
    const aptDate = new Date(apt.start_time); setEditDate(aptDate.toISOString().split('T')[0]); setEditTime(aptDate.toTimeString().slice(0, 5));
  };

  const handleSendToCheckout = (apt: any) => { setEditingAppointment(null); navigate('/pdv', { state: { appointment: apt } }); };

  const handleSendWhatsApp = (apt: any) => {
    const phone = apt.clients?.phone;
    const cName = apt.clients?.name.split(' ')[0] || 'Cliente'; 
    if (!phone) return alert(`O cadastro de ${cName} está sem número de WhatsApp.`);
    let cleanPhone = phone.replace(/\D/g, ''); if (cleanPhone.length === 11 || cleanPhone.length === 10) cleanPhone = `55${cleanPhone}`;
    const sName = Array.isArray(apt.services) ? apt.services[0]?.name : apt.services?.name || 'seu procedimento';
    const aptDate = new Date(apt.start_time);
    const message = `Olá, ${cName}! Tudo bem? 🌸\n\nPassando aqui para confirmar o seu horário, dia *${aptDate.toLocaleDateString('pt-BR')}* às *${aptDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}* para realizar o serviço de *${sName}*.\n\nPodemos confirmar sua presença? Te aguardo! 🥰`;
    markWhatsAppSentMutation.mutate({id: apt.id, type: 'appointment'});
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleSendReminderWhatsApp = (apt: any) => {
    const phone = apt.clients?.phone;
    const cName = apt.clients?.name.split(' ')[0] || 'Cliente'; 
    if (!phone) return alert(`O cadastro de ${cName} está sem número de WhatsApp.`);
    let cleanPhone = phone.replace(/\D/g, ''); if (cleanPhone.length === 11 || cleanPhone.length === 10) cleanPhone = `55${cleanPhone}`;
    const sName = Array.isArray(apt.services) ? apt.services[0]?.name : apt.services?.name || 'seu procedimento';
    const message = `Olá, ${cName}! Tudo bem com você? 🌸\n\nAqui é do *Jake Beauty*! Estava lembrando de você hoje e percebi que já está na hora de renovarmos o seu procedimento de *${sName}* para mantermos aqueles resultados maravilhosos que você adora! 🥰\n\nVamos agendar um novo horário? Te aguardo! ✨`;
    markWhatsAppSentMutation.mutate({id: apt.id, type: 'reminder'});
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleNavigateDate = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate + 'T12:00:00');
    const modifier = direction === 'next' ? 1 : -1;
    if (viewMode === 'month') currentDate.setMonth(currentDate.getMonth() + modifier);
    else if (viewMode === 'week') currentDate.setDate(currentDate.getDate() + (7 * modifier));
    else currentDate.setDate(currentDate.getDate() + modifier);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  const filteredSearchClients = clientSearchTerm === '' ? [] : clientsList.filter((c: any) => {
    const cName = c.name || '';
    const cPhone = c.phone || '';
    return cName.toLowerCase().includes(clientSearchTerm.toLowerCase()) || cPhone.includes(clientSearchTerm);
  });

  const getWeekDates = (dateStr: string) => {
    const curr = new Date(dateStr + 'T00:00:00'); const day = curr.getDay(); const diff = curr.getDate() - day + (day === 0 ? -6 : 1); const week = [];
    for (let i = 0; i < 7; i++) { week.push(new Date(curr.setDate(diff + i)).toISOString().split('T')[0]); } return week;
  };

  const getMonthDates = (dateStr: string) => {
    const curr = new Date(dateStr + 'T00:00:00'); const year = curr.getFullYear(); const month = curr.getMonth();
    const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0);
    let startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const daysArray = [];
    for (let i = startDay; i > 0; i--) { daysArray.push({ dateStr: new Date(year, month, 1 - i).toISOString().split('T')[0], isCurrentMonth: false }); }
    for (let i = 1; i <= lastDay.getDate(); i++) { daysArray.push({ dateStr: new Date(year, month, i).toISOString().split('T')[0], isCurrentMonth: true }); }
    return daysArray;
  };

  const weekDates = getWeekDates(selectedDate);
  const monthDays = getMonthDates(selectedDate);

  const allEvents: any[] = [];
  appointments.forEach((apt: any) => {
    if (showAppointments && !apt.is_manual_reminder) {
      allEvents.push({ ...apt, is_reminder_event: false, event_date: new Date(apt.start_time).toISOString().split('T')[0] });
    }
    if (apt.return_reminder_date && showReminders && !apt.is_manual_reminder) {
      allEvents.push({ ...apt, is_reminder_event: true, event_date: apt.return_reminder_date });
    }
    if (apt.is_manual_reminder && showReminders) {
      allEvents.push({ ...apt, is_reminder_event: true, event_date: new Date(apt.start_time).toISOString().split('T')[0] });
    }
  });

  const filteredEvents = allEvents.filter((ev: any) => {
    if (viewMode === 'day') return ev.event_date === selectedDate;
    if (viewMode === 'week') return weekDates.includes(ev.event_date);
    if (viewMode === 'month') return ev.event_date >= monthDays[0].dateStr && ev.event_date <= monthDays[monthDays.length - 1].dateStr;
    return false;
  });

  const selectedDateObj = new Date(selectedDate + 'T12:00:00');
  const weekDayName = selectedDateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
  const formattedWeekDay = weekDayName.charAt(0).toUpperCase() + weekDayName.slice(1);

  const renderEventRow = (ev: any) => {
    const hour = new Date(ev.start_time).getHours().toString().padStart(2, '0');
    const min = new Date(ev.start_time).getMinutes().toString().padStart(2, '0');
    
    if (ev.is_block) {
      const endH = new Date(ev.end_time).getHours().toString().padStart(2, '0');
      const endM = new Date(ev.end_time).getMinutes().toString().padStart(2, '0');
      return (
        <div key={`block-${ev.id}`} onClick={(e) => e.stopPropagation()} className="p-3 mb-2 flex flex-col md:flex-row md:items-center justify-between bg-slate-100 border-l-4 border-slate-400 opacity-90 rounded-r-xl">
          <div className="flex items-center space-x-3">
            <div className="font-bold px-2 py-1.5 rounded-lg flex items-center space-x-1 bg-slate-200 text-slate-600 text-sm"><Clock size={14} /> <span>{hour}:{min} - {endH}:{endM}</span></div>
            <div><h4 className="font-bold text-slate-700 flex items-center space-x-1 text-sm"><Lock size={14} className="text-slate-500" /> <span>Bloqueado</span></h4><p className="text-xs text-slate-500 font-medium">{ev.block_reason}</p></div>
          </div>
          <div className="flex items-center space-x-1.5 mt-2 md:mt-0">
             <button onClick={(e) => { e.stopPropagation(); setAppointmentToDelete(ev); }} className="p-1.5 border border-slate-300 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"><Trash2 size={14} /></button>
             <button onClick={(e) => { e.stopPropagation(); openEditBlockModal(ev); }} className="p-1.5 border border-slate-300 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded-lg transition-colors"><Edit2 size={14} /></button>
          </div>
        </div>
      );
    }

    const cName = ev.clients?.name || 'Cliente Sem Nome';
    const sName = Array.isArray(ev.services) ? ev.services[0]?.name : ev.services?.name || 'Procedimento';
    const sPrice = Array.isArray(ev.services) ? ev.services[0]?.price : ev.services?.price;

    if (ev.is_reminder_event) {
      return (
        <div key={`rem-${ev.id}`} onClick={(e) => e.stopPropagation()} className={`p-3 mb-2 flex flex-col md:flex-row md:items-center justify-between transition-colors border rounded-xl bg-indigo-50 border-indigo-200`}>
          <div className="flex items-center space-x-3 mb-2 md:mb-0">
            <div className="font-bold px-2 py-1.5 rounded-lg flex items-center space-x-1 text-sm bg-indigo-100 text-indigo-700">
              <CalendarHeart size={14} /> <span>Retorno</span>
            </div>
            <div>
              <h4 className="font-bold flex items-center space-x-1 text-sm text-indigo-900">
                <User size={14} className="text-indigo-400" /> <span>{cName}</span>
                {ev.is_recurring && <Repeat size={14} className="ml-1 text-indigo-500" title="Recorrente Mensal" />}
                {ev.return_reminder_sent_at && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ml-2 uppercase font-bold flex items-center gap-1"><CheckCircle size={8}/> Já Chamou ({new Date(ev.return_reminder_sent_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})})</span>}
              </h4>
              <p className="text-xs text-indigo-600">Lembrar de agendar: {sName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-1.5 flex-wrap gap-y-2">
             <button onClick={(e) => { e.stopPropagation(); handleSendReminderWhatsApp(ev); }} className="px-3 py-1.5 border border-emerald-200 text-emerald-700 bg-emerald-100 hover:bg-emerald-200 font-bold rounded-lg transition-colors text-xs flex items-center gap-1.5 shadow-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
                Chamar Cliente
             </button>
             <button onClick={(e) => { e.stopPropagation(); setAppointmentToDelete(ev); }} className="p-1.5 border border-red-100 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors" title="Excluir Lembrete"><Trash2 size={14} /></button>
          </div>
        </div>
      );
    }

    const isCompleted = ev.status === 'completed'; const isCancelled = ev.status === 'cancelled'; const isNoShow = ev.status === 'no_show';
    const isInactive = isCompleted || isCancelled || isNoShow;
    let rowBgClass = 'hover:bg-slate-50'; let timeBadgeClass = 'bg-rose-50 text-rose-700'; let nameClass = 'text-slate-800';

    if (isCompleted) { rowBgClass = 'bg-slate-50'; timeBadgeClass = 'bg-slate-200 text-slate-500'; nameClass = 'text-slate-500 line-through opacity-70'; }
    else if (isCancelled) { rowBgClass = 'bg-slate-50 opacity-60'; timeBadgeClass = 'bg-slate-200 text-slate-400'; nameClass = 'text-slate-400 line-through'; }
    else if (isNoShow) { rowBgClass = 'bg-amber-50/30 opacity-70'; timeBadgeClass = 'bg-amber-100 text-amber-700'; nameClass = 'text-amber-700 line-through'; }

    return (
      <div key={`apt-${ev.id}`} onClick={(e) => e.stopPropagation()} className={`p-3 mb-2 flex flex-col md:flex-row md:items-center justify-between transition-colors border border-slate-100 rounded-xl ${rowBgClass}`}>
        <div className="flex items-center space-x-3 mb-2 md:mb-0">
          <div className={`font-bold px-2 py-1.5 rounded-lg flex items-center space-x-1 text-sm ${timeBadgeClass}`}><Clock size={14} /> <span>{hour}:{min}</span></div>
          <div>
            <h4 className={`font-bold flex items-center space-x-1 text-sm ${nameClass}`}>
              <User size={14} className={isInactive ? 'text-slate-300' : 'text-slate-400'} /> <span>{cName}</span>
              {isCancelled && <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded ml-2 uppercase font-bold">Cancelou</span>}
              {isNoShow && <span className="text-[9px] bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded ml-2 uppercase font-bold">Faltou</span>}
            </h4>
            <p className="text-xs text-slate-500">{sName} {sPrice && `• R$ ${parseFloat(sPrice).toFixed(2).replace('.', ',')}`}</p>
          </div>
        </div>
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-2">
          {!isInactive && (
             <div className="flex items-center space-x-1.5 md:mr-2">
               <div className="flex items-center space-x-1">
                 {ev.whatsapp_sent_at && (<span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-1 rounded flex items-center gap-1 border border-emerald-100"><CheckCircle size={10} /> {new Date(ev.whatsapp_sent_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</span>)}
                 <button onClick={(e) => { e.stopPropagation(); handleSendWhatsApp(ev); }} className="p-1.5 border border-emerald-100 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-700 rounded-lg transition-colors flex items-center justify-center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg></button>
               </div>
               <button onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({id: ev.id, status: 'no_show'}) }} className="px-2.5 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold rounded-lg transition-colors text-xs border border-amber-100 hidden sm:block">Faltou</button>
               <button onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({id: ev.id, status: 'cancelled'}) }} className="px-2.5 py-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 font-bold rounded-lg transition-colors text-xs border border-slate-200 hidden sm:block">Cancelou</button>
             </div>
          )}
          <button onClick={(e) => { e.stopPropagation(); setAppointmentToDelete(ev); }} className="p-1.5 border border-red-100 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors"><Trash2 size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); openEditModal(ev); }} className="p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><Edit2 size={14} /></button>
          
          {isCompleted ? (
            <div className="flex items-center space-x-1 md:ml-1">
              <span className="px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg bg-slate-100">Concluído</span>
              <button onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({id: ev.id, status: 'scheduled'}); }} className="px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 font-bold rounded-lg transition-colors text-xs" title="Desfazer Checkout">↩️ Desfazer</button>
            </div>
          ) : !isInactive ? (
            <button onClick={(e) => { e.stopPropagation(); handleSendToCheckout(ev); }} className="px-3 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 font-bold rounded-lg transition-colors text-xs md:ml-1">Checkout</button>
          ) : (isCancelled || isNoShow) ? (
            <button onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({id: ev.id, status: 'scheduled'}); }} className="px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold rounded-lg transition-colors text-xs md:ml-1">↩️ Restaurar</button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-[calc(100dvh-100px)] md:h-[calc(100vh-4rem)] flex flex-col space-y-2 md:space-y-3">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 shrink-0">
        <div><h2 className="text-xl md:text-2xl font-black text-slate-800 leading-none">Agenda Conectada</h2></div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="bg-slate-200 p-0.5 rounded-lg flex items-center space-x-0.5">
            <button onClick={() => setViewMode('day')} className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === 'day' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><LayoutList size={12} /> <span>Dia</span></button>
            <button onClick={() => setViewMode('week')} className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === 'week' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Columns size={12} /> <span>Semana</span></button>
            <button onClick={() => setViewMode('month')} className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === 'month' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Grid size={12} /> <span>Mês</span></button>
          </div>

          <div className="bg-slate-200 p-0.5 rounded-lg flex items-center space-x-0.5 h-8">
            <button onClick={() => setShowAppointments(!showAppointments)} className={`flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold transition-all h-full ${showAppointments ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><span>Agendamentos</span></button>
            <button onClick={() => setShowReminders(!showReminders)} className={`flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold transition-all h-full ${showReminders ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><span>Lembretes</span></button>
          </div>

          <div className="flex items-center bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden h-8">
            <button onClick={() => handleNavigateDate('prev')} className="px-2 hover:text-rose-600 hover:bg-rose-50 transition-colors border-r border-slate-200 h-full flex items-center"><ChevronLeft size={16} /></button>
            <button onClick={() => setSelectedDate(todayStr)} className="px-3 text-xs font-bold text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors border-r border-slate-200 h-full flex items-center">Hoje</button>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="px-2 text-xs font-bold text-slate-700 outline-none focus:ring-0 bg-transparent border-none h-full" />
            <button onClick={() => handleNavigateDate('next')} className="px-2 hover:text-rose-600 hover:bg-rose-50 transition-colors border-l border-slate-200 h-full flex items-center"><ChevronRight size={16} /></button>
          </div>
          
          <div className="flex space-x-2 h-8">
            <button onClick={() => openBlockModalForDate(selectedDate)} className="bg-slate-200 text-slate-700 px-3 rounded-lg font-semibold hover:bg-slate-300 transition-colors flex items-center shadow-sm"><Coffee size={14} /></button>
            <button onClick={() => openAddModalForType('appointment', selectedDate)} className="bg-rose-600 text-white px-3 rounded-lg font-bold hover:bg-rose-700 transition-colors flex items-center space-x-1.5 shadow-sm text-xs"><Plus size={14} /> <span className="hidden sm:inline">Agendar</span></button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col min-h-0 overflow-hidden w-full">
        <div className="py-2 px-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between text-slate-600 font-medium shrink-0 text-sm">
          <div className="flex items-center space-x-2">
            <CalendarIcon size={16} /> 
            <span>
              {viewMode === 'day' && `${formattedWeekDay}, ${selectedDate.split('-').reverse().join('/')}`} 
              {viewMode === 'week' && `Calendário Semanal`} 
              {viewMode === 'month' && `Calendário Mensal (${new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })})`}
            </span>
          </div>
        </div>
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400"><Loader2 className="animate-spin mb-2 text-rose-500" size={32} /></div>
        ) : viewMode === 'day' ? (
          <div className="flex-1 overflow-y-auto min-h-0 p-3">
             {filteredEvents.length === 0 ? <div className="text-center text-slate-400 py-12">Livre.</div> : filteredEvents.map((ev: any) => renderEventRow(ev))}
          </div>
        ) : viewMode === 'week' ? (
          <div className="flex-1 flex min-h-0 divide-x divide-slate-200 bg-slate-50 overflow-x-auto">
            {weekDates.map((dateStr) => {
              const dayEvents = filteredEvents.filter((ev: any) => ev.event_date === dateStr);
              const isToday = dateStr === todayStr; const dateObj = new Date(dateStr + 'T00:00:00');
              return (
                <div key={dateStr} onClick={() => setActionMenuDate(dateStr)} className={`flex flex-col bg-white min-w-[150px] flex-1 cursor-pointer hover:bg-rose-50/20 transition-colors ${isToday ? 'ring-2 ring-rose-500 ring-inset' : ''}`}>
                  <div className={`py-1.5 text-center border-b border-slate-200 shrink-0 ${isToday ? 'bg-rose-600 text-white font-bold' : 'bg-slate-100 text-slate-700'}`}><p className="text-[10px] tracking-wider uppercase">{dateObj.toLocaleDateString('pt-BR', { weekday: 'short' })}</p><p className="text-xs font-extrabold">{dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</p></div>
                  <div className="p-1.5 space-y-1.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {dayEvents.length === 0 ? <p className="text-[10px] text-slate-300 text-center py-4 italic">Livre</p> : dayEvents.map((ev: any) => {
                      const hour = new Date(ev.start_time).getHours().toString().padStart(2, '0');
                      const min = new Date(ev.start_time).getMinutes().toString().padStart(2, '0');
                      const endH = new Date(ev.end_time).getHours().toString().padStart(2, '0');
                      const endM = new Date(ev.end_time).getMinutes().toString().padStart(2, '0');

                      if (ev.is_block) return (
                        <div key={`block-${ev.id}`} onClick={(e) => { e.stopPropagation(); openEditBlockModal(ev); }} className="p-1.5 rounded border text-[10px] transition-all bg-slate-100 border-slate-300 text-slate-500 opacity-90 cursor-pointer hover:bg-slate-200">
                          <div className="flex justify-between items-center font-bold mb-0.5"><span className="flex items-center"><Lock size={10} className="mr-1" /> {hour}:{min} - {endH}:{endM}</span></div>
                          <p className="font-bold truncate">{ev.block_reason}</p>
                        </div>
                      );
                      
                      if (ev.is_reminder_event) return (
                        <div key={`rem-${ev.id}`} onClick={(e) => { e.stopPropagation(); handleSendReminderWhatsApp(ev); }} className={`p-1.5 rounded border text-[10px] transition-all cursor-pointer bg-indigo-50 border-indigo-200 text-indigo-900 font-bold hover:bg-indigo-100 flex flex-col ${ev.is_recurring ? 'animate-pulse hover:animate-none' : ''}`}>
                          <div className="flex justify-between items-center mb-0.5">
                             <span className="flex items-center text-indigo-600">
                               <CalendarHeart size={10} className="mr-1"/> Retorno
                               {ev.is_recurring && <Repeat size={10} className="ml-1 text-indigo-500" title="Recorrente Mensal" />}
                             </span>
                             <button onClick={(e) => { e.stopPropagation(); setAppointmentToDelete(ev); }} className="opacity-50 hover:opacity-100 hover:text-red-500" title="Excluir Lembrete"><Trash2 size={10} /></button>
                          </div>
                          <p className="font-bold truncate">{ev.clients?.name}</p>
                          {ev.return_reminder_sent_at && (
                            <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded mt-0.5 uppercase font-bold flex items-center gap-0.5 w-max">
                              <CheckCircle size={8}/> {new Date(ev.return_reminder_sent_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}
                            </span>
                          )}
                        </div>
                      );

                      const isCompleted = ev.status === 'completed'; const isCancelled = ev.status === 'cancelled'; const isNoShow = ev.status === 'no_show';
                      let itemClass = 'bg-rose-50 border-rose-200 text-rose-900 font-bold hover:bg-rose-100';
                      if (isCompleted) itemClass = 'bg-slate-100 text-slate-400 line-through border-slate-200'; else if (isCancelled) itemClass = 'bg-slate-50 text-slate-400 line-through border-slate-200 opacity-60'; else if (isNoShow) itemClass = 'bg-amber-50 text-amber-600 line-through border-amber-200 opacity-70';
                      return (
                        <div key={`apt-${ev.id}`} onClick={(e) => { e.stopPropagation(); openEditModal(ev); }} className={`p-1.5 rounded border text-[10px] transition-all cursor-pointer flex flex-col ${itemClass}`}>
                          <div className="flex justify-between items-center mb-0.5">
                            <span>{hour}:{min}</span>
                            <button onClick={(e) => { e.stopPropagation(); setAppointmentToDelete(ev); }} className="opacity-50 hover:opacity-100 hover:text-red-500"><Trash2 size={10} /></button>
                          </div>
                          <p className="font-bold truncate">{ev.clients?.name}</p>
                          {ev.whatsapp_sent_at && (
                            <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded mt-0.5 uppercase font-bold flex items-center gap-0.5 w-max">
                              <CheckCircle size={8}/> {new Date(ev.whatsapp_sent_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}
                            </span>
                          )}
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
              {monthDays.map((item, idx) => {
                const dayEvents = filteredEvents.filter((ev: any) => ev.event_date === item.dateStr);
                const isToday = item.dateStr === todayStr; const dayNum = item.dateStr.split('-')[2];
                return (
                  <div key={idx} onClick={() => setActionMenuDate(item.dateStr)} className={`bg-white p-1 flex flex-col min-h-0 cursor-pointer hover:bg-rose-50/20 transition-colors ${!item.isCurrentMonth ? 'opacity-40 bg-slate-50' : ''} ${isToday ? 'ring-2 ring-rose-500 ring-inset bg-rose-50/20' : ''}`}>
                    <div className="mb-1 shrink-0"><span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${isToday ? 'bg-rose-600 text-white' : 'text-slate-600'}`}>{dayNum}</span></div>
                    <div className="space-y-1 overflow-y-auto flex-1 min-h-0 pr-0.5 custom-scrollbar">
                      {dayEvents.map((ev: any) => {
                        const hour = new Date(ev.start_time).getHours().toString().padStart(2, '0'); const min = new Date(ev.start_time).getMinutes().toString().padStart(2, '0');
                        const endH = new Date(ev.end_time).getHours().toString().padStart(2, '0'); const endM = new Date(ev.end_time).getMinutes().toString().padStart(2, '0');

                        if (ev.is_block) return (
                          <div key={`block-${ev.id}`} onClick={(e) => { e.stopPropagation(); openEditBlockModal(ev); }} className="p-1 rounded bg-slate-100 border border-slate-200 text-[9px] text-slate-500 truncate flex justify-between items-center cursor-pointer hover:bg-slate-200 transition-colors" title={`${hour}:{min} - ${endH}:{endM} 🔒 ${ev.block_reason}`}>
                            <span className="truncate"><span className="font-bold">{hour}:{min}-{endH}:{endM}</span> 🔒 {ev.block_reason}</span>
                          </div>
                        );
                        
                        if (ev.is_reminder_event) return (
                          <div key={`rem-${ev.id}`} onClick={(e) => { e.stopPropagation(); handleSendReminderWhatsApp(ev); }} className={`p-1 rounded border text-[9px] cursor-pointer transition-all flex flex-col bg-indigo-50 border-indigo-200 text-indigo-900 font-bold hover:bg-indigo-100 ${ev.is_recurring ? 'animate-pulse hover:animate-none' : ''}`} title={`Retorno: ${ev.clients?.name}`}>
                             <div className="flex items-center justify-between w-full min-w-0">
                               <span className="truncate flex items-center">
                                 <CalendarHeart size={8} className="mr-0.5 text-indigo-500 shrink-0"/>
                                 {ev.is_recurring && <Repeat size={8} className="mr-0.5 text-indigo-500 shrink-0" title="Recorrente Mensal" />}
                                 <span className="truncate">{ev.clients?.name}</span>
                               </span>
                               <div className="flex items-center shrink-0 ml-1 gap-0.5">
                                 {ev.return_reminder_sent_at && <CheckCircle size={8} className="text-emerald-600" title={`Chamou às ${new Date(ev.return_reminder_sent_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`} />}
                                 <button onClick={(e) => { e.stopPropagation(); setAppointmentToDelete(ev); }} className="opacity-50 hover:opacity-100 hover:text-red-500" title="Excluir Lembrete"><Trash2 size={9} /></button>
                               </div>
                             </div>
                          </div>
                        );

                        const isCompleted = ev.status === 'completed'; const isCancelled = ev.status === 'cancelled'; const isNoShow = ev.status === 'no_show';
                        let itemClass = 'bg-rose-50 border-rose-200 text-rose-900 font-bold hover:bg-rose-100';
                        if (isCompleted) itemClass = 'bg-slate-100 text-slate-400 line-through border-slate-200'; else if (isCancelled) itemClass = 'bg-slate-50 text-slate-400 line-through border-slate-200 opacity-60'; else if (isNoShow) itemClass = 'bg-amber-50 text-amber-600 line-through border-amber-200 opacity-70';
                        return (
                          <div key={`apt-${ev.id}`} onClick={(e) => { e.stopPropagation(); openEditModal(ev); }} className={`p-1 rounded border text-[9px] cursor-pointer transition-all w-full flex items-center justify-between ${itemClass}`} title={`${hour}:${min} - ${ev.clients?.name}`}>
                              <span className="truncate mr-1">{hour}:{min} {ev.clients?.name}</span>
                              {ev.whatsapp_sent_at && <CheckCircle size={8} className="text-emerald-600 shrink-0" title={`Chamou às ${new Date(ev.whatsapp_sent_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`} />}
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

      {actionMenuDate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setActionMenuDate(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-xs w-full p-4 space-y-2 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 text-center border-b border-slate-100 pb-3">
              Dia {new Date(actionMenuDate + 'T12:00:00').toLocaleDateString('pt-BR')}
            </h3>
            <button onClick={() => openAddModalForType('appointment', actionMenuDate)} className="w-full flex items-center gap-3 p-3.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl font-bold transition-colors">
              <CalendarIcon size={20}/> Agendar Atendimento
            </button>
            <button onClick={() => openAddModalForType('reminder', actionMenuDate)} className="w-full flex items-center gap-3 p-3.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold transition-colors">
              <CalendarHeart size={20}/> Agendar Lembrete
            </button>
            <button onClick={() => openBlockModalForDate(actionMenuDate)} className="w-full flex items-center gap-3 p-3.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-colors">
              <Lock size={20}/> Bloquear Horário
            </button>
            <button onClick={() => setActionMenuDate(null)} className="w-full p-2.5 mt-2 text-slate-400 hover:text-slate-600 font-medium text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {showBlockModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2 text-slate-800"><Lock size={20} className="text-slate-500"/><h3 className="text-xl font-bold">{editingBlock ? 'Editar Bloqueio' : 'Bloquear Horário'}</h3></div>
              <button onClick={closeBlockModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddBlockSubmit} className="space-y-4">
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Data</label><input type="date" required value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-slate-500 text-sm" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Início</label><input type="time" required value={blockStartTime} onChange={(e) => setBlockStartTime(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-slate-500" /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Fim</label><input type="time" required value={blockEndTime} onChange={(e) => setBlockEndTime(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-slate-500" /></div>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Motivo / Descrição</label><input type="text" required value={blockReason} onChange={(e) => setBlockReason(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-slate-500" placeholder="Ex: Almoço, Limpeza, Médico..." /></div>
              <div className="flex space-x-3 pt-2">
                {editingBlock && (
                   <button type="button" onClick={() => { setAppointmentToDelete(editingBlock); closeBlockModal(); }} className="p-2.5 border border-red-100 text-red-500 hover:bg-red-50 rounded-lg flex items-center justify-center" title="Excluir Bloqueio"><Trash2 size={18}/></button>
                )}
                <button type="button" onClick={closeBlockModal} className="flex-1 border p-2.5 rounded-lg text-slate-500 font-medium">Cancelar</button>
                <button type="submit" disabled={addBlockMutation.isPending || updateBlockMutation.isPending} className="flex-1 bg-slate-800 text-white p-2.5 rounded-lg font-bold disabled:bg-slate-400 shadow-sm transition-colors">{editingBlock ? 'Atualizar' : 'Bloquear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center"><h3 className="text-xl font-bold text-slate-800">Novo Cadastro</h3><button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button></div>
            
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button type="button" onClick={() => setAppointmentType('appointment')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${appointmentType === 'appointment' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Atendimento</button>
              <button type="button" onClick={() => setAppointmentType('reminder')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${appointmentType === 'reminder' ? 'bg-indigo-600 shadow-sm text-white' : 'text-slate-500 hover:text-slate-700'}`}>Lembrete Manual</button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="relative">
                <label className="block text-xs font-bold text-slate-500 mb-1">Buscar Cliente Cadastrada *</label>
                {selectedClient ? (
                  <div className="flex items-center justify-between border p-2.5 rounded-lg bg-rose-50 border-rose-200">
                    <div><p className="font-bold text-rose-800 text-sm">{selectedClient.name}</p><p className="text-xs text-rose-600">{selectedClient.phone}</p></div>
                    <button type="button" onClick={() => setSelectedClient(null)} className="text-rose-600 hover:text-rose-800 p-1 bg-rose-100 rounded-md"><X size={16} /></button>
                  </div>
                ) : (
                  <><div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input type="text" value={clientSearchTerm} onChange={(e) => setClientSearchTerm(e.target.value)} className="w-full border pl-9 pr-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm" placeholder="Digite nome ou telefone..." /></div>
                    {clientSearchTerm.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredSearchClients.length > 0 ? (filteredSearchClients.map((c: any) => (<div key={c.id} onClick={() => { setSelectedClient(c); setClientSearchTerm(''); }} className="p-3 hover:bg-rose-50 cursor-pointer border-b border-slate-100 last:border-0"><p className="font-bold text-slate-800 text-sm">{c.name}</p><p className="text-xs text-slate-500">{c.phone}</p></div>))) : (<div className="p-3 text-sm text-slate-500 text-center">Nenhuma cliente encontrada.</div>)}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Procedimento *</label><input type="text" required value={serviceName} onChange={(e) => setServiceName(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>
              
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Valor (R$) *</label><input type="text" required value={servicePrice} onChange={(e) => setServicePrice(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Data *</label><input type="date" required value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm" /></div>
              </div>
              
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Horário *</label><input type="time" required value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>
              
              {appointmentType === 'reminder' && (
                <div className="flex items-center space-x-2 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                  <input type="checkbox" id="recurrence" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-indigo-300 focus:ring-indigo-500 cursor-pointer" />
                  <label htmlFor="recurrence" className="text-xs font-bold text-indigo-800 cursor-pointer select-none flex items-center gap-1"><Repeat size={12}/> Repetir todo mês</label>
                </div>
              )}

              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="w-1/2 border p-2.5 rounded-lg text-slate-500 font-medium">Cancelar</button>
                <button type="submit" disabled={addAppointmentMutation.isPending || !selectedClient} className={`w-1/2 text-white p-2.5 rounded-lg font-bold disabled:opacity-50 transition-colors ${appointmentType === 'reminder' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}>Salvar {appointmentType === 'reminder' ? 'Lembrete' : ''}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingAppointment && !editingAppointment.is_block && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Editar Agendamento</h3>
                {editingAppointment.status === 'completed' && <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold uppercase mt-1 inline-block">Concluído</span>}
                {editingAppointment.status === 'cancelled' && <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded font-bold uppercase mt-1 inline-block">Cancelou</span>}
                {editingAppointment.status === 'no_show' && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold uppercase mt-1 inline-block">Faltou</span>}
              </div>
              <div className="flex items-center space-x-1">
                <button onClick={() => setAppointmentToDelete(editingAppointment)} className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={20} /></button>
                <button onClick={() => setEditingAppointment(null)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
              </div>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Cliente (Somente Leitura)</label><input type="text" disabled value={editingAppointment.clients?.name || ''} className="w-full border bg-slate-100 p-2.5 rounded-lg text-slate-500 cursor-not-allowed font-medium" /></div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Procedimento</label><input type="text" required value={editServiceName} onChange={(e) => setEditServiceName(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Valor (R$)</label><input type="text" required value={editServicePrice} onChange={(e) => setEditServicePrice(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Data</label><input type="date" required value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm" /></div>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Horário</label><input type="time" required value={editTime} onChange={(e) => setEditTime(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setEditingAppointment(null)} className="w-1/2 border p-2.5 rounded-lg text-slate-500 font-medium">Cancelar</button>
                <button type="submit" disabled={updateAppointmentMutation.isPending} className="w-1/2 bg-rose-600 text-white p-2.5 rounded-lg font-bold disabled:bg-rose-400">Atualizar</button>
              </div>
            </form>

            <div className="pt-4 mt-4 border-t border-slate-100 flex flex-col gap-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center mb-1">Ações Rápidas</p>
              {editingAppointment.status === 'scheduled' && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleSendToCheckout(editingAppointment)} className="flex-1 bg-emerald-50 text-emerald-700 py-2 rounded-lg font-bold text-xs hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1 shadow-sm">🛒 Checkout</button>
                  <button type="button" onClick={() => updateStatusMutation.mutate({id: editingAppointment.id, status: 'no_show'})} className="flex-1 bg-amber-50 text-amber-700 py-2 rounded-lg font-bold text-xs hover:bg-amber-100 transition-colors shadow-sm">❌ Faltou</button>
                  <button type="button" onClick={() => updateStatusMutation.mutate({id: editingAppointment.id, status: 'cancelled'})} className="flex-1 bg-slate-50 text-slate-600 border border-slate-200 py-2 rounded-lg font-bold text-xs hover:bg-slate-100 transition-colors shadow-sm">🚫 Cancelou</button>
                </div>
              )}
              {(editingAppointment.status === 'cancelled' || editingAppointment.status === 'no_show' || editingAppointment.status === 'completed') && (
                <button type="button" onClick={() => updateStatusMutation.mutate({id: editingAppointment.id, status: 'scheduled'})} className="w-full bg-amber-50 border border-amber-200 text-amber-700 py-2.5 rounded-lg font-bold text-sm hover:bg-amber-100 transition-colors shadow-sm">↩️ Desfazer e Restaurar para Agendado</button>
              )}
            </div>
          </div>
        </div>
      )}

      {appointmentToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="flex justify-center text-red-500 mb-2"><AlertTriangle size={48} /></div>
            <h3 className="text-xl font-bold text-slate-800">
              {appointmentToDelete.is_block ? 'Remover Bloqueio?' : appointmentToDelete.is_reminder_event ? 'Excluir Lembrete?' : 'Excluir Definitivamente?'}
            </h3>
            <p className="text-sm text-slate-500">
              Tem certeza que deseja apagar o {appointmentToDelete.is_reminder_event ? 'lembrete de' : 'registro de'} <strong>{appointmentToDelete.is_block ? appointmentToDelete.block_reason : appointmentToDelete.clients?.name}</strong>{appointmentToDelete.is_reminder_event ? '?' : ' do banco de dados?'}
              {appointmentToDelete.is_recurring && (
                 <span className="block mt-3 text-rose-600 font-bold bg-rose-50 p-2 rounded border border-rose-200 text-xs">Atenção: Isso excluirá este e todos os meses futuros deste lembrete recorrente.</span>
              )}
            </p>
            <div className="flex space-x-3 pt-4"><button onClick={() => setAppointmentToDelete(null)} className="w-1/2 border border-slate-200 bg-slate-50 text-slate-600 p-2.5 rounded-lg font-medium">Voltar</button><button onClick={() => deleteAppointmentMutation.mutate(appointmentToDelete)} disabled={deleteAppointmentMutation.isPending} className="w-1/2 bg-red-600 text-white p-2.5 rounded-lg font-bold">Sim, Excluir</button></div>
          </div>
        </div>
      )}
    </div>
  );
}