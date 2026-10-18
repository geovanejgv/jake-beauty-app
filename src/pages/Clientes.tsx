import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { brl, dataBR, dataHoraBR, dataLocal, isoParaBR } from '../lib/formatos';
import { listarSaldos, pacotesKeys } from '../features/pacotes/api';
import { COR_SITUACAO, ROTULO_SITUACAO, agruparSaldos, situacaoPacote } from '../features/pacotes/logic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { Search, Plus, Edit2, Trash2, X, AlertTriangle, Users, History, Scissors, NotebookPen, ShieldCheck, Lock, Package, List, LayoutGrid, CalendarClock, CalendarCheck, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { clientesKeys, listarGrupos, listarMembros, listarOrigens, listarResumoAtendimentos } from '../features/clientes/api';
import { PALAVRA_EXCLUSAO, chaveAniversario, confirmacaoExclusaoValida, contarPorGrupo, gruposPorCliente, ordenarPor, type Direcao } from '../features/clientes/logic';
import { AniversariantesMes } from '../features/clientes/Aniversariantes';
import { GruposCartoes } from '../features/clientes/GruposCartoes';
import { CampoOrigem } from '../features/clientes/CampoOrigem';
import { GruposClientes } from '../features/clientes/GruposClientes';

type ModoClientes = 'lista' | 'cartoes' | 'grupos';
const CHAVE_MODO = 'jb-clientes-modo';

type Coluna = 'nome' | 'whatsapp' | 'grupo' | 'ultimo' | 'proximo' | 'origem' | 'aniversario';
const ROTULO_COLUNA: Record<Coluna, string> = {
  nome: 'Nome', whatsapp: 'WhatsApp', grupo: 'Grupo', ultimo: 'Último atendimento', proximo: 'Próximo atendimento', origem: 'Origem', aniversario: 'Aniversário',
};

const TIPOS_HISTORICO: Record<string, string> = { tecnico: 'Técnico', alergia: 'Alergia', preferencia: 'Preferência', observacao: 'Observação' };

