import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, CalendarDays, ChevronLeft, ChevronRight, ListTodo, Loader2, Lock, Receipt, User } from 'lucide-react';
import { brl, dataLocal, horaBR, isoParaBR } from '../../lib/formatos';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { equipeKeys, listarAtivos } from '../equipe/api';
import { listarAgendaDoDia, listarPagamentosPendentes, listarTarefasComPrazo, resumoKeys } from './api';
import { nomeDoServico, proximosPagamentos, separarAgenda, somarDias, tarefasDoDia, type EventoDoDia } from './logic';

/** Dias à frente da data escolhida que entram em "Próximos pagamentos". */
const JANELA_PAGAMENTOS = 7;
const MAX_ITENS = 8;

const CRITICIDADE: Record<string, { rotulo: string; cor: string }> = {
  critico: { rotulo: 'Crítico', cor: 'bg-red-100 text-red-700' },
  urgente: { rotulo: 'Urgente', cor: 'bg-amber-100 text-amber-700' },
};

const STATUS_ATENDIMENTO: Record<string, { rotulo: string; cor: string }> = {
  confirmed: { rotulo: 'Confirmado', cor: 'bg-emerald-50 text-emerald-700' },
  completed: { rotulo: 'Concluído', cor: 'bg-slate-100 text-slate-600' },
  scheduled: { rotulo: 'Agendado', cor: 'bg-sky-50 text-sky-700' },
};

