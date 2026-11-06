import React, { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { ShoppingCart, CalendarHeart, CheckCircle, ArrowLeft, CreditCard, Banknote, Smartphone, Wallet, HandCoins, NotebookPen, Package, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { brl, dataLocal, lerValor, valorParaCampo } from '../lib/formatos';
import { catalogoKeys, listarServicos, listarVinculos } from '../features/catalogo/api';
import { FormServicoExtra } from '../features/agenda/FormServicoExtra';
import { iniciosEmSequencia, ofertasDoProfissional, totalExtras, type ServicoExtra } from '../features/agenda/servicoExtra';
import { comissoesKeys } from '../features/comissoes/api';
import { listarSaldos, pacotesKeys } from '../features/pacotes/api';
import { linkWhatsApp, mensagemBaixa } from '../features/pacotes/logic';
import { equipeKeys, listarAtivos, nomeNaAgenda } from '../features/equipe/api';
import { hhmmLocal } from '../features/agenda/logic';
import { atendimentosDoCheckout, fimDoUltimo, pacotesPorAtendimento, totalCobranca } from '../features/agenda/checkout';

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

const MAX_PARCELAS = 12;

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

  // Recebe da Agenda o atendimento escolhido e os demais em aberto da cliente no mesmo dia.
  const appointment = location.state?.appointment;
  const itens: any[] = useMemo(
    () => (appointment ? atendimentosDoCheckout(appointment, [appointment, ...((location.state?.relacionados as any[]) ?? [])]) : []),
    [appointment, location.state?.relacionados],
  );
  const { data: servicos = [] } = useQuery({ queryKey: catalogoKeys.servicos, queryFn: listarServicos });
  const { data: vinculos = [] } = useQuery({ queryKey: catalogoKeys.vinculos(), queryFn: () => listarVinculos() });
  const { data: equipe = [] } = useQuery({ queryKey: equipeKeys.ativos, queryFn: listarAtivos });
  const nomeProf = (id: string | null | undefined) => { const p = equipe.find((x) => x.id === id); return p ? nomeNaAgenda(p) : 'Sem profissional'; };
  const ofertas = useMemo(() => ofertasDoProfissional(servicos, vinculos, appointment?.professional_id), [servicos, vinculos, appointment?.professional_id]);
  // Serviços feitos a mais no atendimento: viram atendimentos próprios ao concluir.
  const [extras, setExtras] = useState<ServicoExtra[]>([]);
  const criados = useRef(new Map<string, string>()); // chave do extra -> id já criado (nova tentativa não duplica)
  const servico = useMemo(() => servicos.find((s) => s.id === appointment?.servico_id), [servicos, appointment?.servico_id]);

  // Por atendimento: incluir na cobrança, valor (o do agendamento, editável) e se abate do pacote.
  const [linhas, setLinhas] = useState<Record<string, { incluir: boolean; valor: string; pacote: boolean | null }>>(() =>
    Object.fromEntries(itens.map((a) => [a.id, { incluir: true, valor: valorParaCampo(a.services?.price ?? a.valor_cobrado ?? 0), pacote: null }])));
  const linha = (id: string) => linhas[id] ?? { incluir: true, valor: '', pacote: null };
  const mudar = (id: string, x: Partial<{ incluir: boolean; valor: string; pacote: boolean | null }>) => setLinhas((l) => ({ ...l, [id]: { ...linha(id), ...x } }));

  const [paymentMethod, setPaymentMethod] = useState<string>('pix');
  // Crédito: à vista (1x) ou parcelado (2x a 12x).
  const [parcelado, setParcelado] = useState(false);
  const [parcelas, setParcelas] = useState(2);
  const [gorjeta, setGorjeta] = useState('');
  const [returnDate, setReturnDate] = useState(''); // Data do lembrete de retorno
  const [notes, setNotes] = useState('');
  const [tecnico, setTecnico] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<{ mensagem: string; link: string | null } | null>(null);

  // Pacote: o reservado no agendamento ou o do mesmo serviço que vence primeiro (sem repetir sessão).
  const { data: saldos = [] } = useQuery({
    queryKey: pacotesKeys.saldos(appointment?.client_id ?? null, true),
    queryFn: () => listarSaldos(appointment.client_id, true),
    enabled: !!appointment?.client_id,
  });
  const pacotes = useMemo(() => pacotesPorAtendimento(itens, saldos), [itens, saldos]);
  const usaPacote = (id: string) => !!pacotes.get(id) && linha(id).pacote !== false;

  const completeCheckoutMutation = useMutation({
    mutationFn: async () => {
      const g = gorjeta.trim() ? lerValor(gorjeta) : 0;
      if (g === null) throw Object.assign(new Error('GORJETA'), { publico: 'Gorjeta inválida.' });
      const incluidos = itens.filter((a) => a.id === appointment.id || linha(a.id).incluir);
      const valores = new Map<string, number>();
      for (const a of incluidos) {
        if (usaPacote(a.id)) continue;
        const v = lerValor(linha(a.id).valor);
        if (v === null || v > 100000) throw Object.assign(new Error('VALOR'), { publico: `Valor inválido em ${a.services?.name ?? 'atendimento'}.` });
        valores.set(a.id, v);
      }
      const forma = { payment_method: paymentMethod, installments: paymentMethod === 'credito' && parcelado ? parcelas : 1 };
      // Extras: cada um vira um atendimento logo depois do último, já concluído com a mesma forma de pagamento.
      const inicios = iniciosEmSequencia(fimDoUltimo(itens), extras);
      for (const [i, ex] of extras.entries()) {
        let id = criados.current.get(ex.chave);
        if (!id) {
          const { data, error } = await supabase.rpc('agendar_atendimento', {
            p_cliente: appointment.client_id,
            p_profissional: appointment.professional_id,
            p_servico: ex.servicoId,
            p_inicio: inicios[i].toISOString(),
            p_servico_avulso: ex.servicoId ? null : ex.nome,
            p_valor: ex.valor ?? ex.valorExibido,
            p_duracao_minutos: ex.servicoId ? null : ex.minutos,
            p_status: 'confirmed',
            p_observacao: null,
            p_pacote_item: null,
          });
          if (error) throw error;
          id = data as string;
          criados.current.set(ex.chave, id);
        }
        const { error } = await supabase.from('appointments')
          .update({ status: 'completed', ...forma, valor_cobrado: ex.valorExibido, gorjeta: 0 })
          .eq('id', id);
        if (error) throw error;
      }
      // O atendimento escolhido fica por último e leva gorjeta, observação e lembrete de retorno.
      const ordem = [...incluidos.filter((a) => a.id !== appointment.id), appointment];
      for (const a of ordem) {
        const principal = a.id === appointment.id;
        const proprios = principal ? {
          gorjeta: g,
          notes: notes.trim() ? [a.notes, notes.trim()].filter(Boolean).join('\n') : a.notes ?? null,
          return_reminder_date: returnDate || null,
          return_reminder_sent: false,
        } : { gorjeta: 0 };
        const pacote = usaPacote(a.id) ? pacotes.get(a.id)! : null;
        // Pacote: o banco grava valor da sessão, comissão da venda e taxa (gatilho appointments_pacote).
        // Pago à parte: forma, valor e gorjeta alimentam a comissão; reserva de pacote é desfeita e a sessão volta ao saldo.
        const { error } = await supabase.from('appointments')
          .update(pacote
            ? { status: 'completed', pacote_item_id: pacote.item_id, ...proprios }
            : { status: 'completed', ...forma, valor_cobrado: valores.get(a.id), ...proprios, ...(a.pacote_item_id ? { pacote_item_id: null } : {}) })
          .eq('id', a.id);
        if (error) throw error;
      }
      if (tecnico.trim() && appointment.client_id) {
        const { error: e2 } = await supabase.from('cliente_historico').insert([{ cliente_id: appointment.client_id, agendamento_id: appointment.id, tipo: 'tecnico', texto: tecnico.trim() }]);
        if (e2) throw e2;
      }
      return incluidos.filter((a) => usaPacote(a.id)).map((a) => pacotes.get(a.id)!);
    },
    onSuccess: (baixas) => {
      queryClient.invalidateQueries({ queryKey: ['appointments-list'] });
      queryClient.invalidateQueries({ queryKey: comissoesKeys.base });
      queryClient.invalidateQueries({ queryKey: pacotesKeys.base });
      if (baixas.length) {
        // Mesma sessão de pacote usada mais de uma vez: o saldo cai a cada uso.
        const usos = new Map<string, number>();
        const mensagem = baixas.map((p) => {
          const n = (usos.get(p.item_id) ?? 0) + 1;
          usos.set(p.item_id, n);
          return mensagemBaixa({
            cliente: appointment.clients?.name ?? 'cliente', servico: p.servico_nome, pacote: p.pacote_nome,
            restantes: Math.max(p.sessoes - p.usadas - p.faltas - n, 0), validade: p.validade,
          });
        }).join('\n\n');
        setConcluido({ mensagem, link: appointment.clients?.contato_visivel ? linkWhatsApp(appointment.clients?.phone, mensagem) : null });
        return;
      }
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

  if (concluido) {
    return (
      <div className="max-w-xl mx-auto p-6 bg-white rounded-2xl shadow-sm border border-slate-100 space-y-4 text-center">
        <CheckCircle size={40} className="mx-auto text-emerald-600" />
        <h2 className="text-xl font-black text-slate-800">Sessão descontada do pacote</h2>
        <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3 text-left whitespace-pre-line">{concluido.mensagem}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {concluido.link && (
            <a href={concluido.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold">
              <MessageCircle size={18} /> Enviar pelo WhatsApp
            </a>
          )}
          <button type="button" onClick={() => navigate('/agenda')} className="px-5 py-3 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50">Voltar para a agenda</button>
        </div>
        {!concluido.link && <p className="text-xs text-slate-400">Cliente sem WhatsApp válido no cadastro: copie a mensagem acima se quiser enviar por outro meio.</p>}
      </div>
    );
  }

  const gorjetaNum = lerValor(gorjeta || '0') ?? 0;
  const cobrarAgora = totalCobranca(
    itens.map((a) => ({ incluir: a.id === appointment.id || linha(a.id).incluir, pacote: usaPacote(a.id), valor: lerValor(linha(a.id).valor) })),
    totalExtras(extras),
  );
  const pedePagamento = cobrarAgora > 0 || itens.some((a) => (a.id === appointment.id || linha(a.id).incluir) && !usaPacote(a.id)) || extras.length > 0;
  const horario = (a: any) => `${hhmmLocal(new Date(a.start_time))} - ${hhmmLocal(new Date(a.end_time))}`;

  return (
    <div className="w-full space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/agenda')} className="p-2 bg-white rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 shadow-sm" aria-label="Voltar para a agenda"><ArrowLeft size={20} /></button>
        <div>
          <h2 className="text-3xl font-black text-slate-800 flex items-center gap-2"><ShoppingCart size={28} className="text-rose-600" /> Checkout PDV</h2>
          <p className="text-sm text-slate-500 mt-1">Finalização de atendimento, pagamento e agendamento de retorno</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
        {/* Cliente e todos os serviços dela no dia, numa única cobrança */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cliente em Atendimento</p>
            <h3 className="text-xl font-bold text-slate-800">{appointment.clients?.name ?? 'Cliente'}</h3>
            {itens.length > 1 && <p className="text-xs text-slate-500 mt-0.5">{itens.length} serviços agendados hoje. Desmarque o que não for cobrar agora.</p>}
          </div>

          <ul className="space-y-2" aria-label="Serviços da cobrança">
            {itens.map((a) => {
              const principal = a.id === appointment.id;
              const l = linha(a.id);
              const pacote = pacotes.get(a.id);
              const noPacote = usaPacote(a.id);
              const ativo = principal || l.incluir;
              return (
                <li key={a.id} className={`bg-white border rounded-xl p-3 space-y-2 ${ativo ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-60'}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={ativo} disabled={principal} onChange={(e) => mudar(a.id, { incluir: e.target.checked })}
                      aria-label={`Incluir ${a.services?.name ?? 'atendimento'} na cobrança`} className="mt-1 w-4 h-4 accent-rose-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{a.services?.name ?? 'Atendimento'}</p>
                      <p className="text-xs text-slate-500">{horario(a)} · {nomeProf(a.professional_id)}</p>
                    </div>
                    {noPacote
                      ? <span className="shrink-0 text-sm font-bold text-violet-700 flex items-center gap-1"><Package size={14} /> Pacote</span>
                      : <input inputMode="decimal" value={l.valor} disabled={!ativo} onChange={(e) => mudar(a.id, { valor: e.target.value })}
                          aria-label={`Valor de ${a.services?.name ?? 'atendimento'} (R$)`}
                          className="shrink-0 w-28 border border-slate-200 p-2 rounded-lg text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-slate-100" />}
                  </div>
                  {pacote && ativo && (
                    <div className="flex flex-wrap items-center gap-2 pl-7">
                      <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-bold" role="radiogroup" aria-label={`Como cobrar ${a.services?.name ?? 'atendimento'}`}>
                        <button type="button" role="radio" aria-checked={noPacote} onClick={() => mudar(a.id, { pacote: true })} className={`px-2.5 py-1 rounded-md ${noPacote ? 'bg-violet-600 text-white' : 'text-slate-500'}`}>Abater do pacote</button>
                        <button type="button" role="radio" aria-checked={!noPacote} onClick={() => mudar(a.id, { pacote: false })} className={`px-2.5 py-1 rounded-md ${!noPacote ? 'bg-rose-600 text-white' : 'text-slate-500'}`}>Cobrar à parte</button>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        "{pacote.pacote_nome}": restam {pacote.sessoes - pacote.usadas - pacote.faltas} de {pacote.sessoes}, até {pacote.validade.split('-').reverse().join('/')}.
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
            {extras.map((ex) => (
              <li key={ex.chave} className="bg-white border border-rose-100 rounded-xl p-3 flex items-center gap-3">
                <Plus size={16} className="text-rose-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 truncate">{ex.nome}</p>
                  <p className="text-xs text-slate-500">Adicionado agora · {nomeProf(appointment.professional_id)}</p>
                </div>
                <span className="font-bold text-slate-800">{brl(ex.valorExibido)}</span>
                <button type="button" onClick={() => setExtras(extras.filter((x) => x.chave !== ex.chave))}
                  disabled={criados.current.has(ex.chave) || completeCheckoutMutation.isPending} aria-label={`Remover ${ex.nome}`}
                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-40"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>

          <div className="border-t border-slate-200 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><span>Serviços</span><span>{brl(cobrarAgora)}</span></div>
            {gorjetaNum > 0 && <div className="flex justify-between text-slate-600"><span>Gorjeta</span><span>{brl(gorjetaNum)}</span></div>}
            <div className="flex justify-between items-center"><span className="font-bold text-slate-800">Total a cobrar</span><span className="text-2xl font-black text-rose-600">{brl(cobrarAgora + gorjetaNum)}</span></div>
          </div>
        </div>

        {appointment.client_id && appointment.professional_id && (
          <div className="space-y-2">
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Adicionar serviço feito neste atendimento</span>
            <FormServicoExtra ofertas={ofertas} podeDefinirValor rotuloBotao="Adicionar"
              onAdicionar={(ex) => { setExtras((lista) => [...lista, ex]); }} />
            <p className="text-xs text-slate-400">Entra na agenda depois do último serviço do dia, com {nomeProf(appointment.professional_id)}, e é concluído junto, na mesma forma de pagamento.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Forma de Pagamento */}
          {pedePagamento ? (
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
            {paymentMethod === 'credito' && (
              <div className="space-y-2 bg-violet-50/50 border border-violet-200 rounded-xl p-3">
                <div className="flex bg-white border border-violet-100 p-1 rounded-lg" role="radiogroup" aria-label="Crédito à vista ou parcelado">
                  <button type="button" role="radio" aria-checked={!parcelado} onClick={() => setParcelado(false)} className={`flex-1 py-1.5 text-xs font-bold rounded-md ${!parcelado ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500'}`}>À vista</button>
                  <button type="button" role="radio" aria-checked={parcelado} onClick={() => setParcelado(true)} className={`flex-1 py-1.5 text-xs font-bold rounded-md ${parcelado ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500'}`}>Parcelado</button>
                </div>
                {parcelado && (
                  <label className="block text-xs font-bold text-slate-500">Quantidade de parcelas
                    <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} className="mt-1 w-full border border-slate-200 bg-white p-2.5 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-violet-500">
                      {Array.from({ length: MAX_PARCELAS - 1 }, (_, i) => i + 2).map((n) => (
                        <option key={n} value={n}>{n}x{cobrarAgora ? ` de ${brl(cobrarAgora / n)}` : ''}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
          ) : <p className="text-sm text-slate-500 self-center">As sessões já foram pagas na venda do pacote. Só a gorjeta, se houver, é registrada agora.</p>}

          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><HandCoins size={14} className="text-emerald-600" /> Gorjeta (opcional)</label>
            <input inputMode="decimal" value={gorjeta} onChange={(e) => setGorjeta(e.target.value)} placeholder="0,00" aria-label="Gorjeta" className="w-full border border-slate-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm" />
            <p className="text-xs text-slate-400">A gorjeta vai integralmente para {nomeProf(appointment.professional_id)} no fechamento de comissões.</p>
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