/** Pacotes da cliente: saldo por serviço e validade (profissional vê sem valores). */
function PacotesCliente({ clienteId }: { clienteId: string }) {
  const hoje = dataLocal();
  const { data: linhas = [], isLoading } = useQuery({ queryKey: pacotesKeys.saldos(clienteId, true), queryFn: () => listarSaldos(clienteId, true) });
  const pacotes = agruparSaldos(linhas).map((p) => ({ ...p, situacao: situacaoPacote(p, hoje) }));
  if (isLoading) return <p className="text-sm text-slate-400 text-center py-6">Carregando...</p>;
  if (!pacotes.length) return <p className="text-sm text-slate-400 text-center py-8">Nenhum pacote para esta cliente.</p>;
  return (
    <div className="space-y-3">
      {pacotes.map((p) => (
        <div key={p.pacote_id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2">
          <div className="flex justify-between items-start gap-2">
            <div><h4 className="font-bold text-slate-800">{p.nome}</h4><p className="text-xs text-slate-500">Validade {isoParaBR(p.validade)}</p></div>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${COR_SITUACAO[p.situacao]}`}>{ROTULO_SITUACAO[p.situacao]}</span>
          </div>
          <ul className="text-sm text-slate-600 space-y-0.5">
            {p.itens.map((i) => <li key={i.item_id}>{i.servico_nome}: <strong>{i.sessoes - i.usadas - i.faltas}</strong> de {i.sessoes} restantes{i.reservadas ? `, ${i.reservadas} agendada(s)` : ''}{i.faltas ? `, ${i.faltas} falta(s)` : ''}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Histórico técnico da cliente (fórmulas, alergias, preferências): visível à equipe, autor gravado pelo banco. */
function HistoricoTecnico({ clienteId }: { clienteId: string }) {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState('tecnico');
  const [texto, setTexto] = useState('');
  const { data: itens = [], isLoading } = useQuery({
    queryKey: ['cliente-historico', clienteId],
    queryFn: async () => {
      const { data, error } = await supabase.from('cliente_historico').select('id, tipo, texto, created_at, autor_id').eq('cliente_id', clienteId).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });
  const { data: pessoas = [] } = useQuery({
    queryKey: ['equipe', 'ativos'],
    queryFn: async () => { const { data, error } = await supabase.from('users').select('id, name').eq('active', true); if (error) throw error; return data || []; }
  });
  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('cliente_historico').insert([{ cliente_id: clienteId, tipo, texto: texto.trim() }]);
      if (error) throw error;
    },
    onSuccess: () => { setTexto(''); queryClient.invalidateQueries({ queryKey: ['cliente-historico', clienteId] }); },
    onError: (error: unknown) => alert(mensagemDeErro(error, 'Não foi possível salvar o registro.', 'clientes.historico'))
  });
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); if (texto.trim()) salvar.mutate(); }} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
        <div className="flex gap-2">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-sm" aria-label="Tipo de registro">
            {Object.entries(TIPOS_HISTORICO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} placeholder="Ex.: Coloração 7.1 + 20 vol; alergia a amônia" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500" aria-label="Registro técnico" />
          <button type="submit" disabled={!texto.trim() || salvar.isPending} className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-bold disabled:opacity-40">Adicionar</button>
        </div>
      </form>
      {isLoading ? null : itens.length === 0 ? <p className="text-sm text-slate-400 text-center py-2">Sem registros técnicos.</p> : itens.map((h: any) => (
        <div key={h.id} className={`border rounded-xl p-3 text-sm ${h.tipo === 'alergia' ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <div className="flex justify-between gap-2 text-[11px] text-slate-500 mb-1">
            <span className="font-bold uppercase">{TIPOS_HISTORICO[h.tipo] ?? h.tipo}</span>
            <span>{(pessoas as any[]).find((p) => p.id === h.autor_id)?.name ?? 'Equipe'} · {dataHoraBR(h.created_at)}</span>
          </div>
          <p className="text-slate-700 whitespace-pre-wrap">{h.texto}</p>
        </div>
      ))}
    </div>
  );
}

export default function Clientes() {
  const queryClient = useQueryClient();
  const { perfil } = useAuth();
  // Profissional: só nome e contato mascarado (view clientes_visiveis), sem editar (risco de fuga de base).
  const ehAdmin = perfil?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const [abaHistorico, setAbaHistorico] = useState<'atendimentos' | 'tecnico' | 'pacotes'>('atendimentos');
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
  const [email, setEmail] = useState('');
  const [lgpd, setLgpd] = useState(false);
  const [origemId, setOrigemId] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('');
  const [showGrupos, setShowGrupos] = useState(false);
  // Grupo aberto direto no modal de grupos ('' = grupo novo); null = lista de grupos.
  const [grupoModal, setGrupoModal] = useState<string | null>(null);
  // Filtro por grupo (vindo do cartão do grupo).
  const [grupoFiltro, setGrupoFiltro] = useState<string | null>(null);
  // Exclusão em duas etapas: 1 = confirmar, 2 = digitar a palavra.
  const [etapaExclusao, setEtapaExclusao] = useState<1 | 2>(1);
  const [textoExclusao, setTextoExclusao] = useState('');
  // Ordenação: clicar no cabeçalho da coluna (ou escolher no celular e nos cartões).
  const [ordem, setOrdem] = useState<{ coluna: Coluna; direcao: Direcao }>({ coluna: 'nome', direcao: 'asc' });
  const ordenarColuna = (coluna: Coluna) =>
    setOrdem((o) => (o.coluna === coluna ? { coluna, direcao: o.direcao === 'asc' ? 'desc' : 'asc' } : { coluna, direcao: 'asc' }));

  // Lista, cartões ou grupos (lembrado neste aparelho; grupos só para a administradora).
  const [modoSalvo, setModoSalvo] = useState<ModoClientes>(() => {
    try { const m = localStorage.getItem(CHAVE_MODO); if (m === 'lista' || m === 'cartoes' || m === 'grupos') return m; } catch { /* preferência de tela */ }
    return 'lista';
  });
  const modo: ModoClientes = modoSalvo === 'grupos' && !ehAdmin ? 'lista' : modoSalvo;
  const trocarModo = (m: ModoClientes) => {
    setModoSalvo(m);
    try { localStorage.setItem(CHAVE_MODO, m); } catch { /* preferência de tela; pode falhar */ }
  };

  // Atalho por endereço: /clientes?nova=cliente abre o cadastro
  useEffect(() => {
    if (searchParams.get('nova') !== 'cliente' || !ehAdmin) return;
    resetForm();
    setShowAddModal(true);
    searchParams.delete('nova');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, ehAdmin]);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients', ehAdmin],
    queryFn: async () => {
      const { data, error } = ehAdmin
        ? await supabase.from('clients').select('*').order('name')
        : await supabase.from('clientes_visiveis').select('id, name, phone, email, contato_visivel, origem_id').order('name');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: origens = [] } = useQuery({ queryKey: clientesKeys.origens, queryFn: listarOrigens });
  const nomeOrigem = (id?: string | null) => (id ? origens.find((o) => o.id === id)?.nome : undefined);

  // Grupos e membros: só a administradora (RLS). Resumo da agenda: cada um vê o que a agenda deixa.
  const { data: grupos = [] } = useQuery({ queryKey: clientesKeys.grupos, queryFn: listarGrupos, enabled: ehAdmin });
  const { data: membros = [] } = useQuery({ queryKey: clientesKeys.membros, queryFn: listarMembros, enabled: ehAdmin });
  const { data: resumo = [] } = useQuery({ queryKey: clientesKeys.resumo, queryFn: listarResumoAtendimentos });
  const gruposDaCliente = useMemo(() => gruposPorCliente(grupos, membros), [grupos, membros]);
  const contagemGrupos = useMemo(() => contarPorGrupo(membros), [membros]);
  const resumoDaCliente = useMemo(() => new Map(resumo.map((r) => [r.cliente_id, r])), [resumo]);
  const grupoFiltrado = grupoFiltro ? grupos.find((g) => g.id === grupoFiltro) : undefined;

  const { data: clientAppointments = [] } = useQuery({
    queryKey: ['client-appointments', selectedHistoryClient?.id],
    enabled: !!selectedHistoryClient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, services(name, price), servicos(nome)')
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
      alert(mensagemDeErro(error, 'Ops! Não foi possível salvar.', 'clientes.salvar'));
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
      alert(mensagemDeErro(error, 'Ops! Não foi possível atualizar.', 'clientes.atualizar'));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clientes', 'grupos'] });
      fecharExclusao();
    },
    onError: (error: any) => {
      alert(mensagemDeErro(error, 'Ops! Não foi possível excluir.', 'clientes.excluir'));
    }
  });

  const abrirExclusao = (client: any) => { setClientToDelete(client); setEtapaExclusao(1); setTextoExclusao(''); };
  const fecharExclusao = () => { setClientToDelete(null); setEtapaExclusao(1); setTextoExclusao(''); };

  const resetForm = () => {
    setName(''); setPhone(''); setBirthday(''); setNotes(''); setEmail(''); setLgpd(false); setOrigemId('');
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
    addMutation.mutate({ name, phone, birthday: birthday || null, notes, email: email.trim() || null, lgpd_consent: lgpd, origem_id: origemId || null });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    updateMutation.mutate({ id: editingClient.id, data: { name, phone, birthday: birthday || null, notes, email: email.trim() || null, lgpd_consent: lgpd, origem_id: origemId || null } });
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
    setEmail(client.email || '');
    setLgpd(!!client.lgpd_consent);
    setOrigemId(client.origem_id || '');
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
    (c.name.toLowerCase().includes(searchTerm.toLowerCase()) || (c.phone && c.phone.includes(searchTerm))) &&
    (!filtroOrigem || (filtroOrigem === 'sem' ? !c.origem_id : c.origem_id === filtroOrigem)) &&
    (!grupoFiltro || (gruposDaCliente.get(c.id) ?? []).some((g) => g.id === grupoFiltro))
  );

  const chaveColuna: Record<Coluna, (c: any) => string | number | null | undefined> = {
    nome: (c) => c.name,
    whatsapp: (c) => (c.phone ?? '').replace(/\D/g, ''),
    grupo: (c) => gruposDaCliente.get(c.id)?.[0]?.nome,
    ultimo: (c) => resumoDaCliente.get(c.id)?.ultimo,
    proximo: (c) => resumoDaCliente.get(c.id)?.proximo,
    origem: (c) => nomeOrigem(c.origem_id),
    aniversario: (c) => chaveAniversario(c.birthday),
  };
  const clientesOrdenados = ordenarPor(filteredClients, chaveColuna[ordem.coluna], ordem.direcao);
  const colunasDisponiveis: Coluna[] = ehAdmin
    ? ['nome', 'whatsapp', 'grupo', 'ultimo', 'proximo', 'origem', 'aniversario']
    : ['nome', 'ultimo', 'proximo', 'origem'];

  /** Cabeçalho clicável: ordena pela coluna e alterna crescente/decrescente. */
  const cabecalho = (coluna: Coluna, classe = '') => {
    const ativa = ordem.coluna === coluna;
    const Seta = !ativa ? ArrowUpDown : ordem.direcao === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={`px-4 xl:px-6 py-3 ${classe}`} aria-sort={ativa ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => ordenarColuna(coluna)} title={`Ordenar por ${ROTULO_COLUNA[coluna].toLowerCase()}`}
          className={`sem-hover inline-flex items-center gap-1 uppercase font-bold tracking-wide hover:text-rose-600 ${ativa ? 'text-rose-600' : ''}`}>
          {ROTULO_COLUNA[coluna]} <Seta size={13} className={ativa ? '' : 'opacity-40'} />
        </button>
      </th>
    );
  };

  /** Ordenação por lista (celular e cartões, onde não há cabeçalho de coluna). */
  const seletorOrdem = (classe = '') => (
    <div className={`flex items-center gap-2 ${classe}`}>
      <label className="text-xs font-bold text-slate-500 whitespace-nowrap" htmlFor="ordem-clientes">Ordenar por</label>
      <select id="ordem-clientes" value={ordem.coluna} onChange={(e) => setOrdem({ coluna: e.target.value as Coluna, direcao: 'asc' })}
        className="flex-1 min-w-0 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm shadow-sm">
        {colunasDisponiveis.map((c) => <option key={c} value={c}>{ROTULO_COLUNA[c]}</option>)}
      </select>
      <button type="button" onClick={() => setOrdem((o) => ({ ...o, direcao: o.direcao === 'asc' ? 'desc' : 'asc' }))}
        aria-label={ordem.direcao === 'asc' ? 'Ordem crescente; tocar para decrescente' : 'Ordem decrescente; tocar para crescente'}
        className="sem-hover shrink-0 w-11 h-11 rounded-xl border border-slate-200 bg-white text-slate-600 flex items-center justify-center shadow-sm">
        {ordem.direcao === 'asc' ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
      </button>
    </div>
  );

  const ultimoDe = (id: string) => { const u = resumoDaCliente.get(id)?.ultimo; return u ? dataBR(u) : '-'; };
  const proximoDe = (id: string) => { const p = resumoDaCliente.get(id)?.proximo; return p ? dataHoraBR(p) : '-'; };
  const etiquetasGrupo = (id: string, max = 99) => {
    const lista = gruposDaCliente.get(id) ?? [];
    if (!lista.length) return <span className="text-slate-400">-</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {lista.slice(0, max).map((g) => (
          <button key={g.id} type="button" onClick={() => { setGrupoFiltro(g.id); if (modo === 'grupos') trocarModo('lista'); }} title={`Ver clientes do grupo ${g.nome}`}
            className="sem-hover px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100 text-[11px] font-bold hover:bg-rose-100 max-w-[12rem] truncate">{g.nome}</button>
        ))}
        {lista.length > max && <span className="text-[11px] text-slate-400">+{lista.length - max}</span>}
      </span>
    );
  };
  const acoesCliente = (client: any) => (
    <>
      <button onClick={() => { setAbaHistorico('atendimentos'); setSelectedHistoryClient(client); }} className="p-2.5 md:p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Ver histórico" aria-label={`Histórico de ${client.name}`}><History size={16} /></button>
      {ehAdmin && <button onClick={() => openEditModal(client)} className="p-2.5 md:p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Editar" aria-label={`Editar ${client.name}`}><Edit2 size={16} /></button>}
      {ehAdmin && <button onClick={() => abrirExclusao(client)} className="p-2.5 md:p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir" aria-label={`Excluir ${client.name}`}><Trash2 size={16} /></button>}
    </>
  );

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'completed': return <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase block mt-1 w-max ml-auto">Concluído</span>;
      case 'cancelled': return <span className="bg-slate-200 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase block mt-1 w-max ml-auto">Cancelou</span>;
      case 'no_show': return <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase block mt-1 w-max ml-auto">Faltou</span>;
      case 'confirmed': return <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase block mt-1 w-max ml-auto">Confirmado</span>;
      case 'scheduled': default: return <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase block mt-1 w-max ml-auto">Agendado</span>;
    }
  };

  const botaoModo = (m: ModoClientes, rotulo: string, Icone: typeof List) => (
    <button type="button" role="radio" aria-checked={modo === m} onClick={() => trocarModo(m)}
      className={`sem-hover flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${modo === m ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-rose-500'}`}>
      <Icone size={16} /> <span>{rotulo}</span>
    </button>
  );

  return (
    <div className="w-full space-y-4 md:space-y-6">
      <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-3 md:gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl md:text-3xl font-black text-slate-800">Clientes</h2>
            <p className="text-xs md:text-sm text-slate-500 mt-1">{ehAdmin ? 'Gestão de contatos e histórico de atendimentos' : 'Nome e histórico técnico. O contato das clientes fica com a administração do salão.'}</p>
          </div>
          {ehAdmin && <button onClick={() => { resetForm(); setShowAddModal(true); }} aria-label="Nova cliente" className="xl:hidden shrink-0 bg-rose-600 text-white px-3.5 py-2.5 rounded-xl font-bold hover:bg-rose-700 transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap text-sm">
            <Plus size={18} /> <span className="hidden sm:inline">Nova Cliente</span>
          </button>}
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap w-full xl:w-auto gap-2 md:gap-3 sm:items-center">
          <div role="radiogroup" aria-label="Forma de exibição" className="flex p-1 rounded-xl bg-slate-100">
            {botaoModo('lista', 'Lista', List)}
            {botaoModo('cartoes', 'Cartões', LayoutGrid)}
            {ehAdmin && botaoModo('grupos', 'Grupos', Users)}
          </div>
          {modo !== 'grupos' && <>
            <div className="relative flex-1 sm:min-w-[12rem] xl:w-72">
              <Search size={18} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="search"
                placeholder="Buscar por nome ou telefone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                aria-label="Buscar cliente"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm shadow-sm"
              />
            </div>
            <div className={`grid gap-2 ${ehAdmin && grupos.length > 0 ? 'grid-cols-2' : 'grid-cols-1'} sm:flex sm:gap-3`}>
              <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)} aria-label="Filtrar por origem" className="min-w-0 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm shadow-sm">
                <option value="">Todas as origens</option>
                {origens.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                <option value="sem">Sem origem</option>
              </select>
              {ehAdmin && grupos.length > 0 && (
                <select value={grupoFiltro ?? ''} onChange={(e) => setGrupoFiltro(e.target.value || null)} aria-label="Filtrar por grupo" className="min-w-0 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm shadow-sm">
                  <option value="">Todos os grupos</option>
                  {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                </select>
              )}
            </div>
          </>}
          {ehAdmin && <button onClick={() => { resetForm(); setShowAddModal(true); }} className="hidden xl:flex bg-rose-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-rose-700 transition-colors items-center space-x-2 shadow-sm whitespace-nowrap">
            <Plus size={18} /> <span>Nova Cliente</span>
          </button>}
        </div>
      </div>

      {ehAdmin && modo !== 'grupos' && <AniversariantesMes clientes={clients as any[]} hoje={dataLocal()} recolhivel />}

      {modo !== 'grupos' && seletorOrdem(modo === 'lista' ? 'md:hidden' : 'sm:max-w-sm')}

      {grupoFiltrado && modo !== 'grupos' && (
        <div className="flex flex-wrap items-center gap-3 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
          <Users size={18} className="text-rose-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Grupo: {grupoFiltrado.nome} <span className="font-normal text-slate-500">· {filteredClients.length} cliente(s)</span></p>
            {grupoFiltrado.descricao && <p className="text-xs text-slate-500 truncate">{grupoFiltrado.descricao}</p>}
          </div>
          <button type="button" onClick={() => { setGrupoModal(grupoFiltrado.id); setShowGrupos(true); }} className="text-xs font-bold text-rose-600 hover:text-rose-700">Editar grupo</button>
          <button type="button" onClick={() => setGrupoFiltro(null)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-rose-600"><X size={14} /> Ver todas</button>
        </div>
      )}

      {modo === 'grupos' ? (
        <GruposCartoes
          grupos={grupos}
          contagem={contagemGrupos}
          onAbrir={(id) => { setGrupoFiltro(id); trocarModo('lista'); }}
          onEditarMembros={(id) => { setGrupoModal(id); setShowGrupos(true); }}
          onNovo={() => { setGrupoModal(''); setShowGrupos(true); }}
        />
      ) : modo === 'cartoes' ? (
        isLoading ? <p className="text-center text-slate-400 py-12">Carregando...</p>
        : filteredClients.length === 0 ? <p className="text-center text-slate-400 py-12">Nenhuma cliente encontrada.</p>
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 md:gap-4">
            {clientesOrdenados.map((client: any) => (
              <div key={client.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black text-xs uppercase">{client.name.substring(0, 2)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 truncate" title={client.name}>{client.name}</p>
                    <p className="text-sm text-slate-500">{ehAdmin ? formatDisplayPhone(client.phone) : <span className="inline-flex items-center gap-1 text-slate-400"><Lock size={12} /> {client.phone || '-'}</span>}</p>
                  </div>
                </div>
                {ehAdmin && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Grupos</p>
                    {etiquetasGrupo(client.id)}
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div><dt className="text-slate-400 flex items-center gap-1"><CalendarCheck size={12} /> Último</dt><dd className="font-semibold text-slate-700">{ultimoDe(client.id)}</dd></div>
                  <div><dt className="text-slate-400 flex items-center gap-1"><CalendarClock size={12} /> Próximo</dt><dd className="font-semibold text-slate-700">{proximoDe(client.id)}</dd></div>
                  <div><dt className="text-slate-400">Origem</dt><dd className="text-slate-600">{nomeOrigem(client.origem_id) ?? '-'}</dd></div>
                  {ehAdmin && <div><dt className="text-slate-400">Aniversário</dt><dd className="text-slate-600">{client.birthday ? new Date(client.birthday).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}</dd></div>}
                </dl>
                <div className="mt-auto pt-2 border-t border-slate-100 flex justify-end gap-1">{acoesCliente(client)}</div>
              </div>
            ))}
          </div>
        )
      ) : (
      <>
      {/* Celular: lista em blocos, com os mesmos dados da tabela e botões maiores para o toque */}
      <div className="md:hidden">
        {isLoading ? <p className="text-center text-slate-400 py-12">Carregando...</p>
        : clientesOrdenados.length === 0 ? <p className="text-center text-slate-400 py-12">Nenhuma cliente encontrada.</p>
        : (
          <ul className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100 overflow-hidden">
            {clientesOrdenados.map((client: any) => (
              <li key={client.id} className="p-3.5 space-y-2.5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black text-xs uppercase">{client.name.substring(0, 2)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-slate-800 leading-snug break-words">{client.name}</p>
                    <p className="text-sm text-slate-500">{ehAdmin ? formatDisplayPhone(client.phone) : <span className="inline-flex items-center gap-1 text-slate-400"><Lock size={12} /> {client.phone || '-'}</span>}</p>
                  </div>
                </div>
                {ehAdmin && (gruposDaCliente.get(client.id)?.length ?? 0) > 0 && <div className="pl-[3.25rem]">{etiquetasGrupo(client.id)}</div>}
                <dl className="pl-[3.25rem] grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div><dt className="text-slate-400 flex items-center gap-1"><CalendarCheck size={12} /> Último</dt><dd className="font-semibold text-slate-700">{ultimoDe(client.id)}</dd></div>
                  <div><dt className="text-slate-400 flex items-center gap-1"><CalendarClock size={12} /> Próximo</dt><dd className="font-semibold text-slate-700">{proximoDe(client.id)}</dd></div>
                  {nomeOrigem(client.origem_id) && <div><dt className="text-slate-400">Origem</dt><dd className="text-slate-600">{nomeOrigem(client.origem_id)}</dd></div>}
                  {ehAdmin && client.birthday && <div><dt className="text-slate-400">Aniversário</dt><dd className="text-slate-600">{new Date(client.birthday).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</dd></div>}
                </dl>
                <div className="flex justify-end gap-1 -mb-1">{acoesCliente(client)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50/80 uppercase font-bold border-b border-slate-100">
              <tr>
                {cabecalho('nome')}
                {cabecalho('whatsapp')}
                {ehAdmin && cabecalho('grupo', 'hidden md:table-cell')}
                {cabecalho('ultimo', 'hidden lg:table-cell')}
                {cabecalho('proximo', 'hidden lg:table-cell')}
                {cabecalho('origem', 'hidden xl:table-cell')}
                {ehAdmin && cabecalho('aniversario', 'hidden 2xl:table-cell')}
                <th className="px-4 xl:px-6 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400">Carregando...</td></tr>
              ) : filteredClients.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400">Nenhuma cliente encontrada.</td></tr>
              ) : (
                clientesOrdenados.map((client: any) => (
                  <tr key={client.id} className="hover:bg-rose-50/30 transition-colors group">
                    <td className="px-4 xl:px-6 py-3 font-bold text-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 shrink-0 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black text-xs uppercase">{client.name.substring(0, 2)}</div>
                        <span>{client.name}</span>
                      </div>
                    </td>
                    <td className="px-4 xl:px-6 py-3 text-slate-600 font-medium whitespace-nowrap">{ehAdmin ? formatDisplayPhone(client.phone) : <span className="inline-flex items-center gap-1 text-slate-400"><Lock size={12} /> {client.phone || '-'}</span>}</td>
                    {ehAdmin && <td className="px-4 xl:px-6 py-3 hidden md:table-cell">{etiquetasGrupo(client.id, 2)}</td>}
                    <td className="px-4 xl:px-6 py-3 text-slate-500 hidden lg:table-cell whitespace-nowrap">{ultimoDe(client.id)}</td>
                    <td className="px-4 xl:px-6 py-3 text-slate-500 hidden lg:table-cell whitespace-nowrap">{proximoDe(client.id)}</td>
                    <td className="px-4 xl:px-6 py-3 text-slate-500 hidden xl:table-cell">{nomeOrigem(client.origem_id) ?? '-'}</td>
                    {ehAdmin && <td className="px-4 xl:px-6 py-3 text-slate-500 hidden 2xl:table-cell whitespace-nowrap">{client.birthday ? new Date(client.birthday).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '-'}</td>}
                    <td className="px-4 xl:px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">{acoesCliente(client)}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* MODAL HISTÓRICO */}
      {selectedHistoryClient && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase">{selectedHistoryClient.name}</h3>
                <p className="text-sm text-slate-500 mt-0.5">{ehAdmin ? 'Histórico completo de atendimentos' : 'Seus atendimentos com esta cliente e o histórico técnico'}</p>
              </div>
              <button onClick={() => setSelectedHistoryClient(null)} className="text-slate-400 hover:text-rose-600 p-1"><X size={24} /></button>
            </div>
            <div className="flex border-b border-slate-100 px-6" role="tablist">
              <button type="button" role="tab" aria-selected={abaHistorico === 'atendimentos'} onClick={() => setAbaHistorico('atendimentos')} className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 -mb-px ${abaHistorico === 'atendimentos' ? 'border-rose-600 text-rose-600 font-bold' : 'border-transparent text-slate-500'}`}><Scissors size={14} /> Atendimentos</button>
              <button type="button" role="tab" aria-selected={abaHistorico === 'tecnico'} onClick={() => setAbaHistorico('tecnico')} className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 -mb-px ${abaHistorico === 'tecnico' ? 'border-rose-600 text-rose-600 font-bold' : 'border-transparent text-slate-500'}`}><NotebookPen size={14} /> Histórico técnico</button>
              <button type="button" role="tab" aria-selected={abaHistorico === 'pacotes'} onClick={() => setAbaHistorico('pacotes')} className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 -mb-px ${abaHistorico === 'pacotes' ? 'border-rose-600 text-rose-600 font-bold' : 'border-transparent text-slate-500'}`}><Package size={14} /> Pacotes</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
              {abaHistorico === 'pacotes' ? <PacotesCliente clienteId={selectedHistoryClient.id} /> : abaHistorico === 'tecnico' ? <HistoricoTecnico clienteId={selectedHistoryClient.id} /> : clientAppointments.length === 0 ? (
                <div className="text-center py-8 text-slate-400">Nenhum atendimento registrado.</div>
              ) : (
                clientAppointments.map((apt: any) => {
                  const sName = apt.servicos?.nome ?? (Array.isArray(apt.services) ? apt.services[0]?.name : apt.services?.name) ?? apt.notes;
                  const sPrice = apt.valor_cobrado ?? (Array.isArray(apt.services) ? apt.services[0]?.price : apt.services?.price);
                  
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
                        <p className="font-black text-rose-600">{brl(sPrice || 0)}</p>
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
              <CampoOrigem origens={origens} valor={origemId} onChange={setOrigemId} />
              <div><label className="block text-xs font-bold text-slate-500 mb-1">E-mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500" /></div>
              <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={lgpd} onChange={(e) => setLgpd(e.target.checked)} className="w-4 h-4 mt-0.5 accent-rose-600" /><span><ShieldCheck size={12} className="inline text-emerald-600" /> A cliente autorizou o uso dos dados para agendamento e contato (LGPD).</span></label>
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
              <CampoOrigem origens={origens} valor={origemId} onChange={setOrigemId} />
              <div><label className="block text-xs font-bold text-slate-500 mb-1">E-mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500" /></div>
              <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={lgpd} onChange={(e) => setLgpd(e.target.checked)} className="w-4 h-4 mt-0.5 accent-rose-600" /><span><ShieldCheck size={12} className="inline text-emerald-600" /> A cliente autorizou o uso dos dados para agendamento e contato (LGPD).</span></label>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Observações</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm resize-none" /></div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setEditingClient(null)} className="w-1/2 border p-2.5 rounded-xl text-slate-500 font-medium">Cancelar</button>
                <button type="submit" disabled={updateMutation.isPending} className="w-1/2 bg-rose-600 text-white p-2.5 rounded-xl font-bold disabled:bg-rose-400">{updateMutation.isPending ? 'Atualizando...' : 'Atualizar Cliente'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGrupos && <GruposClientes clientes={clients as any[]} origens={origens} grupoInicial={grupoModal} onFechar={() => { setShowGrupos(false); setGrupoModal(null); }} />}

      {/* MODAL EXCLUIR: duas etapas (confirmar e digitar a palavra) */}
      {clientToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div role="alertdialog" aria-labelledby="titulo-excluir" className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="flex justify-center text-red-500 mb-2"><AlertTriangle size={48} /></div>
            <h3 id="titulo-excluir" className="text-xl font-bold text-slate-800">Excluir Cliente?</h3>
            {etapaExclusao === 1 ? (
              <>
                <p className="text-sm text-slate-500">Tem certeza que deseja excluir permanentemente o cadastro de <strong>{clientToDelete.name}</strong>?</p>
                <p className="text-xs text-slate-400">Etapa 1 de 2</p>
                <div className="flex space-x-3 pt-2">
                  <button onClick={fecharExclusao} className="w-1/2 border border-slate-200 bg-slate-50 text-slate-600 p-2.5 rounded-xl font-medium">Voltar</button>
                  <button onClick={() => setEtapaExclusao(2)} className="w-1/2 bg-red-600 text-white p-2.5 rounded-xl font-bold">Sim, continuar</button>
                </div>
              </>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); if (confirmacaoExclusaoValida(textoExclusao)) deleteMutation.mutate(clientToDelete.id); }} className="space-y-3">
                <p className="text-sm text-slate-500">Para confirmar a exclusão de <strong>{clientToDelete.name}</strong>, digite <strong className="text-red-600">{PALAVRA_EXCLUSAO}</strong> abaixo.</p>
                <input value={textoExclusao} onChange={(e) => setTextoExclusao(e.target.value)} autoFocus autoComplete="off" aria-label={`Digite ${PALAVRA_EXCLUSAO} para confirmar`}
                  className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-red-500 text-center font-bold tracking-widest uppercase" />
                <p className="text-xs text-slate-400">Etapa 2 de 2</p>
                <div className="flex space-x-3 pt-1">
                  <button type="button" onClick={fecharExclusao} className="w-1/2 border border-slate-200 bg-slate-50 text-slate-600 p-2.5 rounded-xl font-medium">Cancelar</button>
                  <button type="submit" disabled={!confirmacaoExclusaoValida(textoExclusao) || deleteMutation.isPending} className="w-1/2 bg-red-600 text-white p-2.5 rounded-xl font-bold disabled:opacity-40">{deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}