function Bloco({ titulo, icone: Icone, cor, link, rotuloLink, contagem, children }: {
  titulo: string; icone: typeof CalendarDays; cor: string; link: string; rotuloLink: string; contagem: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-2 rounded-lg ${cor}`}><Icone size={18} /></div>
          <h3 className="text-base font-bold text-slate-800 truncate">{titulo}</h3>
        </div>
        <span className="text-xs font-bold text-slate-400 shrink-0">{contagem}</span>
      </div>
      <div className="flex-1 space-y-2">{children}</div>
      <Link to={link} className="mt-4 text-xs font-bold text-rose-600 hover:text-rose-700 self-start">{rotuloLink}</Link>
    </section>
  );
}

const Vazio = ({ texto }: { texto: string }) => <p className="text-sm text-slate-400 py-2">{texto}</p>;
const Carregando = () => <div className="flex items-center gap-2 text-sm text-slate-400 py-2"><Loader2 size={16} className="animate-spin" /> Carregando...</div>;
const Falha = ({ erro }: { erro: unknown }) => <p className="text-sm text-red-600 py-2">{mensagemDeErro(erro, 'Não foi possível carregar.', 'resumo')}</p>;
const Mais = ({ total }: { total: number }) => (total > MAX_ITENS ? <p className="text-xs text-slate-400">+ {total - MAX_ITENS} outro(s)</p> : null);

export default function PainelDoDia() {
  const hoje = dataLocal();
  const [dia, setDia] = useState(hoje);
  const limitePagamentos = somarDias(dia, JANELA_PAGAMENTOS);

  const agenda = useQuery({ queryKey: resumoKeys.agenda(dia), queryFn: () => listarAgendaDoDia(dia) });
  const tarefas = useQuery({ queryKey: resumoKeys.tarefas(dia), queryFn: () => listarTarefasComPrazo(dia) });
  const pagamentos = useQuery({ queryKey: resumoKeys.pagamentos(limitePagamentos), queryFn: () => listarPagamentosPendentes(limitePagamentos) });
  const { data: equipe = [] } = useQuery({ queryKey: equipeKeys.ativos, queryFn: listarAtivos });

  const nomes = useMemo(() => new Map(equipe.map((p) => [p.id, p.apelido || p.name])), [equipe]);
  const nomeDe = (id: string | null) => (id ? nomes.get(id) ?? 'Profissional' : 'Todos');

  const ag = useMemo(() => separarAgenda(agenda.data ?? []), [agenda.data]);
  const tf = useMemo(() => tarefasDoDia(tarefas.data ?? [], dia), [tarefas.data, dia]);
  const pg = useMemo(() => proximosPagamentos(pagamentos.data ?? [], dia, limitePagamentos), [pagamentos.data, dia, limitePagamentos]);

  const horario = (e: EventoDoDia) => (e.end_time ? `${horaBR(e.start_time)} - ${horaBR(e.end_time)}` : horaBR(e.start_time));
  const ehHoje = dia === hoje;
  const rotuloDia = ehHoje ? 'hoje' : isoParaBR(dia);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-slate-800">Visão do dia</h3>
          <p className="text-xs text-slate-500">Agenda, tarefas, bloqueios e pagamentos em um só lugar.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDia(somarDias(dia, -1))} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Dia anterior"><ChevronLeft size={16} /></button>
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value || hoje)} className="border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-rose-500 text-sm" aria-label="Data do resumo" />
          <button type="button" onClick={() => setDia(somarDias(dia, 1))} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Próximo dia"><ChevronRight size={16} /></button>
          {!ehHoje && <button type="button" onClick={() => setDia(hoje)} className="text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-lg">Hoje</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Bloco titulo="Atendimentos" icone={CalendarDays} cor="bg-rose-50 text-rose-600" link="/agenda" rotuloLink="Abrir agenda"
          contagem={agenda.isLoading ? '' : `${ag.atendimentos.length} ${rotuloDia}`}>
          {agenda.isLoading ? <Carregando /> : agenda.isError ? <Falha erro={agenda.error} /> : ag.atendimentos.length === 0 ? <Vazio texto={`Nenhum atendimento ${ehHoje ? 'hoje' : 'neste dia'}.`} /> : (
            <>
              {ag.atendimentos.slice(0, MAX_ITENS).map((e) => {
                const st = STATUS_ATENDIMENTO[e.status ?? 'scheduled'] ?? STATUS_ATENDIMENTO.scheduled;
                return (
                  <div key={e.id} className="flex items-start gap-3 p-2 rounded-lg bg-slate-50">
                    <span className="text-xs font-black text-slate-700 tabular-nums w-11 shrink-0 pt-0.5">{horaBR(e.start_time)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{e.clients?.name || 'Cliente'}</p>
                      <p className="text-xs text-slate-500 truncate">{nomeDoServico(e)} · {nomeDe(e.professional_id)}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${st.cor}`}>{st.rotulo}</span>
                  </div>
                );
              })}
              <Mais total={ag.atendimentos.length} />
              {ag.lembretes.length > 0 && (
                <p className="flex items-center gap-1 text-xs text-slate-500 pt-1"><Bell size={12} /> {ag.lembretes.length} lembrete(s) de retorno no dia.</p>
              )}
            </>
          )}
        </Bloco>

        <Bloco titulo="Tarefas" icone={ListTodo} cor="bg-indigo-50 text-indigo-600" link="/tarefas" rotuloLink="Abrir tarefas"
          contagem={tarefas.isLoading ? '' : `${tf.doDia.length} com prazo ${rotuloDia}`}>
          {tarefas.isLoading ? <Carregando /> : tarefas.isError ? <Falha erro={tarefas.error} /> : tf.doDia.length === 0 && tf.atrasadas.length === 0 ? <Vazio texto="Nenhuma tarefa com prazo para o dia." /> : (
            <>
              {tf.doDia.slice(0, MAX_ITENS).map((t) => (
                <div key={t.id} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800 truncate">{t.titulo}</p>
                    <p className="text-xs text-slate-500 truncate flex items-center gap-1"><User size={11} /> {nomeDe(t.responsible_id)}{t.status === 'em_andamento' ? ' · em andamento' : ''}</p>
                  </div>
                  {CRITICIDADE[t.criticidade] && <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${CRITICIDADE[t.criticidade].cor}`}>{CRITICIDADE[t.criticidade].rotulo}</span>}
                </div>
              ))}
              <Mais total={tf.doDia.length} />
              {tf.atrasadas.length > 0 && (
                <div className="pt-2 space-y-1">
                  <p className="flex items-center gap-1 text-xs font-bold text-red-600"><AlertTriangle size={12} /> {tf.atrasadas.length} atrasada(s)</p>
                  {tf.atrasadas.slice(0, 3).map((t) => (
                    <p key={t.id} className="text-xs text-slate-600 truncate">{isoParaBR(t.data_limite).slice(0, 5)} · {t.titulo}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </Bloco>

        <Bloco titulo="Bloqueios de horário" icone={Lock} cor="bg-slate-100 text-slate-600" link="/agenda" rotuloLink="Gerenciar bloqueios"
          contagem={agenda.isLoading ? '' : `${ag.bloqueios.length} ${rotuloDia}`}>
          {agenda.isLoading ? <Carregando /> : agenda.isError ? <Falha erro={agenda.error} /> : ag.bloqueios.length === 0 ? <Vazio texto={`Nenhum horário bloqueado ${ehHoje ? 'hoje' : 'neste dia'}.`} /> : (
            <>
              {ag.bloqueios.slice(0, MAX_ITENS).map((e) => (
                <div key={e.id} className="p-2 rounded-lg bg-slate-50 border-l-4 border-slate-400">
                  <p className="text-xs font-black text-slate-700 tabular-nums">{horario(e)}</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{e.block_reason || 'Horário bloqueado'}</p>
                  <p className="text-xs text-slate-500 truncate">{nomeDe(e.professional_id)}</p>
                </div>
              ))}
              <Mais total={ag.bloqueios.length} />
            </>
          )}
        </Bloco>

        <Bloco titulo="Próximos pagamentos" icone={Receipt} cor="bg-amber-50 text-amber-600" link="/financas" rotuloLink="Abrir finanças"
          contagem={pagamentos.isLoading ? '' : brl(pg.total)}>
          {pagamentos.isLoading ? <Carregando /> : pagamentos.isError ? <Falha erro={pagamentos.error} /> : pg.vencidos.length === 0 && pg.proximos.length === 0 ? <Vazio texto={`Nenhum pagamento pendente até ${isoParaBR(limitePagamentos)}.`} /> : (
            <>
              {pg.vencidos.length > 0 && (
                <p className="flex items-center gap-1 text-xs font-bold text-red-600"><AlertTriangle size={12} /> {pg.vencidos.length} vencido(s) e não pago(s)</p>
              )}
              {[...pg.vencidos, ...pg.proximos].slice(0, MAX_ITENS).map((l) => {
                const vencido = l.data < dia;
                return (
                  <div key={l.id} className={`flex items-center gap-3 p-2 rounded-lg ${vencido ? 'bg-red-50' : 'bg-slate-50'}`}>
                    <span className={`text-xs font-black tabular-nums w-11 shrink-0 ${vencido ? 'text-red-600' : 'text-slate-700'}`}>{isoParaBR(l.data).slice(0, 5)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{l.descricao}</p>
                      <p className="text-[11px] text-slate-500">{l.origem === 'despesas' ? 'Despesa do painel' : l.escopo === 'pessoal' ? 'Finanças · pessoal' : 'Finanças · negócio'}</p>
                    </div>
                    <span className="text-sm font-black text-slate-800 shrink-0">{brl(l.valor)}</span>
                  </div>
                );
              })}
              <Mais total={pg.vencidos.length + pg.proximos.length} />
              <p className="text-[11px] text-slate-400 pt-1">Pendentes até {isoParaBR(limitePagamentos)} ({JANELA_PAGAMENTOS} dias após a data).</p>
            </>
          )}
        </Bloco>
      </div>
    </div>
  );
}
