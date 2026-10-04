import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FileText, HandCoins, Loader2, Lock, MoreVertical, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { Aviso, Campo, Modal, inputCls } from '../components/ui';
import { brl, dataBR, dataHoraBR, dataLocal, isoParaBR, lerValor, mesDe, valorParaCampo } from '../lib/formatos';
import { comissoesKeys, gerarFechamento, lerRegras, listarAtendimentos, listarFechamentos, salvarGorjeta, type Fechamento } from '../features/comissoes/api';
import { ROTULO_STATUS_FECHAMENTO, type StatusFechamento } from '../features/comissoes/logic';
import { montarLinhas, resumoPorProfissional } from '../features/comissoes/relatorio';
import { FechamentoDetalhe, SeloStatus } from '../features/comissoes/FechamentoDetalhe';
import { RelatorioComissoesConteudo } from '../features/comissoes/RelatorioComissoesConteudo';
import { ConfigComissoes } from '../features/comissoes/ConfigComissoes';
import { equipeKeys, listarAtivos } from '../features/equipe/api';

type Aba = 'lancamento' | 'relatorio' | 'config' | 'gorjetas' | 'fechamentos';
const ABAS: [Aba, string][] = [
  ['lancamento', 'Lançamento de Pagamento'], ['relatorio', 'Relatório de Comissões'], ['config', 'Configurações adicionais de comissões'],
  ['gorjetas', 'Gorjetas'], ['fechamentos', 'Fechamento Mensal'],
];

