import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, FileSignature, Loader2, Printer, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Campo, Modal, inputCls } from '../../components/ui';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { brl, dataBR, dataHoraBR, isoParaBR, pct } from '../../lib/formatos';
import { assinarFechamento, cancelarFechamento, comissoesKeys, contestarFechamento, listarItens, verificarFechamento, type Fechamento } from './api';
import { COR_STATUS_FECHAMENTO, ROTULO_FORMA, ROTULO_STATUS_FECHAMENTO, type FormaPagamento } from './logic';

export function SeloStatus({ status }: { status: Fechamento['status'] }) {
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${COR_STATUS_FECHAMENTO[status]}`}>{ROTULO_STATUS_FECHAMENTO[status]}</span>;
}

/**
 * Detalhe do fechamento. Profissional: "Conferido e Aceito" (assinatura digital) ou
 * "Contestar". Administradora: cancelar (com motivo) e conferir a integridade.
 */
export function FechamentoDetalhe({ fechamento, papel, onClose, onAviso }: {
  fechamento: Fechamento; papel: 'admin' | 'professional'; onClose: () => void; onAviso: (t: string) => void;
}) {
  const queryClient = useQueryClient();
  const [modo, setModo] = useState<'ver' | 'contestar' | 'cancelar' | 'confirmar'>('ver');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const { data: itens = [], isLoading } = useQuery({ queryKey: comissoesKeys.itens(fechamento.id), queryFn: () => listarItens(fechamento.id) });
  const { data: integro, refetch: conferir, isFetching: conferindo } = useQuery({
    queryKey: ['comissoes', 'verificar', fechamento.id, fechamento.assinatura_hash],
    queryFn: () => verificarFechamento(fechamento.id),
    enabled: !!fechamento.assinatura_hash,
  });

  const depois = (msg: string) => {
    queryClient.invalidateQueries({ queryKey: comissoesKeys.base });
    onAviso(msg);
    onClose();
  };
  const assinar = useMutation({
    mutationFn: () => assinarFechamento(fechamento.id),
    onSuccess: () => depois('Fechamento conferido e aceito. A assinatura digital foi registrada.'),
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível assinar.', 'fechamento.assinar')),
  });
  const contestar = useMutation({
    mutationFn: () => contestarFechamento(fechamento.id, motivo),
    onSuccess: () => depois('Contestação enviada para a administradora.'),
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível contestar.', 'fechamento.contestar')),
  });
  const cancelar = useMutation({
    mutationFn: () => cancelarFechamento(fechamento.id, motivo),
    onSuccess: () => depois('Fechamento cancelado. Os atendimentos voltam a ficar em aberto.'),
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível cancelar.', 'fechamento.cancelar')),
  });

  const aguardando = fechamento.status === 'aguardando_conferencia';
  const podeAssinar = papel === 'professional' && aguardando;
  const podeCancelar = papel === 'admin' && (aguardando || fechamento.status === 'contestado');
  const imprimir = `/relatorios/comissoes/imprimir?fechamento=${fechamento.id}`;

  const rodape = (
    <div className="flex flex-wrap justify-end gap-2">
      <a href={imprimir} target="_blank" rel="noopener" className="mr-auto flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50"><Printer size={16} /> PDF</a>
      {modo === 'ver' && podeCancelar && <button type="button" onClick={() => { setModo('cancelar'); setErro(null); }} className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50">Cancelar fechamento</button>}
      {modo === 'ver' && podeAssinar && <button type="button" onClick={() => { setModo('contestar'); setErro(null); }} className="px-4 py-2 rounded-lg border border-orange-200 text-orange-700 text-sm font-bold hover:bg-orange-50">Contestar</button>}
      {modo === 'ver' && podeAssinar && <button type="button" onClick={() => { setModo('confirmar'); setErro(null); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"><FileSignature size={16} /> Conferido e Aceito</button>}
      {modo !== 'ver' && <button type="button" onClick={() => { setModo('ver'); setErro(null); setMotivo(''); }} className="px-4 py-2 rounded-lg text-slate-600 text-sm hover:bg-slate-100">Voltar</button>}
      {modo === 'confirmar' && <button type="button" disabled={assinar.isPending} onClick={() => assinar.mutate()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-60"><FileSignature size={16} /> {assinar.isPending ? 'Assinando...' : 'Assinar agora'}</button>}
      {modo === 'contestar' && <button type="button" disabled={contestar.isPending} onClick={() => motivo.trim().length < 5 ? setErro('Explique o motivo (mínimo de 5 caracteres).') : contestar.mutate()} className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-bold disabled:opacity-60">Enviar contestação</button>}
      {modo === 'cancelar' && <button type="button" disabled={cancelar.isPending} onClick={() => motivo.trim().length < 5 ? setErro('Informe o motivo (mínimo de 5 caracteres).') : cancelar.mutate()} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-60">Confirmar cancelamento</button>}
    </div>
  );

  return (
    <Modal titulo={`Fechamento ${isoParaBR(fechamento.periodo_inicio)} a ${isoParaBR(fechamento.periodo_fim)}`} onClose={onClose} largura="md:max-w-[960px]" rodape={rodape}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeloStatus status={fechamento.status} />
          <span className="text-sm text-slate-600 font-semibold">{fechamento.profissional_nome}</span>
          <span className="text-xs text-slate-400">gerado em {dataHoraBR(fechamento.created_at)}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {[
            ['Atendimentos', String(fechamento.qtd_atendimentos)], ['Valor bruto', brl(fechamento.total_bruto)],
            ['Taxas', `- ${brl(fechamento.total_taxas)}`], ['Materiais', `- ${brl(fechamento.total_materiais)}`],
            ['Comissão', brl(fechamento.total_comissao)], ['Gorjetas', brl(fechamento.total_gorjetas)],
          ].map(([r, v]) => (
            <div key={r} className="bg-slate-50 rounded-xl px-3 py-2"><p className="text-[11px] text-slate-500">{r}</p><p className="text-sm font-bold text-slate-800">{v}</p></div>
          ))}
        </div>
        <div className="flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
          <span className="text-sm font-bold text-rose-800">Total a receber</span>
          <span className="text-xl font-black text-rose-700">{brl(fechamento.total_a_pagar)}</span>
        </div>
        <p className="text-[11px] text-slate-500">
          Regras usadas: {fechamento.descontou_taxa ? 'taxa da forma de pagamento descontada' : 'sem desconto de taxa'}; {fechamento.descontou_material ? 'custo de material descontado' : 'sem desconto de material'}. Gorjeta é repassada integralmente.
          {fechamento.observacao && <> Observação: {fechamento.observacao}</>}
        </p>

        {fechamento.status === 'contestado' && fechamento.contestacao && (
          <p className="text-sm bg-orange-50 border border-orange-100 text-orange-800 rounded-xl px-3 py-2"><strong>Contestação:</strong> {fechamento.contestacao}</p>
        )}
        {fechamento.status === 'cancelado' && fechamento.cancelamento_motivo && (
          <p className="text-sm bg-slate-100 text-slate-700 rounded-xl px-3 py-2"><strong>Cancelado:</strong> {fechamento.cancelamento_motivo}</p>
        )}

        {fechamento.assinatura_hash && (
          <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-3 space-y-1">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-800"><BadgeCheck size={18} /> Assinatura digital</p>
            <p className="text-xs text-slate-600">Assinado em {dataHoraBR(fechamento.assinado_em!)} · IP {fechamento.assinado_ip}</p>
            <p className="text-[11px] text-slate-500 break-all font-mono">SHA-256: {fechamento.assinatura_hash}</p>
            <div className="flex items-center gap-2 pt-1">
              {conferindo ? <Loader2 size={14} className="animate-spin text-slate-400" />
                : integro ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-700"><ShieldCheck size={14} /> Íntegro: itens e valores conferem com a assinatura</span>
                  : <span className="flex items-center gap-1 text-xs font-bold text-red-700"><ShieldAlert size={14} /> Divergência: os dados não conferem com a assinatura</span>}
              <button type="button" onClick={() => conferir()} className="text-xs text-slate-500 underline">conferir de novo</button>
            </div>
          </div>
        )}

        {modo === 'confirmar' && (
          <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 text-sm text-emerald-900 space-y-1">
            <p className="font-bold">Ao assinar você declara que conferiu os atendimentos e concorda com o total de {brl(fechamento.total_a_pagar)}.</p>
            <p className="text-xs">Serão registrados o seu usuário, a data e hora, o IP e o navegador, e um código (hash SHA-256) que comprova que os valores não foram alterados depois.</p>
          </div>
        )}
        {(modo === 'contestar' || modo === 'cancelar') && (
          <Campo rotulo={modo === 'contestar' ? 'O que está errado?' : 'Motivo do cancelamento'} obrigatorio>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${inputCls} min-h-[80px]`} maxLength={1000} autoFocus />
          </Campo>
        )}
        {erro && <p role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{erro}</p>}

        {isLoading ? <Loader2 className="animate-spin text-rose-500" /> : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2">Data</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Serviço</th><th className="px-3 py-2">Pagto</th>
                  <th className="px-3 py-2 text-right">Bruto</th><th className="px-3 py-2 text-right">Descontos</th><th className="px-3 py-2 text-right">% Com.</th>
                  <th className="px-3 py-2 text-right">Comissão</th><th className="px-3 py-2 text-right">Gorjeta</th><th className="px-3 py-2 text-right">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap">{dataBR(i.data_atendimento)}</td>
                    <td className="px-3 py-2">{i.cliente_nome}</td>
                    <td className="px-3 py-2">{i.servico_nome}</td>
                    <td className="px-3 py-2">{i.forma_pagamento ? ROTULO_FORMA[i.forma_pagamento as FormaPagamento] ?? i.forma_pagamento : '-'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{brl(i.valor_bruto)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-slate-500">{Number(i.valor_taxa) + Number(i.custo_material) > 0 ? `- ${brl(Number(i.valor_taxa) + Number(i.custo_material))}` : '-'}</td>
                    <td className="px-3 py-2 text-right">{pct(i.comissao_percentual)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{brl(i.valor_comissao)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{Number(i.gorjeta) ? brl(i.gorjeta) : '-'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-bold">{brl(i.valor_liquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
