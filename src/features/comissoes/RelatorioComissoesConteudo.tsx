import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Filter, Loader2, Printer } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { brl, dataBR, dataLocal, mesDe, pct } from '../../lib/formatos';
import { equipeKeys, listarAtivos } from '../equipe/api';
import { comissoesKeys, lerRegras, listarAtendimentos } from './api';
import { ROTULO_FORMA, ROTULO_STATUS_AGENDAMENTO, somar, type FormaPagamento } from './logic';
import { ROTULO_SITUACAO, gerarCsv, montarLinhas, type SituacaoPagamento } from './relatorio';

/** Filtros usados também pela página de impressão (vão na URL). */
export type FiltrosRelatorio = { de: string; ate: string; profissional: string; situacao: SituacaoPagamento | 'todas'; somenteConcluidos: boolean };

export function filtrosPadrao(): FiltrosRelatorio {
  const { inicio, fim } = mesDe(dataLocal());
  return { de: inicio, ate: fim, profissional: '', situacao: 'todas', somenteConcluidos: true };
}

export function useLinhasRelatorio(f: FiltrosRelatorio, profissionalFixo: string | null) {
  const profissionalId = profissionalFixo ?? (f.profissional || null);
  const atend = useQuery({
    queryKey: comissoesKeys.atendimentos({ rel: true, de: f.de, ate: f.ate, profissionalId, concl: f.somenteConcluidos }),
    queryFn: () => listarAtendimentos({ de: f.de, ate: f.ate, profissionalId, status: f.somenteConcluidos ? ['completed'] : undefined }),
  });
  const regras = useQuery({ queryKey: comissoesKeys.regras, queryFn: lerRegras });
  const linhas = useMemo(() => {
    if (!atend.data || !regras.data) return [];
    const todas = montarLinhas(atend.data, regras.data);
    return f.situacao === 'todas' ? todas : todas.filter((l) => l.situacao === f.situacao);
  }, [atend.data, regras.data, f.situacao]);
  return { linhas, carregando: atend.isLoading || regras.isLoading, erro: atend.error ?? regras.error };
}

export function RelatorioComissoesConteudo() {
  const { perfil } = useAuth();
  const ehAdmin = perfil?.role === 'admin';
  const [f, setF] = useState<FiltrosRelatorio>(filtrosPadrao);
  const { data: equipe = [] } = useQuery({ queryKey: equipeKeys.ativos, queryFn: listarAtivos, enabled: ehAdmin });
  const { linhas, carregando, erro } = useLinhasRelatorio(f, ehAdmin ? null : perfil?.id ?? null);
  const totais = useMemo(() => somar(linhas.map((l) => ({ ...l.calculo, liquido: l.liquido, comissao: l.liquido - l.calculo.gorjeta }))), [linhas]);
  const set = <K extends keyof FiltrosRelatorio>(k: K, v: FiltrosRelatorio[K]) => setF((x) => ({ ...x, [k]: v }));

  const urlPdf = `/relatorios/comissoes/imprimir?${new URLSearchParams({ de: f.de, ate: f.ate, profissional: ehAdmin ? f.profissional : '', situacao: f.situacao, concluidos: f.somenteConcluidos ? '1' : '0' })}`;
  const exportar = () => {
    const blob = new Blob([gerarCsv(linhas, ehAdmin, (iso) => dataBR(iso))], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `comissoes_${f.de}_a_${f.ate}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 grid gap-3 md:grid-cols-[auto_auto_1fr_1fr_auto] md:items-end">
        <label className="text-xs font-bold text-slate-500">De
          <input type="date" value={f.de} onChange={(e) => set('de', e.target.value)} className="mt-1 block w-full border border-slate-200 rounded-lg px-2 py-2 text-sm" />
        </label>
        <label className="text-xs font-bold text-slate-500">Até
          <input type="date" value={f.ate} min={f.de} onChange={(e) => set('ate', e.target.value)} className="mt-1 block w-full border border-slate-200 rounded-lg px-2 py-2 text-sm" />
        </label>
        {ehAdmin ? (
          <label className="text-xs font-bold text-slate-500">Profissional
            <select value={f.profissional} onChange={(e) => set('profissional', e.target.value)} className="mt-1 block w-full border border-slate-200 rounded-lg px-2 py-2 text-sm">
              <option value="">Todos</option>
              {equipe.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        ) : <div />}
        <label className="text-xs font-bold text-slate-500">Status de pagamento
          <select value={f.situacao} onChange={(e) => set('situacao', e.target.value as FiltrosRelatorio['situacao'])} className="mt-1 block w-full border border-slate-200 rounded-lg px-2 py-2 text-sm">
            <option value="todas">Todos</option>
            {(Object.keys(ROTULO_SITUACAO) as SituacaoPagamento[]).map((s) => <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 pb-2">
          <input type="checkbox" checked={f.somenteConcluidos} onChange={(e) => set('somenteConcluidos', e.target.checked)} className="w-4 h-4 accent-rose-600" /> Só concluídos
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 flex items-center gap-1"><Filter size={12} /> {linhas.length} atendimento(s). Valores em aberto são prévia pelas regras atuais; os fechados vêm do fechamento.</p>
        <div className="flex gap-2">
          <button type="button" onClick={exportar} disabled={!linhas.length} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"><Download size={16} /> Exportar CSV</button>
          <a href={urlPdf} target="_blank" rel="noopener" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold"><Printer size={16} /> Gerar PDF</a>
        </div>
      </div>

      {erro ? <p className="text-sm text-rose-600">{mensagemDeErro(erro, 'Não foi possível carregar o relatório.', 'relatorio.comissoes')}</p>
        : carregando ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-rose-500" size={32} /></div>
          : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Cliente</th><th className="px-3 py-2.5">Serviço</th>
                    {ehAdmin && <th className="px-3 py-2.5">Profissional</th>}
                    <th className="px-3 py-2.5">Pagto</th><th className="px-3 py-2.5 text-right">Valor bruto</th><th className="px-3 py-2.5 text-right">% Comissão</th>
                    <th className="px-3 py-2.5 text-right">Valor líquido</th><th className="px-3 py-2.5">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">Nenhum atendimento com estes filtros.</td></tr>}
                  {linhas.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap">{dataBR(l.start_time)}</td>
                      <td className="px-3 py-2">{l.cliente_nome}</td>
                      <td className="px-3 py-2">{l.servico_nome}{l.status !== 'completed' && <span className="ml-1 text-[10px] text-slate-400">({ROTULO_STATUS_AGENDAMENTO[l.status]})</span>}</td>
                      {ehAdmin && <td className="px-3 py-2">{l.profissional_nome}</td>}
                      <td className="px-3 py-2">{l.payment_method ? ROTULO_FORMA[l.payment_method as FormaPagamento] ?? l.payment_method : '-'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{brl(l.calculo.bruto)}</td>
                      <td className="px-3 py-2 text-right">{pct(l.calculo.comissaoPercentual)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-bold">{brl(l.liquido)}</td>
                      <td className="px-3 py-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${l.situacao === 'assinado_pago' ? 'bg-emerald-100 text-emerald-800' : l.situacao === 'aberto' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>{ROTULO_SITUACAO[l.situacao]}</span></td>
                    </tr>
                  ))}
                </tbody>
                {linhas.length > 0 && (
                  <tfoot className="bg-slate-50 font-bold text-slate-800">
                    <tr>
                      <td className="px-3 py-2.5" colSpan={ehAdmin ? 5 : 4}>Total ({totais.qtd})</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{brl(totais.bruto)}</td>
                      <td />
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{brl(totais.liquido)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
    </div>
  );
}
