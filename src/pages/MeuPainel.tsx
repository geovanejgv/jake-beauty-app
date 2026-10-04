import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CircleDollarSign, FileSignature, Loader2, Radio, TrendingUp, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { Aviso } from '../components/ui';
import { brl, dataLocal, horaBR, isoParaBR, mesDe } from '../lib/formatos';
import { comissoesKeys, listarAtendimentos, listarFechamentos, type Fechamento } from '../features/comissoes/api';
import { ROTULO_STATUS_AGENDAMENTO, painelProfissional } from '../features/comissoes/logic';
import { FechamentoDetalhe, SeloStatus } from '../features/comissoes/FechamentoDetalhe';

type Periodo = 'hoje' | 'semana' | 'mes' | 'personalizado';

function periodoDatas(p: Periodo, hoje: string, de: string, ate: string): { de: string; ate: string } {
  if (p === 'hoje') return { de: hoje, ate: hoje };
  if (p === 'mes') return { de: mesDe(hoje).inicio, ate: mesDe(hoje).fim };
  if (p === 'semana') {
    const d = new Date(`${hoje}T12:00:00Z`);
    const dia = d.getUTCDay() || 7;
    const ini = new Date(d); ini.setUTCDate(d.getUTCDate() - dia + 1);
    const fim = new Date(ini); fim.setUTCDate(ini.getUTCDate() + 6);
    return { de: ini.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10) };
  }
  return { de, ate };
}

