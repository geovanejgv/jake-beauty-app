import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, Eye, FilePlus2, Link2, Loader2 } from 'lucide-react';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { alertasAnamnese, listarFichasDaCliente, type FichaResumo, type StatusFicha } from './api';
import { validadeDaFicha, type SituacaoValidade } from './logic';
import { ROTULO_TIPO } from './modelos';

const ROTULO_STATUS: Record<StatusFicha, string> = { pendente: 'Aguardando assinatura', assinada: 'Assinado', cancelada: 'Cancelado' };
const COR_VALIDADE: Record<SituacaoValidade, string> = {
  vigente: 'bg-emerald-100 text-emerald-800',
  vence_em_breve: 'bg-amber-100 text-amber-800',
  vencida: 'bg-red-100 text-red-700',
};

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '-');

function rotuloValidade(s: SituacaoValidade, dias: number) {
  return s === 'vigente' ? 'Vigente' : s === 'vence_em_breve' ? `Vence em ${dias} dia(s)` : 'Vencida';
}

function Acoes({ f }: { f: FichaResumo }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <Link to={`/fichas/${f.id}/imprimir`} target="_blank" rel="noopener" className="px-2 py-1 rounded-md border border-slate-200 text-xs text-slate-700 inline-flex items-center gap-1"><Eye size={12} /> Visualizar</Link>
      {f.status === 'assinada' && (
        <Link to={`/fichas/${f.id}/imprimir?baixar=1`} target="_blank" rel="noopener" className="px-2 py-1 rounded-md border border-slate-200 text-xs text-slate-700 inline-flex items-center gap-1"><Download size={12} /> Baixar PDF</Link>
      )}
      {f.status === 'pendente' && (
        <Link to={`/fichas?link=${f.id}`} className="px-2 py-1 rounded-md border border-rose-200 text-xs text-rose-700 inline-flex items-center gap-1"><Link2 size={12} /> Reenviar link</Link>
      )}
    </span>
  );
}

/**
 * Aba "Fichas e termos" da cliente: anamnese vigente com validade e alertas, histórico
 * e termos. A profissional vê só as fichas dela (RLS); visualizar e baixar ficam na trilha.
 */
export function FichasDaCliente({ clienteId }: { clienteId: string }) {
  const { data: fichas = [], isLoading, error } = useQuery({ queryKey: ['fichas', 'cliente', clienteId], queryFn: () => listarFichasDaCliente(clienteId) });
  const { data: alertas = [] } = useQuery({ queryKey: ['fichas', 'alertas', clienteId], queryFn: () => alertasAnamnese([clienteId]) });

  if (isLoading) return <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Carregando...</p>;
  if (error) return <p className="text-sm text-red-600">{mensagemDeErro(error, 'Não foi possível carregar as fichas.', 'fichas_cliente')}</p>;

  const saude = fichas.filter((f) => f.tipo !== 'termo');
  const vigentes = ['anamnese', 'fotodepilacao'].map((tipo) => saude.find((f) => f.tipo === tipo && f.status === 'assinada')).filter((f): f is (typeof saude)[number] => !!f);
  const historico = saude.filter((f) => !vigentes.includes(f));
  const termos = fichas.filter((f) => f.tipo === 'termo');

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-800">Anamnese</h4>
          <span className="flex gap-1.5">
            <Link to={`/fichas?nova=anamnese&cliente=${clienteId}`} className="px-2 py-1 rounded-md bg-rose-600 text-white text-xs font-bold inline-flex items-center gap-1"><FilePlus2 size={12} /> Nova anamnese</Link>
            <Link to={`/fichas?nova=fotodepilacao&cliente=${clienteId}`} className="px-2 py-1 rounded-md border border-slate-200 text-xs text-slate-700">Fotodepilação</Link>
          </span>
        </div>
        {vigentes.length === 0 && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">Sem anamnese assinada. Envie para a cliente preencher antes do procedimento.</p>}
        {vigentes.map((f) => {
          const v = validadeDaFicha(f.assinado_em ?? f.created_at, f.campos.validadeMeses);
          const a = alertas.find((x) => x.ficha_id === f.id);
          return (
            <div key={f.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{ROTULO_TIPO[f.tipo]}</p>
                  <p className="text-xs text-slate-500">Assinada em {data(f.assinado_em)}, válida até {v.validaAte.toLocaleDateString('pt-BR')}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${COR_VALIDADE[v.situacao]}`}>{rotuloValidade(v.situacao, v.dias)}</span>
              </div>
              {a && a.alertas.length > 0 && (
                <ul className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-2 space-y-0.5">
                  {a.alertas.map((t) => <li key={t} className="flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {t}</li>)}
                </ul>
              )}
              <Acoes f={f} />
            </div>
          );
        })}
      </section>

      {historico.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-bold text-slate-800">Histórico de anamneses</h4>
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {historico.map((f) => (
              <li key={f.id} className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{ROTULO_TIPO[f.tipo]} <span className="text-xs text-slate-500">· {ROTULO_STATUS[f.status]} · {data(f.assinado_em ?? f.created_at)}</span></span>
                <Acoes f={f} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-800">Termos</h4>
          <Link to={`/fichas?nova=termo&cliente=${clienteId}`} className="px-2 py-1 rounded-md bg-rose-600 text-white text-xs font-bold inline-flex items-center gap-1"><FilePlus2 size={12} /> Novo termo</Link>
        </div>
        {termos.length === 0 && <p className="text-xs text-slate-500">Nenhum termo.</p>}
        {termos.length > 0 && (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {termos.map((f) => (
              <li key={f.id} className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{f.titulo} <span className="text-xs text-slate-500">· {ROTULO_STATUS[f.status]} · {data(f.assinado_em ?? f.created_at)} · assinatura no celular</span></span>
                <Acoes f={f} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
