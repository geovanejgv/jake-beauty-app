import React, { useEffect, useState } from 'react';
import { AvisoBackup } from '../features/backup/AvisoBackup';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, Clock, User, Plus, Loader2, Edit2, X, LayoutList, Columns, Grid, Trash2, AlertTriangle, Search, Lock, Coffee, ChevronLeft, ChevronRight, CheckCircle, CalendarHeart, Repeat, UserPlus, Users, BadgeCheck, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { useNetworkState } from 'react-use';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { equipeKeys, listarAtivos, nomeNaAgenda } from '../features/equipe/api';
import { acessoTela } from '../features/acesso/permissoes';
import { catalogoKeys, listarCategorias, listarServicos, listarVinculos } from '../features/catalogo/api';
import { condicoesEfetivas, duracaoTexto } from '../features/catalogo/logic';
import { BLOQUEIO_MAX_REPETICOES, conflitoDoItem, conflitoLocal, datasDoBloqueio, fimDoItem, hhmmLocal, inicioDoItem, intervalosLivres, itensComoEventos, itensSobrepostos, mensagemAgenda, ocupaAgenda, type ItemAgendamento, type RepeticaoBloqueio } from '../features/agenda/logic';
import { LinhaDoTempo } from '../features/agenda/LinhaDoTempo';
import { brl, isoParaBR, lerValor, valorParaCampo } from '../lib/formatos';
import { listarSaldos, pacotesKeys } from '../features/pacotes/api';
import { itemParaAbater } from '../features/pacotes/logic';
import { agendarLembreteGrupo, clientesKeys, listarGrupos, listarMembros, listarOrigens } from '../features/clientes/api';
import { CampoOrigem } from '../features/clientes/CampoOrigem';