export default function MeuPainel() {
  const { perfil } = useAuth();
  const queryClient = useQueryClient();
  const hoje = dataLocal();
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [de, setDe] = useState(mesDe(hoje).inicio);
  const [ate, setAte] = useState(mesDe(hoje).fim);
  const [aberto, setAberto] = useState<Fechamento | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aoVivo, setAoVivo] = useState(false);
  const intervalo = periodoDatas(periodo, hoje, de, ate);
  // Hoje entra sempre (faturamento do dia), mesmo se o período for outro.
  const consulta = { de: intervalo.de < hoje ? intervalo.de : hoje, ate: intervalo.ate > hoje ? intervalo.ate : hoje, profissionalId: perfil?.id };

  const { data: atendimentos = [], isLoading, error } = useQuery({
    queryKey: comissoesKeys.atendimentos({ painel: true, ...consulta }),
    queryFn: () => listarAtendimentos(consulta),
    enabled: !!perfil,
    refetchInterval: 60_000,
  });
  const { data: fechamentos = [] } = useQuery({
    queryKey: comissoesKeys.fechamentos({ profissional: perfil?.id }),
    queryFn: () => listarFechamentos({ profissionalId: perfil!.id }),
    enabled: !!perfil,
    refetchInterval: 60_000,
  });

  // Tempo real: qualquer mudança nos próprios atendimentos ou fechamentos atualiza o painel.
  useEffect(() => {
    if (!perfil) return;
    const canal = supabase
      .channel(`painel-${perfil.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `professional_id=eq.${perfil.id}` },
        () => queryClient.invalidateQueries({ queryKey: comissoesKeys.base }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fechamentos', filter: `profissional_id=eq.${perfil.id}` },
        () => queryClient.invalidateQueries({ queryKey: comissoesKeys.base }))
      .subscribe((status) => setAoVivo(status === 'SUBSCRIBED'));
    return () => { void supabase.removeChannel(canal); };
  }, [perfil, queryClient]);

  const doPeriodo = useMemo(() => atendimentos.filter((a) => {
    const d = dataLocal(a.start_time);
    return d >= intervalo.de && d <= intervalo.ate;
  }), [atendimentos, intervalo.de, intervalo.ate]);
  const paineis = useMemo(() => painelProfissional(atendimentos.filter((a) => dataLocal(a.start_time) === hoje), hoje, (iso) => dataLocal(iso)), [atendimentos, hoje]);
  const doPeriodoResumo = useMemo(() => painelProfissional(doPeriodo, hoje, (iso) => dataLocal(iso)), [doPeriodo, hoje]);
  const proximos = atendimentos.filter((a) => dataLocal(a.start_time) === hoje && (a.status === 'scheduled' || a.status === 'confirmed'));
  const pendentes = fechamentos.filter((f) => f.status === 'aguardando_conferencia');

  if (!perfil) return null;

  const cartoes = [
    { titulo: 'Faturamento do dia', valor: brl(paineis.faturamentoDia), detalhe: `Sua comissão hoje: ${brl(paineis.comissaoDia)}`, icone: CircleDollarSign, cor: 'text-emerald-600 bg-emerald-50' },
    { titulo: 'Projeção de ganhos', valor: brl(doPeriodoResumo.projecaoComissao), detalhe: `${doPeriodoResumo.qtdProjecao} atendimento(s) confirmados ou pendentes (${brl(doPeriodoResumo.projecaoValor)} brutos)`, icone: TrendingUp, cor: 'text-indigo-600 bg-indigo-50' },
    { titulo: 'Realizado no período', valor: brl(doPeriodoResumo.realizadoComissao), detalhe: `Comissão estimada sobre ${brl(doPeriodoResumo.realizadoValor)} concluídos`, icone: Wallet, cor: 'text-rose-600 bg-rose-50' },
    { titulo: 'Atendimentos hoje', valor: String(paineis.atendimentosHoje), detalhe: `${proximos.length} ainda por atender`, icone: CalendarClock, cor: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2"><Wallet className="text-rose-600" /> Meu Painel</h2>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            Olá, {perfil.name.split(' ')[0]}.
            <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${aoVivo ? 'text-emerald-600' : 'text-slate-400'}`}><Radio size={12} /> {aoVivo ? 'atualização em tempo real' : 'atualiza a cada minuto'}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-200 p-0.5 rounded-xl flex" role="tablist" aria-label="Período">
            {([['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['personalizado', 'Período']] as [Periodo, string][]).map(([id, r]) => (
              <button key={id} type="button" role="tab" aria-selected={periodo === id} onClick={() => setPeriodo(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${periodo === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600'}`}>{r}</button>
            ))}
          </div>
          {periodo === 'personalizado' && (
            <div className="flex items-center gap-1 text-xs">
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5" aria-label="De" />
              <span>a</span>
              <input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5" aria-label="Até" />
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-rose-600">{mensagemDeErro(error, 'Não foi possível carregar o painel.', 'painel')}</p>}

      {pendentes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <p className="flex items-center gap-2 font-bold text-amber-900"><FileSignature size={18} /> {pendentes.length} fechamento(s) aguardando a sua conferência</p>
          {pendentes.map((f) => (
            <button key={f.id} type="button" onClick={() => setAberto(f)} className="w-full flex items-center justify-between gap-3 bg-white border border-amber-200 rounded-xl px-3 py-2 text-left hover:bg-amber-50">
              <span className="text-sm text-slate-700">{isoParaBR(f.periodo_inicio)} a {isoParaBR(f.periodo_fim)} · {f.qtd_atendimentos} atendimento(s)</span>
              <span className="text-sm font-black text-slate-800">{brl(f.total_a_pagar)}</span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-rose-500" size={32} /></div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {cartoes.map((c) => (
            <div key={c.titulo} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wide">
                <span className={`p-1.5 rounded-lg ${c.cor}`}><c.icone size={16} /></span> {c.titulo}
              </div>
              <p className="text-2xl font-black text-slate-800 mt-2">{c.valor}</p>
              <p className="text-xs text-slate-500 mt-1">{c.detalhe}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h3 className="font-bold text-slate-800 mb-3">Hoje</h3>
          {atendimentos.filter((a) => dataLocal(a.start_time) === hoje).length === 0 ? <p className="text-sm text-slate-400">Nenhum atendimento hoje.</p> : (
            <ul className="divide-y divide-slate-100">
              {atendimentos.filter((a) => dataLocal(a.start_time) === hoje).map((a) => (
                <li key={a.id} className="py-2 flex items-center gap-3 text-sm">
                  <span className="font-bold text-rose-700 w-12">{horaBR(a.start_time)}</span>
                  <span className="flex-1 min-w-0"><span className="block truncate text-slate-800">{a.cliente_nome}</span><span className="block text-xs text-slate-500 truncate">{a.servico_nome}</span></span>
                  <span className="text-xs text-slate-500">{ROTULO_STATUS_AGENDAMENTO[a.status]}</span>
                  <span className="text-sm font-semibold text-slate-700 w-20 text-right">{brl(a.valor_cobrado)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800">Meus fechamentos</h3>
            <Link to="/relatorios/comissoes" className="text-xs font-bold text-rose-600 hover:underline">Relatório de comissões e PDF</Link>
          </div>
          {fechamentos.length === 0 ? <p className="text-sm text-slate-400">Nenhum fechamento ainda.</p> : (
            <ul className="divide-y divide-slate-100">
              {fechamentos.slice(0, 8).map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => setAberto(f)} className="w-full py-2 flex items-center gap-3 text-left text-sm hover:bg-slate-50 rounded-lg px-1">
                    <span className="flex-1 text-slate-700">{isoParaBR(f.periodo_inicio)} a {isoParaBR(f.periodo_fim)}</span>
                    <SeloStatus status={f.status} />
                    <span className="font-bold text-slate-800 w-24 text-right">{brl(f.total_a_pagar)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {aberto && <FechamentoDetalhe fechamento={aberto} papel="professional" onClose={() => setAberto(null)} onAviso={setAviso} />}
      <Aviso texto={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}
