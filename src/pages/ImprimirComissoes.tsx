import React, { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { brl, dataBR, dataHoraBR, isoParaBR, pct } from '../lib/formatos';
import { comissoesKeys, listarFechamentos, listarItens } from '../features/comissoes/api';
import { ROTULO_FORMA, ROTULO_STATUS_FECHAMENTO, somar, type FormaPagamento } from '../features/comissoes/logic';
import { ROTULO_SITUACAO, type SituacaoPagamento } from '../features/comissoes/relatorio';
import { filtrosPadrao, useLinhasRelatorio, type FiltrosRelatorio } from '../features/comissoes/RelatorioComissoesConteudo';
import { equipeKeys, listarAtivos } from '../features/equipe/api';

/**
 * Relatório pronto para imprimir ou "Salvar como PDF" pelo navegador (sem biblioteca
 * nova e sem enviar dados para fora). Com ?fechamento=<id>, emite o demonstrativo do
 * fechamento com os dados da assinatura digital.
 */
export default function ImprimirComissoes() {
  const [params] = useSearchParams();
  const fechamentoId = params.get('fechamento');
  // Documento sempre em papel claro, mesmo com o modo escuro ligado.
  useEffect(() => {
    const raiz = document.documentElement;
    const escuro = raiz.classList.contains('dark');
    raiz.classList.remove('dark');
    return () => { if (escuro) raiz.classList.add('dark'); };
  }, []);
  return (
    <div className="min-h-screen bg-white text-slate-900 print:bg-white">
      <div className="max-w-5xl mx-auto p-6 print:p-0">
        {fechamentoId ? <Demonstrativo id={fechamentoId} /> : <Relatorio params={params} />}
      </div>
    </div>
  );
}

function useImprimirAoCarregar(pronto: boolean) {
  const feito = useRef(false);
  useEffect(() => {
    if (!pronto || feito.current) return;
    feito.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [pronto]);
}

function Cabecalho({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <header className="flex items-start justify-between border-b-2 border-rose-600 pb-3 mb-4">
      <div>
        <p className="text-2xl font-black text-rose-600">Jake Beauty</p>
        <h1 className="text-lg font-bold">{titulo}</h1>
        <p className="text-sm text-slate-600">{subtitulo}</p>
      </div>
      <div className="text-right text-xs text-slate-500">
        <p>Emitido em {dataHoraBR(new Date())}</p>
        <button type="button" onClick={() => window.print()} className="print:hidden mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold">
          <Printer size={14} /> Imprimir / Salvar PDF
        </button>
      </div>
    </header>
  );
}

function Relatorio({ params }: { params: URLSearchParams }) {
  const { perfil } = useAuth();
  const ehAdmin = perfil?.role === 'admin';
  const padrao = filtrosPadrao();
  const f: FiltrosRelatorio = {
    de: /^\d{4}-\d{2}-\d{2}$/.test(params.get('de') ?? '') ? params.get('de')! : padrao.de,
    ate: /^\d{4}-\d{2}-\d{2}$/.test(params.get('ate') ?? '') ? params.get('ate')! : padrao.ate,
    profissional: ehAdmin ? (params.get('profissional') ?? '') : '',
    situacao: (['aberto', 'aguardando_conferencia', 'contestado', 'assinado_pago'].includes(params.get('situacao') ?? '') ? params.get('situacao') : 'todas') as FiltrosRelatorio['situacao'],
    somenteConcluidos: params.get('concluidos') !== '0',
  };
  const { linhas, carregando, erro } = useLinhasRelatorio(f, ehAdmin ? null : perfil?.id ?? null);
  const { data: equipe = [] } = useQuery({ queryKey: equipeKeys.ativos, queryFn: listarAtivos });
  const totais = useMemo(() => somar(linhas.map((l) => ({ ...l.calculo, liquido: l.liquido, comissao: l.liquido - l.calculo.gorjeta }))), [linhas]);
  useImprimirAoCarregar(!carregando && !erro);
  const nomeProf = ehAdmin ? (f.profissional ? equipe.find((p) => p.id === f.profissional)?.name ?? 'Profissional' : 'Todos os profissionais') : perfil?.name ?? '';

  if (erro) return <p className="text-rose-600">{mensagemDeErro(erro, 'Não foi possível gerar o relatório.', 'relatorio.imprimir')}</p>;
  if (carregando) return <Loader2 className="animate-spin text-rose-500 mx-auto mt-20" size={32} />;
  return (
    <>
      <Cabecalho titulo="Relatório de Comissões" subtitulo={`${nomeProf} · ${isoParaBR(f.de)} a ${isoParaBR(f.ate)}${f.situacao !== 'todas' ? ` · ${ROTULO_SITUACAO[f.situacao as SituacaoPagamento]}` : ''}`} />
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-400 text-left">
            <th className="py-1.5 pr-2">Data</th><th className="py-1.5 pr-2">Cliente</th><th className="py-1.5 pr-2">Serviço</th>
            {ehAdmin && !f.profissional && <th className="py-1.5 pr-2">Profissional</th>}
            <th className="py-1.5 pr-2">Pagto</th><th className="py-1.5 pr-2 text-right">Valor bruto</th><th className="py-1.5 pr-2 text-right">% Comissão</th><th className="py-1.5 text-right">Valor líquido</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className="border-b border-slate-200 break-inside-avoid">
              <td className="py-1 pr-2 whitespace-nowrap">{dataBR(l.start_time)}</td>
              <td className="py-1 pr-2">{l.cliente_nome}</td>
              <td className="py-1 pr-2">{l.servico_nome}</td>
              {ehAdmin && !f.profissional && <td className="py-1 pr-2">{l.profissional_nome}</td>}
              <td className="py-1 pr-2">{l.payment_method ? ROTULO_FORMA[l.payment_method as FormaPagamento] ?? l.payment_method : '-'}</td>
              <td className="py-1 pr-2 text-right whitespace-nowrap">{brl(l.calculo.bruto)}</td>
              <td className="py-1 pr-2 text-right">{pct(l.calculo.comissaoPercentual)}</td>
              <td className="py-1 text-right whitespace-nowrap font-semibold">{brl(l.liquido)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 ml-auto w-72 text-sm space-y-1">
        <p className="flex justify-between"><span>Atendimentos</span><span>{totais.qtd}</span></p>
        <p className="flex justify-between"><span>Valor bruto</span><span>{brl(totais.bruto)}</span></p>
        <p className="flex justify-between"><span>Gorjetas</span><span>{brl(totais.gorjetas)}</span></p>
        <p className="flex justify-between font-black border-t border-slate-400 pt-1"><span>Valor líquido</span><span>{brl(totais.liquido)}</span></p>
      </div>
      <p className="mt-6 text-[10px] text-slate-500">Valores em aberto são prévia pelas regras atuais de comissão; os já fechados são os gravados no fechamento.</p>
    </>
  );
}

function Demonstrativo({ id }: { id: string }) {
  const { perfil } = useAuth();
  const fech = useQuery({
    queryKey: comissoesKeys.fechamentos({ imprimir: id }),
    queryFn: async () => (await listarFechamentos(perfil?.role === 'admin' ? {} : { profissionalId: perfil!.id })).find((x) => x.id === id) ?? null,
    enabled: !!perfil,
  });
  const itens = useQuery({ queryKey: comissoesKeys.itens(id), queryFn: () => listarItens(id) });
  useImprimirAoCarregar(!!fech.data && !!itens.data);

  if (fech.error || itens.error) return <p className="text-rose-600">{mensagemDeErro(fech.error ?? itens.error, 'Não foi possível gerar o demonstrativo.', 'fechamento.imprimir')}</p>;
  if (fech.isLoading || itens.isLoading) return <Loader2 className="animate-spin text-rose-500 mx-auto mt-20" size={32} />;
  const f = fech.data;
  if (!f) return <p>Fechamento não encontrado.</p>;
  return (
    <>
      <Cabecalho titulo="Demonstrativo de Fechamento de Comissões" subtitulo={`${f.profissional_nome} · ${isoParaBR(f.periodo_inicio)} a ${isoParaBR(f.periodo_fim)} · ${ROTULO_STATUS_FECHAMENTO[f.status]}`} />
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-400 text-left">
            <th className="py-1.5 pr-2">Data</th><th className="py-1.5 pr-2">Cliente</th><th className="py-1.5 pr-2">Serviço</th><th className="py-1.5 pr-2 text-right">Valor bruto</th>
            <th className="py-1.5 pr-2 text-right">Descontos</th><th className="py-1.5 pr-2 text-right">% Com.</th><th className="py-1.5 pr-2 text-right">Gorjeta</th><th className="py-1.5 text-right">Valor líquido</th>
          </tr>
        </thead>
        <tbody>
          {(itens.data ?? []).map((i) => (
            <tr key={i.id} className="border-b border-slate-200 break-inside-avoid">
              <td className="py-1 pr-2 whitespace-nowrap">{dataBR(i.data_atendimento)}</td>
              <td className="py-1 pr-2">{i.cliente_nome}</td>
              <td className="py-1 pr-2">{i.servico_nome}</td>
              <td className="py-1 pr-2 text-right whitespace-nowrap">{brl(i.valor_bruto)}</td>
              <td className="py-1 pr-2 text-right whitespace-nowrap">{brl(Number(i.valor_taxa) + Number(i.custo_material))}</td>
              <td className="py-1 pr-2 text-right">{pct(i.comissao_percentual)}</td>
              <td className="py-1 pr-2 text-right whitespace-nowrap">{brl(i.gorjeta)}</td>
              <td className="py-1 text-right whitespace-nowrap font-semibold">{brl(i.valor_liquido)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 ml-auto w-80 text-sm space-y-1">
        <p className="flex justify-between"><span>Valor bruto</span><span>{brl(f.total_bruto)}</span></p>
        <p className="flex justify-between"><span>Taxas de pagamento</span><span>- {brl(f.total_taxas)}</span></p>
        <p className="flex justify-between"><span>Materiais</span><span>- {brl(f.total_materiais)}</span></p>
        <p className="flex justify-between"><span>Comissão</span><span>{brl(f.total_comissao)}</span></p>
        <p className="flex justify-between"><span>Gorjetas</span><span>{brl(f.total_gorjetas)}</span></p>
        <p className="flex justify-between font-black border-t border-slate-400 pt-1"><span>Total a pagar</span><span>{brl(f.total_a_pagar)}</span></p>
      </div>
      <section className="mt-6 border border-slate-300 rounded p-3 text-xs space-y-1 break-inside-avoid">
        <p className="font-bold text-sm">Assinatura digital</p>
        {f.assinatura_hash ? (
          <>
            <p>Conferido e aceito por {f.profissional_nome} em {dataHoraBR(f.assinado_em!)}, do IP {f.assinado_ip}.</p>
            <p className="break-all font-mono">SHA-256: {f.assinatura_hash}</p>
            <p className="text-slate-500">O código acima é gerado a partir do fechamento, do total, de todos os itens, do usuário, do momento e do IP da assinatura. Qualquer alteração posterior muda o código e é detectada na conferência do sistema.</p>
          </>
        ) : <p>Ainda não assinado ({ROTULO_STATUS_FECHAMENTO[f.status]}).</p>}
      </section>
    </>
  );
}