/** Erro de agenda: conflito de horário vem com mensagem própria; o resto, genérica com código. */
const erroAgenda = (e: unknown, padrao: string, origem: string) => mensagemAgenda(e) ?? mensagemDeErro(e, padrao, origem);

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

  // Celular e tablet (abaixo de 1024px) abrem na visão semanal; computador abre na mensal
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'equipe'>(
    window.innerWidth < 1024 ? 'week' : 'month'
  );

  // Papel vem do banco (AUZ-06). A profissional só recebe a própria agenda (RLS).
  const { perfil } = useAuth();
  const ehAdmin = perfil?.role === 'admin';
  // Permissão dada pela administradora (o banco confere de novo): ver a agenda das demais,
  // editar a própria e agendar para as demais.
  const acessoAgenda = acessoTela(perfil?.permissoes, 'agenda');
  const veEquipe = ehAdmin || acessoAgenda.todos;
  const agendaOutras = ehAdmin || acessoAgenda.editarTodos;
  const podeEditarAgenda = ehAdmin || acessoAgenda.editar;
  const podeMexer = (ev: { professional_id?: string | null }) =>
    ehAdmin || (acessoAgenda.editar && (ev.professional_id === perfil?.id || acessoAgenda.editarTodos));
  // Filtro da administradora: '' = todos, 'sem' = sem profissional, ou o id.
  const [filtroProf, setFiltroProf] = useState('');
  const [novoProf, setNovoProf] = useState('');
  const [novoServico, setNovoServico] = useState('');
  const [novoValor, setNovoValor] = useState('');
  const [novaDuracao, setNovaDuracao] = useState('45');
  const [usarPacote, setUsarPacote] = useState(true);
  const [novoConfirmado, setNovoConfirmado] = useState(false);
  // Serviços já montados no agendamento com vários serviços (podem ser de profissionais diferentes).
  const [itens, setItens] = useState<ItemAgendamento[]>([]);
  const [blockProf, setBlockProf] = useState('');
  const [editProf, setEditProf] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  // Atalho "Nova cliente" dentro do modal de agendamento
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientBirthday, setNewClientBirthday] = useState('');
  const [newClientOrigem, setNewClientOrigem] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [servicePrice, setServicePrice] = useState('65,00');
  const [appointmentDate, setAppointmentDate] = useState(todayStr);
  const [appointmentTime, setAppointmentTime] = useState('09:00');
  const [isRecurring, setIsRecurring] = useState(false);
  // Lembrete para um grupo inteiro de clientes (só administradora).
  const [paraGrupo, setParaGrupo] = useState(false);
  const [grupoLembrete, setGrupoLembrete] = useState('');

  const [blockDate, setBlockDate] = useState(todayStr);
  const [blockStartTime, setBlockStartTime] = useState('12:00');
  const [blockEndTime, setBlockEndTime] = useState('13:00');
  const [blockReason, setBlockReason] = useState('Almoço');
  // Bloqueio recorrente: diário, semanal ou mensal, terminando numa data ou após N vezes.
  const [blockRepeticao, setBlockRepeticao] = useState<RepeticaoBloqueio>('nao');
  const [blockTermino, setBlockTermino] = useState<'data' | 'vezes'>('data');
  const [blockAte, setBlockAte] = useState('');
  const [blockVezes, setBlockVezes] = useState('4');

  const [editServiceName, setEditServiceName] = useState('');
  const [editServicePrice, setEditServicePrice] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`id, start_time, end_time, status, is_block, block_reason, whatsapp_sent_at, return_reminder_date, return_reminder_sent, return_reminder_sent_at, is_manual_reminder, is_recurring, recurring_group_id, professional_id, client_id, servico_id, valor_cobrado, pacote_item_id, notes, services ( id, name, price, commission_rate ), servicos ( id, nome, categoria_id )`)
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  const { data: clientsList = [] } = useQuery({
    queryKey: ['clients-list-agenda'],
    queryFn: async () => {
      // Profissional vê nome e telefone mascarado (view clientes_visiveis); a administradora vê tudo.
      const { data, error } = await supabase.from('clientes_visiveis').select('id, name, phone, contato_visivel').order('name');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: gruposClientes = [] } = useQuery({ queryKey: clientesKeys.grupos, queryFn: listarGrupos, enabled: ehAdmin });
  const { data: membrosGrupos = [] } = useQuery({ queryKey: clientesKeys.membros, queryFn: listarMembros, enabled: ehAdmin });
  const { data: origens = [] } = useQuery({ queryKey: clientesKeys.origens, queryFn: listarOrigens });
  const qtdNoGrupo = (id: string) => membrosGrupos.filter((m) => m.grupo_id === id).length;

  // Na agenda, a profissional aparece pelo apelido (cadastro em Profissionais).
  const { data: equipeBruta = [] } = useQuery({ queryKey: equipeKeys.ativos, queryFn: listarAtivos });
  const equipe = equipeBruta.map((p) => ({ ...p, name: nomeNaAgenda(p) }));
  const { data: categorias = [] } = useQuery({ queryKey: catalogoKeys.categorias, queryFn: listarCategorias });
  const { data: servicosCatalogo = [] } = useQuery({ queryKey: catalogoKeys.servicos, queryFn: listarServicos });
  const { data: vinculos = [] } = useQuery({ queryKey: catalogoKeys.vinculos(), queryFn: () => listarVinculos() });
  const nomeProf = (id: string | null | undefined) => (id ? equipe.find((p) => p.id === id)?.name ?? 'Profissional' : 'Sem profissional');
  const corCategoria = (categoriaId?: string | null) => categorias.find((c) => c.id === categoriaId)?.cor;

  // Cliente (pela view) e serviço (catálogo novo, registro antigo ou nome do lembrete) normalizados.
  const mapaClientes = new Map((clientsList as any[]).map((c) => [c.id, c]));
  const agendamentos = (appointments as any[]).map((a) => ({
    ...a,
    clients: a.client_id ? mapaClientes.get(a.client_id) ?? null : null,
    services: {
      id: a.services?.id,
      name: a.servicos?.nome ?? a.services?.name ?? a.notes ?? 'Procedimento',
      price: a.valor_cobrado ?? a.services?.price ?? null,
    },
  }))
    .filter((a) => !veEquipe || !filtroProf || (filtroProf === 'sem' ? !a.professional_id : a.professional_id === filtroProf));

  // Serviços que o profissional escolhido oferece, com preço e tempo dele.
  const profAgendamento = agendaOutras ? novoProf : perfil?.id ?? '';
  const ofertas = servicosCatalogo
    .map((s) => ({ s, c: condicoesEfetivas(s, vinculos.find((v) => v.user_id === profAgendamento && v.servico_id === s.id), null) }))
    .filter((x) => x.c.oferece);
  const ofertaEscolhida = ofertas.find((x) => x.s.id === novoServico);

  // Pacotes da cliente escolhida: etiqueta de saldo e sessão reservada ao agendar.
  const { data: saldosCliente = [] } = useQuery({
    queryKey: pacotesKeys.saldos(selectedClient?.id ?? null, false),
    queryFn: () => listarSaldos(selectedClient.id, false),
    enabled: !!selectedClient?.id && showAddModal && appointmentType === 'appointment',
  });
  const itemPacote = appointmentType === 'appointment' ? itemParaAbater(saldosCliente, novoServico) : null;
  const comPacote = !!itemPacote && usarPacote;

  // Agenda completa (sem o filtro da tela) para conferir conflito e mostrar os horários livres.
  // A profissional sem "ver a agenda das demais" só recebe a própria (RLS).
  const eventosAgenda = appointments as any[];
  const painelVisivel = !!profAgendamento && (veEquipe || profAgendamento === perfil?.id);
  const diaIni = new Date(`${appointmentDate}T00:00:00`);
  const diaFim = new Date(diaIni.getTime() + 24 * 3600000);
  const agendaDoDia = !painelVisivel || isNaN(diaIni.getTime()) ? [] : [
    ...eventosAgenda.filter(ocupaAgenda).map((e) => ({
      id: e.id as string, inicio: new Date(e.start_time), fim: new Date(e.end_time), professional_id: e.professional_id, novo: false,
      rotulo: e.is_block ? `Bloqueado${e.block_reason ? `: ${e.block_reason}` : ''}` : `${mapaClientes.get(e.client_id)?.name ?? 'Cliente'} · ${e.servicos?.nome ?? e.services?.name ?? e.notes ?? 'Procedimento'}`,
    })),
    ...itensComoEventos(itens).map((e, i) => ({ id: e.id, inicio: new Date(e.start_time), fim: new Date(e.end_time), professional_id: e.professional_id, novo: true, rotulo: `Neste agendamento · ${itens[i].servicoNome}` })),
  ].filter((e) => e.professional_id === profAgendamento && e.inicio < diaFim && e.fim > diaIni)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const duracaoAtual = ofertaEscolhida?.c.minutos ?? (novoServico === 'avulso' ? Number(novaDuracao) || 15 : 15);
  const livresDoDia = painelVisivel && !isNaN(diaIni.getTime())
    ? intervalosLivres(agendaDoDia, new Date(`${appointmentDate}T07:00:00`), new Date(`${appointmentDate}T21:00:00`), duracaoAtual)
    : [];

  // Atalho por endereço: /agenda?novo=agendamento abre o agendamento
  useEffect(() => {
    if (searchParams.get('novo') !== 'agendamento') return;
    openAddModalForType('appointment', todayStr);
    searchParams.delete('novo');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Cadastra a cliente na hora e já a seleciona no agendamento
  const addClientMutation = useMutation({
    mutationFn: async (client: { name: string; phone: string; birthday: string; origem: string }) => {
      // Função do banco: cadastra sem dar à profissional leitura da base de clientes.
      const { data, error } = await supabase.rpc('cadastrar_cliente_rapido', {
        p_nome: client.name, p_telefone: client.phone, p_aniversario: client.birthday || null, p_origem: client.origem || null,
      });
      if (error) throw error;
      return { id: data as string, name: client.name, phone: client.phone, contato_visivel: ehAdmin || acessoTela(perfil?.permissoes, 'clientes').campo('telefone') };
    },
    onSuccess: (client: any) => {
      queryClient.invalidateQueries({ queryKey: ['clients-list-agenda'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setSelectedClient(client);
      setClientSearchTerm('');
      closeNewClientForm();
    },
    onError: (error: unknown) => alert(mensagemDeErro(error, 'Ops! Não foi possível cadastrar a cliente.', 'agenda.nova_cliente'))
  });

  // Lembrete manual não ocupa a agenda; o nome do procedimento fica nas observações.
  const addAppointmentMutation = useMutation({
    mutationFn: async (newApt: any) => {
      const inicio = new Date(`${newApt.date}T${newApt.time}:00`);
      const inserts = [];
      const groupId = newApt.is_recurring ? crypto.randomUUID() : null;
      const loopCount = newApt.is_recurring ? 24 : 1;
      for (let i = 0; i < loopCount; i++) {
        const start = new Date(inicio);
        start.setMonth(start.getMonth() + i);
        const end = new Date(start.getTime() + 45 * 60000);
        inserts.push({
          client_id: newApt.client_id,
          professional_id: newApt.professional_id || null,
          servico_id: newApt.servico_id || null,
          notes: newApt.service_name || null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          status: 'scheduled',
          is_block: false,
          is_manual_reminder: true,
          is_recurring: newApt.is_recurring,
          recurring_group_id: groupId
        });
      }
      const { error } = await supabase.from('appointments').insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['appointments-list'] }); 
      queryClient.invalidateQueries({ queryKey: pacotesKeys.base });
      setShowAddModal(false); 
      setSelectedClient(null); 
      setClientSearchTerm(''); 
      setServiceName(''); 
      setServicePrice('65,00'); 
      setIsRecurring(false);
      setNovoServico('');
      setNovoValor('');
      setNovoConfirmado(false);
    },
    onError: (error: unknown) => alert(erroAgenda(error, 'Não foi possível agendar.', 'agenda.agendar'))
  });

  // Atendimento (um ou vários serviços): um por vez pela função do banco, com trava contra
  // conflito e valores do catálogo. Se um falhar, os já salvos saem da lista e o resto fica para corrigir.
  const agendarItensMutation = useMutation({
    mutationFn: async ({ cliente, confirmado, lista }: { cliente: string; confirmado: boolean; lista: ItemAgendamento[] }) => {
      const salvos: string[] = [];
      for (const it of lista) {
        const { error } = await supabase.rpc('agendar_atendimento', {
          p_cliente: cliente,
          p_profissional: it.profissionalId,
          p_servico: it.servicoId,
          p_inicio: inicioDoItem(it).toISOString(),
          p_servico_avulso: it.servicoId ? null : it.servicoNome,
          p_valor: it.valor,
          p_duracao_minutos: it.servicoId ? null : it.minutos,
          p_status: confirmado ? 'confirmed' : 'scheduled',
          p_observacao: null,
          p_pacote_item: it.pacoteItemId,
        });
        if (error) throw { salvos, lista, item: it, erro: error };
        salvos.push(it.chave);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments-list'] });
      queryClient.invalidateQueries({ queryKey: pacotesKeys.base });
      setShowAddModal(false);
      setSelectedClient(null);
      setClientSearchTerm('');
      setServiceName('');
      setServicePrice('65,00');
      setNovoServico('');
      setNovoValor('');
      setNovoConfirmado(false);
      setItens([]);
    },
    onError: (falha: any) => {
      const salvos: string[] = falha?.salvos ?? [];
      const msg = erroAgenda(falha?.erro ?? falha, 'Não foi possível agendar.', 'agenda.agendar');
      if (!salvos.length) return alert(msg);
      queryClient.invalidateQueries({ queryKey: ['appointments-list'] });
      queryClient.invalidateQueries({ queryKey: pacotesKeys.base });
      // O que faltou volta para a lista; o formulário fica livre para corrigir.
      setItens((falha.lista as ItemAgendamento[]).filter((x) => !salvos.includes(x.chave)));
      setNovoServico('');
      setNovoValor('');
      alert(`${salvos.length} serviço(s) agendado(s). "${falha.item?.servicoNome}" não foi salvo: ${msg}`);
    }
  });

  const lembreteGrupoMutation = useMutation({
    mutationFn: agendarLembreteGrupo,
    onSuccess: (qtd) => {
      queryClient.invalidateQueries({ queryKey: ['appointments-list'] });
      setShowAddModal(false);
      setServiceName('');
      setIsRecurring(false);
      setNovoServico('');
      alert(qtd ? `Lembrete agendado para ${qtd} cliente(s) do grupo.` : 'O grupo está sem clientes: nenhum lembrete foi criado.');
    },
    onError: (error: unknown) => alert(erroAgenda(error, 'Não foi possível agendar o lembrete do grupo.', 'agenda.lembrete_grupo'))
  });

  // Bloqueio (um dia ou a série inteira num único insert: se um dia conflitar, nada é criado).
  const addBlockMutation = useMutation({
    mutationFn: async (block: { datas: string[]; startTime: string; endTime: string; reason: string; professional_id: string | null }) => {
      const serie = block.datas.length > 1;
      const grupo = serie ? crypto.randomUUID() : null;
      const { error } = await supabase.from('appointments').insert(block.datas.map((data) => ({
        is_block: true, block_reason: block.reason, status: 'scheduled', professional_id: block.professional_id || null,
        start_time: new Date(`${data}T${block.startTime}:00`).toISOString(),
        end_time: new Date(`${data}T${block.endTime}:00`).toISOString(),
        is_recurring: serie, recurring_group_id: grupo,
      })));
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments-list'] }); closeBlockModal(); },
    onError: (error: unknown) => alert(erroAgenda(error, 'Não foi possível bloquear o horário.', 'agenda.bloqueio'))
  });

  const updateBlockMutation = useMutation({
    mutationFn: async (blockData: any) => {
      const start = new Date(`${blockData.date}T${blockData.startTime}:00`);
      const end = new Date(`${blockData.date}T${blockData.endTime}:00`);
      const { error } = await supabase.from('appointments').update({ 
        start_time: start.toISOString(), 
        end_time: end.toISOString(), 
        block_reason: blockData.reason,
        ...(agendaOutras ? { professional_id: blockData.professional_id || null } : {})
      }).eq('id', blockData.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments-list'] }); closeBlockModal(); },
    onError: (error: unknown) => alert(erroAgenda(error, 'Não foi possível atualizar o bloqueio.', 'agenda.bloqueio'))
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async (updatedData: any) => {
      const apt = editingAppointment;
      const inicio = new Date(`${updatedData.date}T${updatedData.time}:00`);
      const trocouHorario = inicio.getTime() !== new Date(apt.start_time).getTime();
      const trocouProf = agendaOutras && (updatedData.professional_id || null) !== (apt.professional_id || null);
      if (trocouHorario || trocouProf) {
        // Remarcação passa pela trava de conflito do banco.
        const { error } = await supabase.rpc('remarcar_atendimento', { p_id: apt.id, p_inicio: inicio.toISOString(), p_profissional: trocouProf ? updatedData.professional_id || null : null });
        if (error) throw error;
      }
      if (ehAdmin) {
        const valor = lerValor(String(updatedData.price));
        if (valor !== null && valor !== Number(apt.valor_cobrado ?? apt.services?.price ?? -1)) {
          const { error } = await supabase.from('appointments').update({ valor_cobrado: valor }).eq('id', apt.id);
          if (error) throw error;
        }
        // Procedimento avulso antigo: nome editável no registro avulso.
        if (updatedData.serviceId && !apt.servico_id && updatedData.serviceName && updatedData.serviceName !== apt.services?.name) {
          const { error } = await supabase.from('services').update({ name: updatedData.serviceName }).eq('id', updatedData.serviceId);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments-list'] }); setEditingAppointment(null); },
    onError: (error: unknown) => alert(erroAgenda(error, 'Não foi possível atualizar o agendamento.', 'agenda.editar'))
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments-list'] }); queryClient.invalidateQueries({ queryKey: pacotesKeys.base }); setEditingAppointment(null); },
    onError: (error: unknown) => alert(erroAgenda(error, 'Não foi possível mudar o status.', 'agenda.status'))
  });

  // Falta em sessão de pacote desconta a sessão (regra do pacote); pede confirmação.
  const marcarFalta = (apt: any) => {
    if (apt.pacote_item_id && !window.confirm('Esta é uma sessão de pacote: a falta desconta 1 sessão do saldo da cliente. Confirmar a falta?')) return;
    updateStatusMutation.mutate({ id: apt.id, status: 'no_show' });
  };

  const deleteAppointmentMutation = useMutation({
    mutationFn: async (apt: any) => {
      if (apt.is_reminder_event && !apt.is_manual_reminder) {
        const { error } = await supabase.from('appointments').update({ return_reminder_date: null }).eq('id', apt.id);
        if (error) throw error;
      } else if (apt.is_recurring && apt.recurring_group_id && !apt.so_este) {
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
    },
    onError: (error: unknown) => alert(erroAgenda(error, 'Não foi possível excluir.', 'agenda.excluir'))
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
    setBlockRepeticao('nao');
    setBlockTermino('data');
    setBlockAte('');
    setBlockVezes('4');
  };

  // Máscara (11) 99999-9999, igual à tela de Clientes
  const formatPhoneInput = (raw: string) => {
    let value = raw.replace(/\D/g, '').slice(0, 11);
    if (value.length > 2) value = `(${value.substring(0, 2)}) ${value.substring(2)}`;
    if (value.length > 10) value = `${value.substring(0, 10)}-${value.substring(10)}`;
    return value;
  };

  // Abre o mini cadastro já preenchido com o que foi digitado na busca (nome ou telefone)
  const openNewClientForm = () => {
    const term = clientSearchTerm.trim();
    const isPhone = term !== '' && /^[\d\s()+-]+$/.test(term);
    setNewClientName(isPhone ? '' : term);
    setNewClientPhone(isPhone ? formatPhoneInput(term) : '');
    setShowNewClientForm(true);
  };

  const closeNewClientForm = () => {
    setShowNewClientForm(false);
    setNewClientName('');
    setNewClientPhone('');
    setNewClientBirthday('');
    setNewClientOrigem('');
  };

  const handleSaveNewClient = () => {
    const name = newClientName.trim();
    if (!name) return alert('Informe o nome da cliente.');
    addClientMutation.mutate({ name, phone: newClientPhone, birthday: newClientBirthday, origem: newClientOrigem });
  };

  const openAddModalForType = (type: 'appointment' | 'reminder', dateStr?: string, prof?: string | null, hora?: string) => {
    if (!podeEditarAgenda) return;
    closeNewClientForm();
    setAppointmentType(type);
    setNovoProf(prof ?? (filtroProf && filtroProf !== 'sem' ? filtroProf : ''));
    setNovoServico('');
    setNovoValor('');
    setNovoConfirmado(false);
    setUsarPacote(true);
    setItens([]);
    if (hora) setAppointmentTime(hora);
    setIsRecurring(false);
    setParaGrupo(false);
    setGrupoLembrete('');
    if (dateStr) setAppointmentDate(dateStr);
    setActionMenuDate(null);
    setShowAddModal(true);
  };

  const openBlockModalForDate = (dateStr?: string) => {
    if (!podeEditarAgenda) return;
    if (dateStr) setBlockDate(dateStr);
    setActionMenuDate(null);
    setEditingBlock(null);
    setBlockProf(filtroProf && filtroProf !== 'sem' ? filtroProf : '');
    setBlockStartTime('12:00');
    setBlockEndTime('13:00');
    setBlockReason('Almoço');
    setBlockRepeticao('nao');
    setBlockTermino('data');
    setBlockAte('');
    setBlockVezes('4');
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
    setBlockProf(block.professional_id || '');
    setShowBlockModal(true);
  };

  const handleAddSubmit = (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (appointmentType === 'reminder' && paraGrupo) {
      if (!grupoLembrete) return alert('Escolha o grupo.');
      const doCatalogo = novoServico && novoServico !== 'avulso' ? novoServico : null;
      const texto = doCatalogo ? servicosCatalogo.find((x) => x.id === doCatalogo)?.nome ?? null : serviceName.trim();
      if (!texto) return alert('Informe o procedimento.');
      return lembreteGrupoMutation.mutate({
        grupo: grupoLembrete,
        inicio: new Date(`${appointmentDate}T${appointmentTime}:00`).toISOString(),
        profissional: novoProf || null,
        servico: doCatalogo,
        texto,
        recorrente: isRecurring,
      });
    }
    if (!selectedClient) return alert("Selecione uma cliente."); 
    if (appointmentType === 'appointment') {
      // Com serviços já na lista, o formulário em branco só salva a lista.
      const atual = itens.length && !novoServico ? null : montarItem();
      if (typeof atual === 'string') return alert(atual);
      const lista = atual ? [...itens, atual] : itens;
      // Bloqueio impede; atendimento no mesmo horário é permitido, só pede confirmação.
      const choque = lista.map((it) => ({ it, c: conflitoDoItem(eventosAgenda, it) })).find((x) => x.c);
      if (choque) return alert(`Horário bloqueado em "${choque.it.servicoNome}" (${nomeProf(choque.it.profissionalId)}, ${choque.it.hora}): ${choque.c?.block_reason ?? 'bloqueio'}. Escolha outro horário.`);
      const juntos = itensSobrepostos(eventosAgenda, lista);
      if (juntos.length && !window.confirm(`${juntos.map((it) => `${nomeProf(it.profissionalId)} às ${it.hora}`).join(', ')}: já há atendimento nesse horário. Agendar mesmo assim?`)) return;
      return agendarItensMutation.mutate({ cliente: selectedClient.id, confirmado: novoConfirmado, lista });
    }
    const professional_id = agendaOutras ? novoProf : perfil?.id ?? '';
    addAppointmentMutation.mutate({ 
      client_id: selectedClient.id, 
      professional_id: professional_id || null,
      servico_id: novoServico && novoServico !== 'avulso' ? novoServico : null,
      service_name: novoServico && novoServico !== 'avulso' ? servicosCatalogo.find((x) => x.id === novoServico)?.nome : serviceName, 
      date: appointmentDate, 
      time: appointmentTime, 
      is_recurring: isRecurring
    }); 
  };

  // Monta o serviço que está no formulário (validação igual à do banco; o banco confere de novo).
  const montarItem = (): ItemAgendamento | string => {
    const profissionalId = agendaOutras ? novoProf : perfil?.id ?? '';
    if (!profissionalId) return 'Escolha o profissional.';
    if (!novoServico) return 'Escolha o serviço.';
    const base = { chave: crypto.randomUUID(), profissionalId, data: appointmentDate, hora: appointmentTime };
    if (!appointmentDate || !appointmentTime) return 'Informe data e horário.';
    if (novoServico === 'avulso') {
      const nome = serviceName.trim();
      if (!nome) return 'Informe o procedimento.';
      const valor = lerValor(servicePrice);
      if (valor === null) return 'Valor inválido.';
      const minutos = Number(novaDuracao);
      if (!minutos || minutos < 5 || minutos > 600) return 'Duração entre 5 e 600 minutos.';
      return { ...base, servicoId: null, servicoNome: nome, minutos, valor, valorExibido: valor, pacoteItemId: null };
    }
    if (!ofertaEscolhida) return 'Escolha o serviço.';
    const valor = ehAdmin && novoValor.trim() && !comPacote ? lerValor(novoValor) : null;
    if (ehAdmin && novoValor.trim() && !comPacote && valor === null) return 'Valor inválido.';
    return {
      ...base, servicoId: novoServico, servicoNome: ofertaEscolhida.s.nome, minutos: ofertaEscolhida.c.minutos, valor,
      valorExibido: comPacote ? itemPacote?.valor_sessao ?? null : valor ?? ofertaEscolhida.c.valor,
      pacoteItemId: comPacote ? itemPacote!.item_id : null,
    };
  };

  // "+ Serviço": guarda o serviço na lista e deixa o formulário pronto para o próximo,
  // começando quando este termina (a profissional pode ser trocada).
  const adicionarItem = () => {
    const it = montarItem();
    if (typeof it === 'string') return alert(it);
    const c = conflitoDoItem(eventosAgenda, it);
    if (c) return alert(`Horário bloqueado: ${nomeProf(it.profissionalId)} tem bloqueio nesse intervalo (${c.block_reason ?? 'bloqueio'}).`);
    setItens([...itens, it]);
    setNovoServico('');
    setNovoValor('');
    setServiceName('');
    setUsarPacote(true);
    const fim = fimDoItem(it);
    setAppointmentDate(`${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}`);
    setAppointmentTime(hhmmLocal(fim));
  };
  
  const handleAddBlockSubmit = (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (blockEndTime <= blockStartTime) return alert("O horário final deve ser maior que o inicial."); 
    if (editingBlock) {
      updateBlockMutation.mutate({ id: editingBlock.id, date: blockDate, startTime: blockStartTime, endTime: blockEndTime, reason: blockReason, professional_id: blockProf });
    } else {
      const datas = datasDoBloqueio(blockDate, blockRepeticao, blockTermino === 'data' ? { tipo: 'data', ate: blockAte } : { tipo: 'vezes', vezes: Number(blockVezes) });
      if (typeof datas === 'string') return alert(datas);
      const professional_id = (agendaOutras ? blockProf : perfil?.id) || null;
      // Mesma regra da trava do banco: bloqueio não entra sobre atendimento ativo.
      const conflitos = professional_id ? datas.filter((d) => conflitoLocal(appointments as any[], professional_id, new Date(`${d}T${blockStartTime}:00`), new Date(`${d}T${blockEndTime}:00`), undefined, true)) : [];
      if (conflitos.length) return alert(`Conflito de horário: ${nomeProf(professional_id)} já tem atendimento em ${conflitos.slice(0, 10).map(isoParaBR).join(', ')}${conflitos.length > 10 ? ` e mais ${conflitos.length - 10} dia(s)` : ''}. Ajuste o horário ou as datas.`);
      addBlockMutation.mutate({ datas, startTime: blockStartTime, endTime: blockEndTime, reason: blockReason, professional_id });
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!editingAppointment) return; updateAppointmentMutation.mutate({ id: editingAppointment.id, serviceId: editingAppointment.services?.id, serviceName: editServiceName, price: editServicePrice, date: editDate, time: editTime, professional_id: editProf }); };

  const openEditModal = (apt: any) => {
    if (!podeMexer(apt)) return;
    setEditingAppointment(apt); setEditServiceName(apt.services?.name || ''); setEditServicePrice(apt.services?.price != null ? valorParaCampo(apt.services.price) : ''); setEditProf(apt.professional_id || '');
    const aptDate = new Date(apt.start_time); setEditDate(aptDate.toISOString().split('T')[0]); setEditTime(aptDate.toTimeString().slice(0, 5));
  };

  // Atalho por endereço: /agenda?agendamento=<id> abre a edição desse atendimento (vindo do Meu Painel)
  useEffect(() => {
    const id = searchParams.get('agendamento');
    if (!id || isLoading) return;
    const apt = agendamentos.find((a: any) => a.id === id && !a.is_block);
    if (apt) { setSelectedDate(new Date(apt.start_time).toISOString().split('T')[0]); openEditModal(apt); }
    searchParams.delete('agendamento');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isLoading]);

  const handleSendToCheckout = (apt: any) => { setEditingAppointment(null); navigate('/pdv', { state: { appointment: apt } }); };

  const handleSendWhatsApp = (apt: any) => {
    if (!apt.clients?.contato_visivel) return alert('O contato da cliente fica com a administração do salão.');
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
    if (!apt.clients?.contato_visivel) return alert('O contato da cliente fica com a administração do salão.');
    const phone = apt.clients?.phone;
    const cName = apt.clients?.name.split(' ')[0] || 'Cliente'; 
    if (!phone) return alert(`O cadastro de ${cName} está sem número de WhatsApp.`);
    let cleanPhone = phone.replace(/\D/g, ''); if (cleanPhone.length === 11 || cleanPhone.length === 10) cleanPhone = `55${cleanPhone}`;
    const sName = Array.isArray(apt.services) ? apt.services[0]?.name : apt.services?.name || 'seu procedimento';
    const message = `Olá, ${cName}! Tudo bem com você? 🌸\n\nAqui é do *${perfil?.estabelecimento?.nome ?? 'salão'}*! Estava lembrando de você hoje e percebi que já está na hora de renovarmos o seu procedimento de *${sName}* para mantermos aqueles resultados maravilhosos que você adora! 🥰\n\nVamos agendar um novo horário? Te aguardo! ✨`;
    markWhatsAppSentMutation.mutate({id: apt.id, type: 'reminder'});
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleNavigateDate = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate + 'T12:00:00');
    const modifier = direction === 'next' ? 1 : -1;
    if (viewMode === 'month') currentDate.setMonth(currentDate.getMonth() + modifier);
    else if (viewMode === 'equipe') currentDate.setDate(currentDate.getDate() + modifier);
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
    // Usa uma cópia a cada dia: alterar "curr" direto fazia a semana pular de mês na virada (ex.: 01/10 -> 01/11)
    for (let i = 0; i < 7; i++) { const d = new Date(curr); d.setDate(diff + i); week.push(d.toISOString().split('T')[0]); } return week;
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
  agendamentos.forEach((apt: any) => {
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
    if (viewMode === 'equipe') return ev.event_date === selectedDate;
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
            <div><h4 className="font-bold text-slate-700 flex items-center space-x-1 text-sm"><Lock size={14} className="text-slate-500" /> <span>Bloqueado</span>{ev.is_recurring && <Repeat size={12} className="text-slate-500"><title>Bloqueio recorrente</title></Repeat>}</h4><p className="text-xs text-slate-500 font-medium">{ev.block_reason}</p></div>
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
                {ev.is_recurring && <Repeat size={14} className="ml-1 text-indigo-500"><title>Recorrente Mensal</title></Repeat>}
                {ev.pacote_item_id && <Package size={14} className="ml-1 text-violet-600"><title>Sessão de pacote</title></Package>}
                {ev.return_reminder_sent_at && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ml-2 uppercase font-bold flex items-center gap-1"><CheckCircle size={8}/> Já Chamou ({new Date(ev.return_reminder_sent_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})})</span>}
              </h4>
              <p className="text-xs text-indigo-600">Lembrar de agendar: {sName}</p>
            </div>
          </div>
          <div className={`flex items-center space-x-1.5 flex-wrap gap-y-2 ${podeMexer(ev) ? '' : 'hidden'}`}>
             {ev.clients?.contato_visivel && <button onClick={(e) => { e.stopPropagation(); handleSendReminderWhatsApp(ev); }} className="px-3 py-1.5 border border-emerald-200 text-emerald-700 bg-emerald-100 hover:bg-emerald-200 font-bold rounded-lg transition-colors text-xs flex items-center gap-1.5 shadow-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
                Chamar Cliente
             </button>}
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
              {ev.status === 'confirmed' && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ml-2 uppercase font-bold flex items-center gap-0.5"><BadgeCheck size={10} /> Confirmado</span>}
              {isCancelled && <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded ml-2 uppercase font-bold">Cancelou</span>}
              {isNoShow && <span className="text-[9px] bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded ml-2 uppercase font-bold">Faltou</span>}
            </h4>
            <p className="text-xs text-slate-500">{sName} {sPrice != null && `• ${brl(sPrice)}`}{veEquipe && !filtroProf && <span className="ml-1 text-slate-400">• {nomeProf(ev.professional_id)}</span>}</p>
          </div>
        </div>
        <div className={`flex items-center space-x-1.5 flex-wrap gap-y-2 ${podeMexer(ev) ? '' : 'hidden'}`}>
          {!isInactive && (
             <div className="flex items-center space-x-1.5 md:mr-2">
               {ev.clients?.contato_visivel && <div className="flex items-center space-x-1">
                 {ev.whatsapp_sent_at && (<span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-1 rounded flex items-center gap-1 border border-emerald-100"><CheckCircle size={10} /> {new Date(ev.whatsapp_sent_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</span>)}
                 <button onClick={(e) => { e.stopPropagation(); handleSendWhatsApp(ev); }} className="p-1.5 border border-emerald-100 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-700 rounded-lg transition-colors flex items-center justify-center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg></button>
               </div>}
               <button onClick={(e) => { e.stopPropagation(); marcarFalta(ev) }} className="px-2.5 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold rounded-lg transition-colors text-xs border border-amber-100 hidden sm:block">Faltou</button>
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
          ) : !isInactive && ehAdmin ? (
            <button onClick={(e) => { e.stopPropagation(); handleSendToCheckout(ev); }} className="px-3 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 font-bold rounded-lg transition-colors text-xs md:ml-1">Checkout</button>
          ) : !isInactive ? (
            <button onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: ev.id, status: 'completed' }); }} className="px-3 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 font-bold rounded-lg transition-colors text-xs md:ml-1">Concluir</button>
          ) : (isCancelled || isNoShow) ? (
            <button onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({id: ev.id, status: 'scheduled'}); }} className="px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold rounded-lg transition-colors text-xs md:ml-1">↩️ Restaurar</button>
          ) : null}
        </div>
      </div>
    );
  };

  // Na visão semanal, rola a faixa de dias até o dia de hoje (útil no celular, onde a semana não cabe inteira)
  useEffect(() => {
    if (viewMode !== 'week' || isLoading || window.innerWidth < 768) return;
    document.querySelector('[data-today]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [viewMode, isLoading, selectedDate]);

  return (
    <div className="w-full h-[calc(100dvh-100px)] md:h-[calc(100vh-4rem)] flex flex-col space-y-2 md:space-y-3">
      <div className="shrink-0 empty:hidden"><AvisoBackup tipo="agenda" exibir="faixa" /></div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 shrink-0">
        <div className="hidden md:block"><h2 className="text-xl md:text-2xl font-black text-slate-800 leading-none">Agenda Conectada</h2>{!veEquipe && perfil && <p className="text-xs text-slate-500 mt-1">Sua agenda, {perfil.name.split(' ')[0]}</p>}</div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <AvisoBackup tipo="agenda" exibir="botao" />
          <div className="bg-slate-200 p-0.5 rounded-lg flex items-center space-x-0.5">
            <button onClick={() => setViewMode('day')} className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === 'day' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><LayoutList size={12} /> <span>Dia</span></button>
            <button onClick={() => setViewMode('week')} className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === 'week' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Columns size={12} /> <span>Semana</span></button>
            <button onClick={() => setViewMode('month')} className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === 'month' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Grid size={12} /> <span>Mês</span></button>
            {veEquipe && <button onClick={() => setViewMode('equipe')} className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === 'equipe' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`} title="Linha do tempo por profissional"><Users size={12} /> <span>Equipe</span></button>}
          </div>

          {veEquipe && (
            <select value={filtroProf} onChange={(e) => setFiltroProf(e.target.value)} aria-label="Filtrar por profissional"
              className="h-8 bg-white border border-slate-300 rounded-lg px-2 text-[11px] font-bold text-slate-700 shadow-sm max-w-[180px]">
              <option value="">Todos os profissionais</option>
              {equipe.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="sem">Sem profissional</option>
            </select>
          )}

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
          
          <div className={`flex space-x-2 h-8 ${podeEditarAgenda ? '' : 'hidden'}`}>
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
              {viewMode === 'equipe' && `Equipe: ${formattedWeekDay}, ${selectedDate.split('-').reverse().join('/')}`}
            </span>
          </div>
        </div>
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400"><Loader2 className="animate-spin mb-2 text-rose-500" size={32} /></div>
        ) : viewMode === 'equipe' ? (
          <LinhaDoTempo
            eventos={filteredEvents.filter((ev: any) => !ev.is_reminder_event).map((ev: any) => ({
              id: ev.id, start_time: ev.start_time, end_time: ev.end_time, status: ev.status, professional_id: ev.professional_id,
              is_block: ev.is_block, block_reason: ev.block_reason, cliente: ev.clients?.name || 'Cliente', servico: ev.services?.name || 'Procedimento',
              cor: corCategoria(ev.servicos?.categoria_id),
            }))}
            profissionais={equipe.filter((p) => !filtroProf || p.id === filtroProf)}
            mostrarSemProfissional={(!filtroProf || filtroProf === 'sem') && filteredEvents.some((ev: any) => !ev.is_reminder_event && !ev.professional_id)}
            onNovo={(prof, hora) => { openAddModalForType('appointment', selectedDate, prof ?? '', hora); }}
            onAbrir={(id) => {
              const ev = filteredEvents.find((x: any) => x.id === id && !x.is_reminder_event);
              if (!ev) return;
              if (ev.is_block) openEditBlockModal(ev); else openEditModal(ev);
            }}
          />
        ) : viewMode === 'day' ? (
          // Dia: lembretes (sem horário ocupado) em lista no topo e a grade por horas abaixo.
          <div className="flex-1 min-h-0 flex flex-col">
            {filteredEvents.some((ev: any) => ev.is_reminder_event) && (
              <div className="shrink-0 max-h-48 overflow-y-auto p-3 pb-1 border-b border-slate-200">
                {filteredEvents.filter((ev: any) => ev.is_reminder_event).map((ev: any) => renderEventRow(ev))}
              </div>
            )}
            <LinhaDoTempo
              eventos={filteredEvents.filter((ev: any) => !ev.is_reminder_event).map((ev: any) => ({
                id: ev.id, start_time: ev.start_time, end_time: ev.end_time, status: ev.status, professional_id: ev.professional_id,
                is_block: ev.is_block, block_reason: ev.block_reason, cliente: ev.clients?.name || 'Cliente', servico: ev.services?.name || 'Procedimento',
                cor: corCategoria(ev.servicos?.categoria_id),
              }))}
              profissionais={[]}
              mostrarSemProfissional={false}
              umaColuna={veEquipe ? (filtroProf && filtroProf !== 'sem' ? nomeProf(filtroProf) : filtroProf === 'sem' ? 'Sem profissional' : 'Todos os profissionais') : nomeProf(perfil?.id)}
              onNovo={(_, hora) => { openAddModalForType('appointment', selectedDate, undefined, hora); }}
              onAbrir={(id) => {
                const ev = filteredEvents.find((x: any) => x.id === id && !x.is_reminder_event);
                if (!ev) return;
                if (ev.is_block) openEditBlockModal(ev); else openEditModal(ev);
              }}
            />
          </div>
        ) : viewMode === 'week' ? (
          // Celular (abaixo de 768px): semana em duas linhas que dividem a altura da tela,
          // Seg a Qui em cima (4 colunas) e Sex a Dom embaixo (3 colunas), sem rolagem lateral.
          // Tablet e computador: faixa única de 7 colunas com rolagem lateral.
          <div className="flex-1 min-h-0 grid grid-cols-12 grid-rows-2 gap-px bg-slate-200 md:flex md:gap-0 md:divide-x md:divide-slate-200 md:bg-slate-50 md:overflow-x-auto">
            {weekDates.map((dateStr, dayIndex) => {
              const dayEvents = filteredEvents.filter((ev: any) => ev.event_date === dateStr);
              const isToday = dateStr === todayStr; const dateObj = new Date(dateStr + 'T00:00:00');
              return (
                <div key={dateStr} data-today={isToday || undefined} onClick={() => setActionMenuDate(dateStr)} className={`flex flex-col bg-white min-w-0 min-h-0 ${dayIndex < 4 ? 'col-span-3' : 'col-span-4'} md:min-w-[150px] md:flex-1 cursor-pointer hover:bg-rose-50/20 transition-colors ${isToday ? 'ring-2 ring-rose-500 ring-inset' : ''}`}>
                  <div className={`py-1.5 text-center border-b border-slate-200 shrink-0 ${isToday ? 'bg-rose-600 text-white font-bold' : 'bg-slate-100 text-slate-700'}`}><p className="text-[10px] tracking-wider uppercase">{dateObj.toLocaleDateString('pt-BR', { weekday: 'short' })}</p><p className="text-xs font-extrabold">{dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</p></div>
                  <div className="p-1 space-y-1 md:p-1.5 md:space-y-1.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {dayEvents.length === 0 ? <p className="text-[10px] text-slate-300 text-center py-4 italic">Livre</p> : dayEvents.map((ev: any) => {
                      const hour = new Date(ev.start_time).getHours().toString().padStart(2, '0');
                      const min = new Date(ev.start_time).getMinutes().toString().padStart(2, '0');
                      const endH = new Date(ev.end_time).getHours().toString().padStart(2, '0');
                      const endM = new Date(ev.end_time).getMinutes().toString().padStart(2, '0');

                      if (ev.is_block) return (
                        <div key={`block-${ev.id}`} onClick={(e) => { e.stopPropagation(); openEditBlockModal(ev); }} className="p-1 md:p-1.5 rounded border text-[10px] transition-all bg-red-500 border-red-700 text-white cursor-pointer hover:bg-red-600">
                          <div className="flex justify-between items-center font-bold mb-0.5"><span className="flex items-center"><Lock size={10} className="mr-1" /> {hour}:{min} - {endH}:{endM}</span></div>
                          <p className="font-bold truncate max-lg:whitespace-normal max-lg:line-clamp-2 max-lg:break-words max-md:tracking-tight">{ev.block_reason}</p>
                        </div>
                      );
                      
                      if (ev.is_reminder_event) return (
                        <div key={`rem-${ev.id}`} onClick={(e) => { e.stopPropagation(); handleSendReminderWhatsApp(ev); }} className={`p-1 md:p-1.5 rounded border text-[10px] transition-all cursor-pointer bg-indigo-50 border-indigo-200 text-indigo-900 font-bold hover:bg-indigo-100 flex flex-col ${ev.is_recurring ? 'animate-pulse hover:animate-none' : ''}`}>
                          <div className="flex justify-between items-center mb-0.5">
                             <span className="flex items-center text-indigo-600">
                               <CalendarHeart size={10} className="mr-1"/> Retorno
                               {ev.is_recurring && <Repeat size={10} className="ml-1 text-indigo-500"><title>Recorrente Mensal</title></Repeat>}{ev.pacote_item_id && <Package size={10} className="ml-1 text-violet-600"><title>Sessão de pacote</title></Package>}
                             </span>
                             <button onClick={(e) => { e.stopPropagation(); setAppointmentToDelete(ev); }} className="opacity-50 hover:opacity-100 hover:text-red-500" title="Excluir Lembrete"><Trash2 size={10} /></button>
                          </div>
                          <p className="font-bold truncate max-lg:whitespace-normal max-lg:line-clamp-2 max-lg:break-words max-md:tracking-tight">{ev.clients?.name}</p>
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
                        <div key={`apt-${ev.id}`} onClick={(e) => { e.stopPropagation(); openEditModal(ev); }} className={`p-1 md:p-1.5 rounded border text-[10px] transition-all cursor-pointer flex flex-col ${itemClass}`}>
                          <div className="flex justify-between items-center mb-0.5">
                            <span>{hour}:{min}</span>
                            <button onClick={(e) => { e.stopPropagation(); setAppointmentToDelete(ev); }} className="opacity-50 hover:opacity-100 hover:text-red-500"><Trash2 size={10} /></button>
                          </div>
                          <p className="font-bold truncate max-lg:whitespace-normal max-lg:line-clamp-2 max-lg:break-words max-md:tracking-tight">{ev.clients?.name}</p>
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
                          <div key={`block-${ev.id}`} onClick={(e) => { e.stopPropagation(); openEditBlockModal(ev); }} className="p-1 rounded bg-red-500 border border-red-700 text-[9px] text-white truncate flex justify-between items-center cursor-pointer hover:bg-red-600 transition-colors" title={`${hour}:{min} - ${endH}:{endM} 🔒 ${ev.block_reason}`}>
                            <span className="truncate"><span className="font-bold">{hour}:{min}-{endH}:{endM}</span> 🔒 {ev.block_reason}</span>
                          </div>
                        );
                        
                        if (ev.is_reminder_event) return (
                          <div key={`rem-${ev.id}`} onClick={(e) => { e.stopPropagation(); handleSendReminderWhatsApp(ev); }} className={`p-1 rounded border text-[9px] cursor-pointer transition-all flex flex-col bg-indigo-50 border-indigo-200 text-indigo-900 font-bold hover:bg-indigo-100 ${ev.is_recurring ? 'animate-pulse hover:animate-none' : ''}`} title={`Retorno: ${ev.clients?.name}`}>
                             <div className="flex items-center justify-between w-full min-w-0">
                               <span className="truncate flex items-center">
                                 <CalendarHeart size={8} className="mr-0.5 text-indigo-500 shrink-0"/>
                                 {ev.is_recurring && <Repeat size={8} className="mr-0.5 text-indigo-500 shrink-0"><title>Recorrente Mensal</title></Repeat>}{ev.pacote_item_id && <Package size={8} className="mr-0.5 text-violet-600 shrink-0"><title>Sessão de pacote</title></Package>}
                                 <span className="truncate">{ev.clients?.name}</span>
                               </span>
                               <div className="flex items-center shrink-0 ml-1 gap-0.5">
                                 {ev.return_reminder_sent_at && <CheckCircle size={8} className="text-emerald-600"><title>{`Chamou às ${new Date(ev.return_reminder_sent_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`}</title></CheckCircle>}
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
                              {ev.whatsapp_sent_at && <CheckCircle size={8} className="text-emerald-600 shrink-0"><title>{`Chamou às ${new Date(ev.whatsapp_sent_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`}</title></CheckCircle>}
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
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
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
              {agendaOutras && (
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Profissional</label>
                  <select value={blockProf} onChange={(e) => setBlockProf(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-slate-500 text-sm bg-white">
                    <option value="">Salão (sem profissional)</option>
                    {equipe.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Motivo / Descrição</label><input type="text" required value={blockReason} onChange={(e) => setBlockReason(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-slate-500" placeholder="Ex: Almoço, Limpeza, Médico..." /></div>
              {!editingBlock && (
                <div className="space-y-2">
                  <div><label className="block text-xs font-bold text-slate-500 mb-1">Repetir</label>
                    <select value={blockRepeticao} onChange={(e) => setBlockRepeticao(e.target.value as RepeticaoBloqueio)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-slate-500 text-sm bg-white">
                      <option value="nao">Não repetir</option>
                      <option value="diaria">Todos os dias</option>
                      <option value="semanal">Toda semana ({new Date(`${blockDate}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' })})</option>
                      <option value="mensal">Todo mês (dia {blockDate.slice(8, 10)})</option>
                    </select>
                  </div>
                  {blockRepeticao !== 'nao' && (() => {
                    const previa = datasDoBloqueio(blockDate, blockRepeticao, blockTermino === 'data' ? { tipo: 'data', ate: blockAte } : { tipo: 'vezes', vezes: Number(blockVezes) });
                    return (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
                        <span className="block text-xs font-bold text-slate-500">Termina</span>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input type="radio" name="termino" checked={blockTermino === 'data'} onChange={() => setBlockTermino('data')} className="accent-slate-700" /> Em
                          <input type="date" value={blockAte} min={blockDate} onChange={(e) => { setBlockAte(e.target.value); setBlockTermino('data'); }} className="flex-1 border bg-white p-1.5 rounded-lg outline-none focus:ring-2 focus:ring-slate-500 text-sm" />
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input type="radio" name="termino" checked={blockTermino === 'vezes'} onChange={() => setBlockTermino('vezes')} className="accent-slate-700" /> Após
                          <input type="text" inputMode="numeric" value={blockVezes} onChange={(e) => { setBlockVezes(e.target.value.replace(/\D/g, '').slice(0, 3)); setBlockTermino('vezes'); }} className="w-16 border bg-white p-1.5 rounded-lg outline-none focus:ring-2 focus:ring-slate-500 text-sm text-center" /> vezes
                        </label>
                        <p className={`text-[11px] ${typeof previa === 'string' ? 'text-amber-700' : 'text-slate-500'}`}>
                          {typeof previa === 'string' ? previa : `Serão criados ${previa.length} bloqueios, de ${isoParaBR(previa[0])} a ${isoParaBR(previa[previa.length - 1])} (máximo ${BLOQUEIO_MAX_REPETICOES}).`}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
              {editingBlock?.is_recurring && <p className="text-[11px] text-slate-500 flex items-center gap-1"><Repeat size={12} /> Bloqueio recorrente: a alteração vale só para este dia.</p>}
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
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center"><h3 className="text-xl font-bold text-slate-800">Novo Cadastro</h3><button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button></div>
            
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button type="button" onClick={() => setAppointmentType('appointment')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${appointmentType === 'appointment' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Atendimento</button>
              <button type="button" onClick={() => setAppointmentType('reminder')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${appointmentType === 'reminder' ? 'bg-indigo-600 shadow-sm text-white' : 'text-slate-500 hover:text-slate-700'}`}>Lembrete Manual</button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              {appointmentType === 'reminder' && ehAdmin && (
                <div className="flex bg-indigo-50 p-1 rounded-lg" role="group" aria-label="Lembrete para">
                  <button type="button" onClick={() => setParaGrupo(false)} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1 ${!paraGrupo ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}><User size={12} /> Uma cliente</button>
                  <button type="button" onClick={() => setParaGrupo(true)} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1 ${paraGrupo ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}><Users size={12} /> Um grupo</button>
                </div>
              )}
              {appointmentType === 'reminder' && paraGrupo ? (
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Grupo *</label>
                  <select value={grupoLembrete} onChange={(e) => setGrupoLembrete(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white">
                    <option value="">Selecione</option>
                    {gruposClientes.map((g) => <option key={g.id} value={g.id}>{g.nome} ({qtdNoGrupo(g.id)} cliente{qtdNoGrupo(g.id) === 1 ? '' : 's'})</option>)}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">{gruposClientes.length ? 'Cada cliente do grupo recebe um lembrete nesta data.' : 'Crie grupos em Clientes > Grupos.'}</p>
                </div>
              ) : (
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-500">{showNewClientForm ? 'Nova Cliente' : 'Cliente *'}</label>
                  {!selectedClient && !showNewClientForm && (
                    <button type="button" onClick={openNewClientForm} className="flex items-center gap-1 whitespace-nowrap text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 -my-1 rounded-md transition-colors">
                      <UserPlus size={14} /> Nova cliente
                    </button>
                  )}
                </div>
                {selectedClient ? (
                  <div className="flex items-center justify-between border p-2.5 rounded-lg bg-rose-50 border-rose-200">
                    <div><p className="font-bold text-rose-800 text-sm">{selectedClient.name}</p><p className="text-xs text-rose-600">{selectedClient.phone}</p></div>
                    <button type="button" onClick={() => setSelectedClient(null)} className="text-rose-600 hover:text-rose-800 p-1 bg-rose-100 rounded-md"><X size={16} /></button>
                  </div>
                ) : showNewClientForm ? (
                  // Mini cadastro (não é um <form> para não conflitar com o formulário do agendamento)
                  <div className="border border-rose-200 bg-rose-50/30 rounded-lg p-3 space-y-2.5">
                    <input
                      type="text"
                      autoFocus
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewClient(); } }}
                      placeholder="Nome completo *"
                      className="w-full border bg-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                    />
                    <input
                      type="tel"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(formatPhoneInput(e.target.value))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewClient(); } }}
                      placeholder="WhatsApp (11) 99999-9999"
                      className="w-full border bg-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-xs font-bold text-slate-500 mb-1">Aniversário</label><input type="date" value={newClientBirthday} max={todayStr} onChange={(e) => setNewClientBirthday(e.target.value)} className="w-full border bg-white p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm" /></div>
                      {ehAdmin
                        ? <CampoOrigem origens={origens} valor={newClientOrigem} onChange={setNewClientOrigem} />
                        : <div><label className="block text-xs font-bold text-slate-500 mb-1">Origem</label><select value={newClientOrigem} onChange={(e) => setNewClientOrigem(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm bg-white"><option value="">Não informada</option>{origens.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={closeNewClientForm} className="flex-1 border bg-white py-2 rounded-lg text-slate-500 font-medium text-sm">Voltar à busca</button>
                      <button type="button" onClick={handleSaveNewClient} disabled={addClientMutation.isPending || !newClientName.trim()} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2 rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-1.5">
                        {addClientMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Cadastrar
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">E-mail e observações podem ser completados depois na tela de Clientes.</p>
                  </div>
                ) : (
                  <><div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input type="text" value={clientSearchTerm} onChange={(e) => setClientSearchTerm(e.target.value)} className="w-full border pl-9 pr-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm" placeholder="Digite nome ou telefone..." /></div>
                    {clientSearchTerm.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredSearchClients.map((c: any) => (<div key={c.id} onClick={() => { setSelectedClient(c); setClientSearchTerm(''); }} className="p-3 hover:bg-rose-50 cursor-pointer border-b border-slate-100"><p className="font-bold text-slate-800 text-sm">{c.name}</p><p className="text-xs text-slate-500">{c.phone}</p></div>))}
                        {filteredSearchClients.length === 0 && <div className="px-3 pt-3 pb-1 text-sm text-slate-500 text-center">Nenhuma cliente encontrada.</div>}
                        <button type="button" onClick={openNewClientForm} className="w-full p-3 flex items-center gap-2 text-sm font-bold text-rose-600 hover:bg-rose-50 text-left">
                          <UserPlus size={16} className="shrink-0" /> <span className="truncate">Cadastrar &quot;{clientSearchTerm.trim()}&quot; como nova cliente</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
              )}
              {selectedClient && appointmentType === 'appointment' && saldosCliente.some((l) => l.disponiveis > 0) && (
                <div className="flex flex-wrap gap-1.5 -mt-2" aria-label="Pacotes da cliente">
                  {saldosCliente.filter((l) => l.disponiveis > 0).map((l) => (
                    <span key={l.item_id} className="inline-flex items-center gap-1 text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5">
                      <Package size={11} /> {l.servico_nome}: {l.disponiveis} disponíve{l.disponiveis > 1 ? 'is' : 'l'} · vence {isoParaBR(l.validade)}
                    </span>
                  ))}
                </div>
              )}
              {appointmentType === 'appointment' && itens.length > 0 && (
                <div className="border border-rose-200 rounded-lg overflow-hidden" aria-label="Serviços deste agendamento">
                  <p className="bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800">Serviços deste agendamento ({itens.length})</p>
                  <ul className="divide-y divide-slate-100">
                    {itens.map((it) => (
                      <li key={it.chave} className="flex items-center gap-2 px-3 py-2 text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 truncate">{it.servicoNome}{it.pacoteItemId && <Package size={11} className="inline ml-1 text-violet-600" />}</p>
                          <p className="text-slate-500">{isoParaBR(it.data)} · {it.hora} às {hhmmLocal(fimDoItem(it))} · {nomeProf(it.profissionalId)}{it.valorExibido != null ? ` · ${brl(it.valorExibido)}` : ''}</p>
                        </div>
                        <button type="button" onClick={() => setItens(itens.filter((x) => x.chave !== it.chave))} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" aria-label={`Remover ${it.servicoNome}`}><Trash2 size={14} /></button>
                      </li>
                    ))}
                  </ul>
                  <p className="px-3 pb-2 text-[11px] text-slate-500">Escolha abaixo o próximo serviço ou clique em Salvar para agendar a lista.</p>
                </div>
              )}
              {agendaOutras && (
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Profissional {appointmentType === 'appointment' && '*'}</label>
                  <select value={novoProf} onChange={(e) => { setNovoProf(e.target.value); setNovoServico(''); }} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm bg-white">
                    <option value="">{appointmentType === 'reminder' ? 'Sem profissional' : 'Selecione'}</option>
                    {equipe.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Serviço {appointmentType === 'appointment' && '*'}</label>
                <select value={novoServico} onChange={(e) => { setNovoServico(e.target.value); setNovoValor(''); setUsarPacote(true); }} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm bg-white">
                  <option value="">{appointmentType === 'appointment' && agendaOutras && !novoProf ? 'Escolha o profissional primeiro' : 'Selecione'}</option>
                  {categorias.map((c) => {
                    const daCategoria = ofertas.filter((x) => x.s.categoria_id === c.id);
                    if (!daCategoria.length) return null;
                    return <optgroup key={c.id} label={c.nome}>{daCategoria.map(({ s: sv, c: cond }) => <option key={sv.id} value={sv.id}>{sv.nome} · {brl(cond.valor)} · {duracaoTexto(cond.minutos)}</option>)}</optgroup>;
                  })}
                  <option value="avulso">Outro procedimento (avulso)</option>
                </select>
                {appointmentType === 'appointment' && profAgendamento && ofertas.length === 0 && <p className="text-[11px] text-amber-700 mt-1">Este profissional ainda não tem serviços habilitados (Serviços &gt; Serviços por profissional).</p>}
              </div>
              {itemPacote && (
                <label className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-lg p-2.5 text-xs text-violet-800">
                  <input type="checkbox" checked={usarPacote} onChange={(e) => setUsarPacote(e.target.checked)} className="mt-0.5 w-4 h-4 accent-violet-600" />
                  <span><strong>Usar o pacote "{itemPacote.pacote_nome}"</strong>: {itemPacote.disponiveis} sessão(ões) disponível(is), vence em {isoParaBR(itemPacote.validade)}. A sessão fica reservada e é descontada na conclusão.</span>
                </label>
              )}
              {(novoServico === 'avulso' || (appointmentType === 'reminder' && !novoServico)) && (
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Procedimento *</label><input type="text" required maxLength={120} value={serviceName} onChange={(e) => setServiceName(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {appointmentType === 'appointment' && novoServico === 'avulso' ? (
                  <div><label className="block text-xs font-bold text-slate-500 mb-1">Valor (R$) *</label><input type="text" inputMode="decimal" required value={servicePrice} onChange={(e) => setServicePrice(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>
                ) : appointmentType === 'appointment' && ofertaEscolhida && comPacote ? (
                  <div><span className="block text-xs font-bold text-slate-500 mb-1">Valor</span><p className="p-2.5 text-sm font-bold text-violet-700">Pacote{itemPacote?.valor_sessao != null ? ` (${brl(itemPacote.valor_sessao)})` : ''}</p></div>
                ) : appointmentType === 'appointment' && ofertaEscolhida ? (
                  ehAdmin
                    ? <div><label className="block text-xs font-bold text-slate-500 mb-1">Valor (R$)</label><input type="text" inputMode="decimal" value={novoValor} placeholder={valorParaCampo(ofertaEscolhida.c.valor)} onChange={(e) => setNovoValor(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>
                    : <div><span className="block text-xs font-bold text-slate-500 mb-1">Valor</span><p className="p-2.5 text-sm font-bold text-slate-700">{brl(ofertaEscolhida.c.valor)}</p></div>
                ) : <div />}
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Data *</label><input type="date" required value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm" /></div>
              </div>
              {appointmentType === 'appointment' && novoServico === 'avulso' && (
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Duração (min) *</label><input type="text" inputMode="numeric" value={novaDuracao} onChange={(e) => setNovaDuracao(e.target.value.replace(/\D/g, ''))} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>
              )}
              {appointmentType === 'appointment' && ofertaEscolhida && <p className="text-[11px] text-slate-500 -mt-2">Duração: {duracaoTexto(ofertaEscolhida.c.minutos)}. O horário final é calculado. Pode coincidir com outro atendimento; só o horário bloqueado é recusado.</p>}
              {appointmentType === 'appointment' && (
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={novoConfirmado} onChange={(e) => setNovoConfirmado(e.target.checked)} className="w-4 h-4 accent-emerald-600" /> Já confirmado com a cliente</label>
              )}
              
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Horário *</label><input type="time" required value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500" /></div>

              {appointmentType === 'appointment' && profAgendamento && (
                <div className="border border-slate-200 rounded-lg p-2.5 space-y-2" aria-label="Agenda da profissional no dia">
                  <p className="text-xs font-bold text-slate-600 flex items-center gap-1"><CalendarIcon size={12} /> Agenda de {nomeProf(profAgendamento)} em {isoParaBR(appointmentDate)}</p>
                  {!painelVisivel ? (
                    <p className="text-[11px] text-slate-500">Você não tem acesso à agenda desta profissional; o sistema confere o conflito ao salvar.</p>
                  ) : (
                    <>
                      {agendaDoDia.length === 0
                        ? <p className="text-[11px] text-slate-500">Nenhum atendimento ou bloqueio neste dia.</p>
                        : <ul className="max-h-28 overflow-y-auto space-y-1">
                            {agendaDoDia.map((e) => (
                              <li key={e.id} className={`text-[11px] rounded px-2 py-1 truncate ${e.novo ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>
                                <span className="font-bold">{hhmmLocal(e.inicio)} às {hhmmLocal(e.fim)}</span> {e.rotulo}
                              </li>
                            ))}
                          </ul>}
                      <div>
                        <p className="text-[11px] font-bold text-emerald-700 mb-1">Horários livres (cabem {duracaoTexto(duracaoAtual)}; clique para usar):</p>
                        {livresDoDia.length === 0
                          ? <p className="text-[11px] text-slate-500">Nenhum intervalo livre entre 07:00 e 21:00.</p>
                          : <div className="flex flex-wrap gap-1">
                              {livresDoDia.map((l) => (
                                <button key={l.inicio.getTime()} type="button" onClick={() => setAppointmentTime(hhmmLocal(l.inicio))} className="text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 hover:bg-emerald-100">
                                  {hhmmLocal(l.inicio)} às {hhmmLocal(l.fim)}
                                </button>
                              ))}
                            </div>}
                      </div>
                    </>
                  )}
                </div>
              )}

              {appointmentType === 'appointment' && (
                <button type="button" onClick={adicionarItem} className="w-full flex items-center justify-center gap-1.5 border border-dashed border-rose-300 text-rose-700 hover:bg-rose-50 py-2 rounded-lg text-xs font-bold">
                  <Plus size={14} /> Serviço (adicionar outro serviço, para esta ou outra profissional)
                </button>
              )}
              
              {appointmentType === 'reminder' && (
                <div className="flex items-center space-x-2 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                  <input type="checkbox" id="recurrence" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-indigo-300 focus:ring-indigo-500 cursor-pointer" />
                  <label htmlFor="recurrence" className="text-xs font-bold text-indigo-800 cursor-pointer select-none flex items-center gap-1"><Repeat size={12}/> Repetir todo mês</label>
                </div>
              )}

              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="w-1/2 border p-2.5 rounded-lg text-slate-500 font-medium">Cancelar</button>
                <button type="submit" disabled={addAppointmentMutation.isPending || agendarItensMutation.isPending || lembreteGrupoMutation.isPending || (appointmentType === 'reminder' && paraGrupo ? !grupoLembrete : !selectedClient)} className={`w-1/2 text-white p-2.5 rounded-lg font-bold disabled:opacity-50 transition-colors ${appointmentType === 'reminder' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}>Salvar {appointmentType === 'reminder' ? 'Lembrete' : itens.length ? `(${itens.length + (novoServico ? 1 : 0)} serviços)` : ''}</button>
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
                {editingAppointment.status === 'confirmed' && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold uppercase mt-1 inline-block">Confirmado</span>}
                {veEquipe && <span className="text-[10px] text-slate-500 ml-2">{nomeProf(editingAppointment.professional_id)}</span>}
                {editingAppointment.status === 'cancelled' && <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded font-bold uppercase mt-1 inline-block">Cancelou</span>}
                {editingAppointment.pacote_item_id && <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded font-bold uppercase mt-1 mr-1 inline-flex items-center gap-1"><Package size={10} /> Sessão de pacote</span>}
                {editingAppointment.status === 'no_show' && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold uppercase mt-1 inline-block">Faltou</span>}
              </div>
              <div className="flex items-center space-x-1">
                <button onClick={() => setAppointmentToDelete(editingAppointment)} className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={20} /></button>
                <button onClick={() => setEditingAppointment(null)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
              </div>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Cliente (Somente Leitura)</label><input type="text" disabled value={editingAppointment.clients?.name || ''} className="w-full border bg-slate-100 p-2.5 rounded-lg text-slate-500 cursor-not-allowed font-medium" /></div>
              {agendaOutras && (
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Profissional</label>
                  <select value={editProf} onChange={(e) => setEditProf(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm bg-white">
                    <option value="">Sem profissional</option>
                    {equipe.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div><label className="block text-xs font-bold text-slate-500 mb-1">Procedimento</label><input type="text" required value={editServiceName} disabled={!ehAdmin || !!editingAppointment.servico_id || !editingAppointment.services?.id} onChange={(e) => setEditServiceName(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-slate-100 disabled:text-slate-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Valor (R$)</label><input type="text" inputMode="decimal" required value={editServicePrice} disabled={!ehAdmin || !!editingAppointment.pacote_item_id} onChange={(e) => setEditServicePrice(e.target.value)} className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-slate-100 disabled:text-slate-500" /></div>
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
              {(editingAppointment.status === 'scheduled' || editingAppointment.status === 'confirmed') && (
                <div className="flex gap-2">
                  {editingAppointment.status === 'scheduled' && <button type="button" onClick={() => updateStatusMutation.mutate({id: editingAppointment.id, status: 'confirmed'})} className="flex-1 bg-emerald-50 text-emerald-700 py-2 rounded-lg font-bold text-xs hover:bg-emerald-100 transition-colors shadow-sm">Confirmar</button>}
                  {ehAdmin
                    ? <button type="button" onClick={() => handleSendToCheckout(editingAppointment)} className="flex-1 bg-emerald-50 text-emerald-700 py-2 rounded-lg font-bold text-xs hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1 shadow-sm">🛒 Checkout</button>
                    : <button type="button" onClick={() => updateStatusMutation.mutate({id: editingAppointment.id, status: 'completed'})} className="flex-1 bg-emerald-50 text-emerald-700 py-2 rounded-lg font-bold text-xs hover:bg-emerald-100 transition-colors shadow-sm">Concluir</button>}
                  <button type="button" onClick={() => marcarFalta(editingAppointment)} className="flex-1 bg-amber-50 text-amber-700 py-2 rounded-lg font-bold text-xs hover:bg-amber-100 transition-colors shadow-sm">❌ Faltou</button>
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
              {appointmentToDelete.is_recurring && !appointmentToDelete.is_block && (
                 <span className="block mt-3 text-rose-600 font-bold bg-rose-50 p-2 rounded border border-rose-200 text-xs">Atenção: Isso excluirá este e todos os meses futuros deste lembrete recorrente.</span>
              )}
              {appointmentToDelete.is_recurring && appointmentToDelete.is_block && (
                 <span className="block mt-3 text-slate-600 bg-slate-50 p-2 rounded border border-slate-200 text-xs">Bloqueio recorrente: remova só este dia ou este e os próximos da série.</span>
              )}
            </p>
            {appointmentToDelete.is_recurring && appointmentToDelete.is_block && appointmentToDelete.recurring_group_id ? (
              <div className="space-y-2 pt-4">
                <button onClick={() => deleteAppointmentMutation.mutate({ ...appointmentToDelete, so_este: true })} disabled={deleteAppointmentMutation.isPending} className="w-full border border-red-200 text-red-600 hover:bg-red-50 p-2.5 rounded-lg font-bold">Só este dia</button>
                <button onClick={() => deleteAppointmentMutation.mutate(appointmentToDelete)} disabled={deleteAppointmentMutation.isPending} className="w-full bg-red-600 text-white p-2.5 rounded-lg font-bold">Este e os próximos</button>
                <button onClick={() => setAppointmentToDelete(null)} className="w-full border border-slate-200 bg-slate-50 text-slate-600 p-2.5 rounded-lg font-medium">Voltar</button>
              </div>
            ) : (
            <div className="flex space-x-3 pt-4"><button onClick={() => setAppointmentToDelete(null)} className="w-1/2 border border-slate-200 bg-slate-50 text-slate-600 p-2.5 rounded-lg font-medium">Voltar</button><button onClick={() => deleteAppointmentMutation.mutate(appointmentToDelete)} disabled={deleteAppointmentMutation.isPending} className="w-1/2 bg-red-600 text-white p-2.5 rounded-lg font-bold">Sim, Excluir</button></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}