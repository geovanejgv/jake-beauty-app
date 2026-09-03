import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Search, Plus, Edit2, Trash2, X, AlertTriangle, Users, History, Scissors } from 'lucide-react';

export default function Clientes() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [clientToDelete, setClientToDelete] = useState<any>(null);
  const [selectedHistoryClient, setSelectedHistoryClient] = useState<any>(null);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [notes, setNotes] = useState('');

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('name');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: clientAppointments = [] } = useQuery({
    queryKey: ['client-appointments', selectedHistoryClient?.id],
    enabled: !!selectedHistoryClient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, services(name, price)')
        .eq('client_id', selectedHistoryClient.id)
        .order('start_time', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  // MUTAÇÕES COM AVISO DE ERRO (Alertas)
  const addMutation = useMutation({
    mutationFn: async (clientData: any) => {
      const { error } = await supabase.from('clients').insert([clientData]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setShowAddModal(false);
      resetForm();
    },
    onError: (error: any) => {
      alert(`Ops! Não foi possível salvar: ${error.message}`);
      console.error(error);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: any) => {
      const { error } = await supabase.from('clients').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setEditingClient(null);
      resetForm();
    },
    onError: (error: any) => {
      alert(`Ops! Não foi possível atualizar: ${error.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setClientToDelete(null);
    },
    onError: (error: any) => {
      alert(`Ops! Não foi possível excluir: ${error.message}`);
    }
  });

  const resetForm = () => {
    setName(''); setPhone(''); setBirthday(''); setNotes('');
  };

  // Máscara inteligente para o WhatsApp
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, ''); // Tira tudo que não é número
    if (value.length > 11) value = value.slice(0, 11); // Limita a 11 dígitos
    
    // Formata como (11) 99999-9999
    if (value.length > 2) {
      value = `(${value.substring(0, 2)}) ${value.substring(2)}`;
    }
    if (value.length > 10) {
      value = `${value.substring(0, 10)}-${value.substring(10)}`;
    }
    setPhone(value);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMutation.mutate({ name, phone, birthday: birthday || null, notes });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    updateMutation.mutate({ id: editingClient.id, data: { name, phone, birthday: birthday || null, notes } });
  };

  const openEditModal = (client: any) => {
    setEditingClient(client);
    setName(client.name);
    
    // Aplica a máscara ao abrir para edição
    let formattedPhone = client.phone || '';
    if (formattedPhone && !formattedPhone.includes('(')) {
      const cleaned = formattedPhone.replace(/\D/g, '');
      if (cleaned.length === 11) {
        formattedPhone = `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7, 11)}`;
      }
    }
    setPhone(formattedPhone);
    setBirthday(client.birthday || '');
    setNotes(client.notes || '');
  };

  const formatDisplayPhone = (val: string) => {
    if (!val) return '-';
    if (val.includes('(')) return val; // Já está formatado
    const cleaned = ('' + val).replace(/\D/g, '');
    const match = cleaned.match(/^(\d{2})(\d{4,5})(\d{4})$/);
    if (match) return `(${match[1]}) ${match[2]}-${match[3]}`;
    return val;
  };

  const filteredClients = clients.filter((c: any) => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.phone && c.phone.includes(searchTerm))
  );

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'completed': return <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase block mt-1 w-max ml-auto">Concluído</span>;
      case 'cancelled': return <span className="bg-slate-200 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase block mt-1 w-max ml-auto">Cancelou</span>;
      case 'no_show': return <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase block mt-1 w-max ml-auto">Faltou</span>;
      case 'scheduled': default: return <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase block mt-1 w-max ml-auto">Agendado</span>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800">Clientes</h2>
          <p className="text-sm text-slate-500 mt-1">Gestão de contatos e histórico de atendimentos</p>
        </div>
        <div className="flex w-full md:w-auto space-x-3">
          <div className="relative flex-1 md:w-64">
            <Search size={18} className="absolute left-3 top-3 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar cliente..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm shadow-sm"
            />
          </div>
          <button onClick={() => { resetForm(); setShowAddModal(true); }} className="bg-rose-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-rose-700 transition-colors flex items-center space-x-2 shadow-sm whitespace-nowrap">
            <Plus size={18} /> <span className="hidden sm:inline">Nova Cliente</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50/80 uppercase font-bold border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Nome</th>
                <th className="px-6 py-4">WhatsApp</th>
                <th className="px-6 py-4 hidden md:table-cell">Aniversário</th>
                <th className="px-6 py-4 text-center">Histórico</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">Carregando...</td></tr>
              ) : filteredClients.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">Nenhuma cliente encontrada.</td></tr>
              ) : (
                filteredClients.map((client: any) => (
                  <tr key={client.id} className="hover:bg-rose-50/30 transition-colors group">
                    <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black text-xs uppercase">{client.name.substring(0, 2)}</div>
                      {client.name}
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{formatDisplayPhone(client.phone)}</td>
                    <td className="px-6 py-4 text-slate-500 hidden md:table-cell">{client.birthday ? new Date(client.birthday).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '-'}</td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => setSelectedHistoryClient(client)} className="text-slate-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition-colors" title="Ver Histórico">
                        <History size={18} />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditModal(client)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Edit2 size={16} /></button>
                        <button onClick={() => setClientToDelete(client)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL HISTÓRICO */}
      {selectedHistoryClient && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase">{selectedHistoryClient.name}</h3>
                <p className="text-sm text-slate-500 mt-0.5">Histórico completo de atendimentos</p>
              </div>
              <button onClick={() => setSelectedHistoryClient(null)} className="text-slate-400 hover:text-rose-600 p-1"><X size={24} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
              {clientAppointments.length === 0 ? (
                <div className="text-center py-8 text-slate-400">Nenhum atendimento registrado.</div>
              ) : (
                clientAppointments.map((apt: any) => {
                  const sName = Array.isArray(apt.services) ? apt.services[0]?.name : apt.services?.name;
                  const sPrice = Array.isArray(apt.services) ? apt.services[0]?.price : apt.services?.price;
                  
                  return (
                    <div key={apt.id} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center shadow-sm">
                      <div className="flex items-center space-x-4">
                        <div className="bg-rose-100 p-2.5 rounded-xl text-rose-600 shrink-0"><Scissors size={20}/></div>
                        <div>
                          <h4 className="font-bold text-slate-800">{sName || 'Procedimento'}</h4>
                          <p className="text-xs text-slate-500 mt-0.5">{new Date(apt.start_time).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-rose-600">R$ {parseFloat(sPrice || 0).toFixed(2).replace('.', ',')}</p>
                        {getStatusBadge(apt.status)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end">
              <button onClick={() => setSelectedHistoryClient(null)} className="px-6 py-2.5 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors shadow-sm">Fechar Janela</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ADICIONAR */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center"><h3 className="text-xl font-bold text-slate-800">Nova Cliente</h3><button onClick={() => { setShowAddModal(false); resetForm(); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button></div>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Nome Completo *</label><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">WhatsApp</label>
                  <input type="tel" value={phone} onChange={handlePhoneChange} placeholder="(11) 99999-9999" className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Aniversário</label><input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm" /></div>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Observações (Alergias, preferências...)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm resize-none" /></div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => { setShowAddModal(false); resetForm(); }} className="w-1/2 border p-2.5 rounded-xl text-slate-500 font-medium">Cancelar</button>
                <button type="submit" disabled={addMutation.isPending} className="w-1/2 bg-rose-600 text-white p-2.5 rounded-xl font-bold disabled:bg-rose-400">{addMutation.isPending ? 'Salvando...' : 'Salvar Cliente'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR */}
      {editingClient && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center"><h3 className="text-xl font-bold text-slate-800">Editar Cliente</h3><button onClick={() => setEditingClient(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button></div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Nome Completo *</label><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">WhatsApp</label>
                  <input type="tel" value={phone} onChange={handlePhoneChange} placeholder="(11) 99999-9999" className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Aniversário</label><input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm" /></div>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Observações</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm resize-none" /></div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setEditingClient(null)} className="w-1/2 border p-2.5 rounded-xl text-slate-500 font-medium">Cancelar</button>
                <button type="submit" disabled={updateMutation.isPending} className="w-1/2 bg-rose-600 text-white p-2.5 rounded-xl font-bold disabled:bg-rose-400">{updateMutation.isPending ? 'Atualizando...' : 'Atualizar Cliente'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EXCLUIR */}
      {clientToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="flex justify-center text-red-500 mb-2"><AlertTriangle size={48} /></div>
            <h3 className="text-xl font-bold text-slate-800">Excluir Cliente?</h3>
            <p className="text-sm text-slate-500">Tem certeza que deseja excluir permanentemente o cadastro de <strong>{clientToDelete.name}</strong>?</p>
            <div className="flex space-x-3 pt-4"><button onClick={() => setClientToDelete(null)} className="w-1/2 border border-slate-200 bg-slate-50 text-slate-600 p-2.5 rounded-xl font-medium">Voltar</button><button onClick={() => deleteMutation.mutate(clientToDelete.id)} disabled={deleteMutation.isPending} className="w-1/2 bg-red-600 text-white p-2.5 rounded-xl font-bold">Sim, Excluir</button></div>
          </div>
        </div>
      )}
    </div>
  );
}