export default function PagamentoProfissionais() {
  const [aba, setAba] = useState<Aba>('lancamento');
  const [aviso, setAviso] = useState<string | null>(null);
  const mes = mesDe(dataLocal());
  const [de, setDe] = useState(mes.inicio);
  const [ate, setAte] = useState(mes.fim);
  const [novo, setNovo] = useState<{ profissional?: string } | null>(null);
  const [aberto, setAberto] = useState<Fechamento | null>(null);

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2"><HandCoins className="text-rose-600" /> Pagamento de profissionais</h2>
          <p className="text-sm text-slate-500 mt-1">Comissões, gorjetas, fechamentos e assinaturas digitais dos profissionais.</p>
        </div>
      </div>
      <div className="flex overflow-x-auto border-b border-slate-200" role="tablist">
        {ABAS.map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={`whitespace-nowrap px-4 py-3 text-sm border-b-2 -mb-px ${aba === id ? 'border-rose-600 text-rose-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{rotulo}</button>
        ))}
      </div>

      {aba === 'lancamento' && <Lancamento de={de} ate={ate} setDe={setDe} setAte={setAte} onNovo={(p) => setNovo({ profissional: p })} />}
      {aba === 'relatorio' && <RelatorioComissoesConteudo />}
      {aba === 'config' && <ConfigComissoes onAviso={setAviso} />}
      {aba === 'gorjetas' && <Gorjetas de={de} ate={ate} setDe={setDe} setAte={setAte} onAviso={setAviso} />}
      {aba === 'fechamentos' && <Fechamentos onAbrir={setAberto} onNovo={() => setNovo({})} />}

      {novo && <NovoFechamento inicial={{ profissional: novo.profissional ?? '', de, ate }} onClose={() => setNovo(null)} onCriado={(f) => { setNovo(null); setAviso('Fechamento gerado. Ele aparece no painel do profissional como "Aguardando conferência".'); setAberto(f); }} />}
      {aberto && <FechamentoDetalhe fechamento={aberto} papel="admin" onClose={() => setAberto(null)} onAviso={setAviso} />}
      <Aviso texto={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}

function Periodo({ de, ate, setDe, setAte }: { de: string; ate: string; setDe: (v: string) => void; setAte: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 font-bold">Ordenado por: Profissional</span>
      <label className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold">
        <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="bg-transparent outline-none" aria-label="Início do período" />
        <span>-</span>
        <input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} className="bg-transparent outline-none" aria-label="Fim do período" />
      </label>
    </div>
  );
}

function Lancamento({ de, ate, setDe, setAte, onNovo }: { de: string; ate: string; setDe: (v: string) => void; setAte: (v: string) => void; onNovo: (profissional?: string) => void }) {
  const atend = useQuery({ queryKey: comissoesKeys.atendimentos({ lanc: true, de, ate }), queryFn: () => listarAtendimentos({ de, ate, status: ['completed'] }) });
  const regras = useQuery({ queryKey: comissoesKeys.regras, queryFn: lerRegras });
  const { data: equipe = [] } = useQuery({ queryKey: equipeKeys.ativos, queryFn: listarAtivos });
  const [menu, setMenu] = useState<string | null>(null);
  const resumo = useMemo(() => {
    const porProf = atend.data && regras.data ? resumoPorProfissional(montarLinhas(atend.data, regras.data)) : [];
    // Profissionais ativos sem atendimento também aparecem (zerados), como na referência.
    const ids = new Set(porProf.map((r) => r.profissional_id));
    const zerados = equipe.filter((p) => !ids.has(p.id)).map((p) => ({ profissional_id: p.id, nome: p.name, qtd: 0, bruto: 0, comissoes: 0, gorjetas: 0, pago: 0, aguardando: 0, restante: 0 }));
    return [...porProf, ...zerados].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [atend.data, regras.data, equipe]);
  const total = resumo.reduce((t, r) => ({ comissoes: t.comissoes + r.comissoes, gorjetas: t.gorjetas + r.gorjetas, pago: t.pago + r.pago, restante: t.restante + r.restante }), { comissoes: 0, gorjetas: 0, pago: 0, restante: 0 });
  const progresso = total.comissoes + total.gorjetas > 0 ? Math.min(100, (total.pago / (total.comissoes + total.gorjetas)) * 100) : 0;

  return (
    <div className="space-y-4">
      <Periodo de={de} ate={ate} setDe={setDe} setAte={setAte} />
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_2fr] md:items-center max-w-4xl mx-auto">
        <div><p className="text-xs text-slate-500">Total em comissões</p><p className="text-lg font-black text-slate-800">{brl(total.comissoes)}</p></div>
        <ArrowRight className="hidden md:block text-slate-400" />
        <div><p className="text-xs text-slate-500">Total em gorjetas</p><p className="text-lg font-black text-slate-800">{brl(total.gorjetas)}</p></div>
        <ArrowRight className="hidden md:block text-slate-400" />
        <div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(progresso)} aria-valuemin={0} aria-valuemax={100} aria-label="Pago do total">
            <div className="h-full bg-emerald-500" style={{ width: `${progresso}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>Total pago<br /><strong className="text-sm text-slate-800">{brl(total.pago)}</strong></span>
            <span className="text-right">Total restante<br /><strong className="text-sm text-slate-800">{brl(total.restante)}</strong></span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={() => onNovo()} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm"><Plus size={16} /> Lançar pagamento</button>
      </div>

      {atend.isLoading || regras.isLoading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-rose-500" size={32} /></div>
        : atend.error ? <p className="text-sm text-rose-600">{mensagemDeErro(atend.error, 'Não foi possível carregar os valores.', 'pagamentos')}</p>
          : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b-2 border-rose-500 text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left">Profissional</th><th className="px-3 py-3 text-right">Valor em comissões</th><th className="px-3 py-3 text-right">Valor em gorjetas</th>
                    <th className="px-3 py-3 text-right">Valor pago</th><th className="px-3 py-3 text-right">Valor restante</th><th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {resumo.map((r, i) => (
                    <tr key={r.profissional_id} className="border-t border-slate-100">
                      <td className="px-4 py-3">{i + 1} - {r.nome}{r.aguardando > 0 && <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">{brl(r.aguardando)} aguardando conferência</span>}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">{brl(r.comissoes)}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">{brl(r.gorjetas)}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">{brl(r.pago)}</td>
                      <td className={`px-3 py-3 text-right whitespace-nowrap font-bold ${r.restante > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{brl(r.restante)}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap relative">
                        <Link to={`/relatorios/comissoes/imprimir?${new URLSearchParams({ de, ate, profissional: r.profissional_id, situacao: 'todas', concluidos: '1' })}`} target="_blank" className="inline-flex p-1.5 text-slate-500 hover:text-rose-600" title="Relatório do profissional" aria-label={`Relatório de ${r.nome}`}><FileText size={18} /></Link>
                        <button type="button" onClick={() => setMenu(menu === r.profissional_id ? null : r.profissional_id)} className="p-1.5 text-slate-500 hover:text-slate-800" aria-label={`Ações de ${r.nome}`} aria-haspopup="menu"><MoreVertical size={18} /></button>
                        {menu === r.profissional_id && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />
                            <div role="menu" className="absolute right-3 top-full z-40 bg-white border border-slate-200 rounded-xl shadow-xl p-1 w-56 text-left">
                              <button type="button" role="menuitem" disabled={r.restante - r.aguardando <= 0} onClick={() => { setMenu(null); onNovo(r.profissional_id); }}
                                className="w-full px-3 py-2 rounded-lg text-sm hover:bg-rose-50 disabled:opacity-40">Gerar fechamento do período</button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </div>
  );
}

function NovoFechamento({ inicial, onClose, onCriado }: { inicial: { profissional: string; de: string; ate: string }; onClose: () => void; onCriado: (f: Fechamento) => void }) {
  const queryClient = useQueryClient();
  const { data: equipe = [] } = useQuery({ queryKey: equipeKeys.ativos, queryFn: listarAtivos });
  const [prof, setProf] = useState(inicial.profissional);
  const [de, setDe] = useState(inicial.de);
  const [ate, setAte] = useState(inicial.ate);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const gerar = useMutation({
    mutationFn: async () => {
      const id = await gerarFechamento(prof, de, ate, obs);
      const lista = await listarFechamentos({ profissionalId: prof });
      return lista.find((f) => f.id === id)!;
    },
    onSuccess: (f) => { queryClient.invalidateQueries({ queryKey: comissoesKeys.base }); onCriado(f); },
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível gerar o fechamento.', 'fechamento.gerar')),
  });
  return (
    <Modal titulo="Lançar pagamento (fechamento de comissões)" onClose={onClose}
      rodape={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 text-sm hover:bg-slate-100">Cancelar</button>
        <button type="button" disabled={gerar.isPending || !prof} onClick={() => gerar.mutate()} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm disabled:opacity-60">{gerar.isPending ? 'Gerando...' : 'Gerar fechamento'}</button></div>}>
      <div className="space-y-4">
        <Campo rotulo="Profissional" obrigatorio>
          <select value={prof} onChange={(e) => setProf(e.target.value)} className={inputCls} autoFocus>
            <option value="">Selecione</option>
            {equipe.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="De" obrigatorio><input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={inputCls} /></Campo>
          <Campo rotulo="Até" obrigatorio><input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} className={inputCls} /></Campo>
        </div>
        <Campo rotulo="Observação"><input value={obs} onChange={(e) => setObs(e.target.value)} className={inputCls} maxLength={1000} placeholder="Ex.: Fechamento de outubro" /></Campo>
        <p className="text-xs text-slate-500">O sistema agrupa os atendimentos <strong>concluídos</strong> do período que ainda não estão em outro fechamento, desconta taxas e materiais conforme as Configurações adicionais e envia para o profissional conferir ("Aguardando conferência").</p>
        {erro && <p role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{erro}</p>}
      </div>
    </Modal>
  );
}

function Gorjetas({ de, ate, setDe, setAte, onAviso }: { de: string; ate: string; setDe: (v: string) => void; setAte: (v: string) => void; onAviso: (t: string) => void }) {
  const queryClient = useQueryClient();
  const { data: lista = [], isLoading } = useQuery({ queryKey: comissoesKeys.atendimentos({ gorj: true, de, ate }), queryFn: () => listarAtendimentos({ de, ate, status: ['completed'] }) });
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const salvar = useMutation({
    mutationFn: ({ id, valor }: { id: string; valor: number }) => salvarGorjeta(id, valor),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: comissoesKeys.base }); onAviso('Gorjeta salva.'); },
    onError: (e) => onAviso(mensagemDeErro(e, 'Não foi possível salvar a gorjeta.', 'gorjeta')),
  });
  const total = lista.reduce((s, a) => s + Number(a.gorjeta ?? 0), 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Periodo de={de} ate={ate} setDe={setDe} setAte={setAte} />
        <p className="text-sm text-slate-600">Total em gorjetas: <strong>{brl(total)}</strong></p>
      </div>
      <p className="text-xs text-slate-500">A gorjeta é repassada integralmente ao profissional no fechamento. Atendimentos já fechados ficam travados.</p>
      {isLoading ? <Loader2 className="animate-spin text-rose-500" /> : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50 text-left">
              <tr><th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Cliente</th><th className="px-3 py-2.5">Profissional</th><th className="px-3 py-2.5">Serviço</th><th className="px-3 py-2.5 text-right">Valor</th><th className="px-3 py-2.5 text-right">Gorjeta</th></tr>
            </thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">Nenhum atendimento concluído no período.</td></tr>}
              {lista.map((a) => {
                const travado = !!a.fechamento;
                const valor = edicao[a.id] ?? valorParaCampo(a.gorjeta ?? 0);
                return (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap">{dataBR(a.start_time)}</td>
                    <td className="px-3 py-2">{a.cliente_nome}</td>
                    <td className="px-3 py-2">{a.profissional_nome}</td>
                    <td className="px-3 py-2">{a.servico_nome}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{brl(a.valor_cobrado)}</td>
                    <td className="px-3 py-2 text-right">
                      {travado ? <span className="inline-flex items-center gap-1 text-slate-500"><Lock size={12} /> {brl(a.gorjeta)}</span> : (
                        <span className="inline-flex items-center gap-1">
                          <input inputMode="decimal" value={valor} onChange={(e) => setEdicao((x) => ({ ...x, [a.id]: e.target.value }))} className="w-20 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm" aria-label={`Gorjeta de ${a.cliente_nome}`} />
                          <button type="button" disabled={valor === valorParaCampo(a.gorjeta ?? 0) || salvar.isPending} onClick={() => {
                            const v = lerValor(valor || '0');
                            if (v === null) return onAviso('Valor de gorjeta inválido.');
                            salvar.mutate({ id: a.id, valor: v });
                          }} className="px-2 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold disabled:opacity-30">Salvar</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Fechamentos({ onAbrir, onNovo }: { onAbrir: (f: Fechamento) => void; onNovo: () => void }) {
  const { perfil } = useAuth();
  const [status, setStatus] = useState<StatusFechamento | ''>('');
  const { data: lista = [], isLoading, error } = useQuery({
    queryKey: comissoesKeys.fechamentos({ admin: true, status }),
    queryFn: () => listarFechamentos(status ? { status: [status] } : {}),
    enabled: perfil?.role === 'admin',
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-bold text-slate-500 flex items-center gap-2">Status
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFechamento | '')} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-normal">
            <option value="">Todos</option>
            {(Object.keys(ROTULO_STATUS_FECHAMENTO) as StatusFechamento[]).map((s) => <option key={s} value={s}>{ROTULO_STATUS_FECHAMENTO[s]}</option>)}
          </select>
        </label>
        <button type="button" onClick={onNovo} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl font-bold text-sm"><Plus size={16} /> Novo fechamento</button>
      </div>
      {isLoading ? <Loader2 className="animate-spin text-rose-500" /> : error ? <p className="text-sm text-rose-600">{mensagemDeErro(error, 'Não foi possível carregar os fechamentos.', 'fechamentos')}</p> : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50 text-left">
              <tr><th className="px-3 py-2.5">Profissional</th><th className="px-3 py-2.5">Período</th><th className="px-3 py-2.5 text-right">Atend.</th><th className="px-3 py-2.5 text-right">Total a pagar</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Assinatura</th></tr>
            </thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">Nenhum fechamento.</td></tr>}
              {lista.map((f) => (
                <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => onAbrir(f)}>
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{f.profissional_nome}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{isoParaBR(f.periodo_inicio)} a {isoParaBR(f.periodo_fim)}</td>
                  <td className="px-3 py-2.5 text-right">{f.qtd_atendimentos}</td>
                  <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">{brl(f.total_a_pagar)}</td>
                  <td className="px-3 py-2.5"><SeloStatus status={f.status} /></td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{f.assinado_em ? dataHoraBR(f.assinado_em) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
