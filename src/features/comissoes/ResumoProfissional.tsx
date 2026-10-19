import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Loader2, Printer } from 'lucide-react';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { brl, dataBR, dataHoraBR, isoParaBR } from '../../lib/formatos';
import { Modal } from '../../components/ui';
import { useLinhasRelatorio } from './RelatorioComissoesConteudo';
import { montarResumoFinanceiro, type ResumoFinanceiro } from './resumoFinanceiro';

/** Linhas do profissional no período: só concluídos, qualquer situação de pagamento. */
export function useResumoFinanceiro(profissionalId: string, de: string, ate: string) {
  const { linhas, carregando, erro } = useLinhasRelatorio({ de, ate, profissional: profissionalId, situacao: 'todas', somenteConcluidos: true }, profissionalId);
  const resumo = useMemo(() => montarResumoFinanceiro(linhas), [linhas]);
  return { resumo, carregando, erro };
}

const semMoeda = (n: number) => brl(n).replace('R$', '').trim();

/** Descritivo das receitas variáveis (tabela do modelo). */
export function TabelaDetalhada({ resumo, impressao = false }: { resumo: ResumoFinanceiro; impressao?: boolean }) {
  const th = impressao ? 'py-1.5 px-1 align-bottom' : 'px-3 py-2.5';
  const td = impressao ? 'py-1 px-1 align-top' : 'px-3 py-2';
  return (
    <table className={`w-full border-collapse ${impressao ? 'text-[11px]' : 'text-sm'}`}>
      <thead className={impressao ? 'border-b border-slate-500' : 'text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50'}>
        <tr className="text-left">
          <th className={th}>Data do atendimento</th><th className={th}>Data do pagamento</th><th className={th}>Cliente</th><th className={th}>Serviço</th>
          <th className={`${th} text-right`}>Valor R$</th><th className={th}>Forma de pagamento</th><th className={`${th} text-right`}>Comissão profissional R$</th>
        </tr>
      </thead>
      <tbody>
        {resumo.itens.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Nenhum atendimento concluído no período.</td></tr>}
        {resumo.itens.map((i) => (
          <tr key={i.id} className="border-b border-slate-200 break-inside-avoid">
            <td className={`${td} whitespace-nowrap`}>{dataBR(i.start_time)}</td>
            <td className={`${td} whitespace-nowrap`}>{dataBR(i.start_time)}</td>
            <td className={td}>{i.cliente}</td>
            <td className={td}>{i.servico}</td>
            <td className={`${td} text-right whitespace-nowrap`}>{semMoeda(i.valor)}</td>
            <td className={td}>{i.forma}</td>
            <td className={`${td} text-right whitespace-nowrap`}>{semMoeda(i.comissao)}</td>
          </tr>
        ))}
      </tbody>
      {resumo.itens.length > 0 && (
        <tfoot className="font-bold">
          <tr><td colSpan={6} className={`${td} text-right`}>Total</td><td className={`${td} text-right whitespace-nowrap`}>{semMoeda(resumo.sobreServicos)}</td></tr>
        </tfoot>
      )}
    </table>
  );
}

/** Quadro "Resumo": recebimentos x descontos e total. */
export function QuadroResumo({ resumo, impressao = false }: { resumo: ResumoFinanceiro; impressao?: boolean }) {
  const linha = (rotulo: string, valor: number, forte = false) => (
    <p className={`flex justify-between gap-4 py-1 ${forte ? 'font-bold border-t border-slate-300' : ''}`}><span>{rotulo}</span><span className="whitespace-nowrap">{brl(valor)}</span></p>
  );
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${impressao ? 'text-xs' : 'text-sm'}`}>
      <div>
        <p className="font-bold text-slate-700 border-b border-slate-400 pb-1 mb-1">Recebimentos</p>
        {linha('Sobre serviços', resumo.sobreServicos)}
        {linha('Sobre produtos vendidos', resumo.sobreProdutos)}
        {linha('Sobre pacotes vendidos', resumo.sobrePacotes)}
        {linha('Recebíveis adicionais (gorjetas)', resumo.recebiveisAdicionais)}
        {linha('Total de recebimentos', resumo.totalRecebimentos, true)}
      </div>
      <div className="flex flex-col">
        <p className="font-bold text-slate-700 border-b border-slate-400 pb-1 mb-1">Descontos</p>
        {linha('Abatimentos adicionais', resumo.abatimentosAdicionais)}
        {linha('Compra/uso de produtos', resumo.usoProdutos)}
        <div className="flex-1" />
        {linha('Total de descontos', resumo.totalDescontos, true)}
        <p className="flex justify-between gap-4 py-1.5 mt-1 font-black text-base border-t-2 border-slate-500"><span>Total</span><span className="whitespace-nowrap">{brl(resumo.total)}</span></p>
      </div>
    </div>
  );
}

/** Documento no modelo "Resumo Financeiro": profissional, período, descritivo (opcional), resumo e assinatura. */
export function DocumentoResumo({ resumo, nome, de, ate, detalhado }: { resumo: ResumoFinanceiro; nome: string; de: string; ate: string; detalhado: boolean }) {
  return (
    <>
      <header className="text-center mb-6">
        <p className="text-lg font-bold">RESUMO FINANCEIRO</p>
        <p className="font-bold uppercase">{nome}</p>
        <p className="text-sm">Período de Pagamento: {isoParaBR(de)} a {isoParaBR(ate)}</p>
      </header>
      {detalhado && (
        <section className="mb-6">
          <p className="font-bold text-sm mb-1">DESCRITIVO DAS RECEITAS VARIÁVEIS NO PERÍODO</p>
          <p className="text-xs mb-1">Sobre Serviços</p>
          <TabelaDetalhada resumo={resumo} impressao />
        </section>
      )}
      <section className="break-inside-avoid">
        <p className="font-bold text-sm mb-1">RESUMO</p>
        <QuadroResumo resumo={resumo} impressao />
      </section>
      <div className="mt-16 w-72 break-inside-avoid">
        <div className="border-t border-slate-800" />
        <p className="text-sm uppercase mt-1">{nome}</p>
      </div>
      <p className="mt-6 text-[10px] text-slate-500">Emitido em {dataHoraBR(new Date())}. Valores em aberto são prévia pelas regras atuais de comissão; os já fechados são os gravados no fechamento.</p>
    </>
  );
}

/**
 * Imprime o documento na própria tela (sem abrir aba): só a área de impressão aparece no papel
 * (regra body.imprimindo em index.css) e o usuário escolhe a impressora ou "Salvar como PDF".
 */
function ImpressaoResumo({ children, onFim }: { children: React.ReactNode; onFim: () => void }) {
  useEffect(() => {
    const fim = () => { document.body.classList.remove('imprimindo'); onFim(); };
    document.body.classList.add('imprimindo');
    window.addEventListener('afterprint', fim, { once: true });
    const t = setTimeout(() => window.print(), 100);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', fim); document.body.classList.remove('imprimindo'); };
  }, [onFim]);
  return createPortal(<div className="area-impressao bg-white text-slate-900">{children}</div>, document.body);
}

/** Janela "Resumo do profissional": total do período, detalhado expansível e impressão (resumida ou detalhada). */
export function ResumoProfissional({ profissionalId, nome, de, ate, onClose }: { profissionalId: string; nome: string; de: string; ate: string; onClose: () => void }) {
  const { resumo, carregando, erro } = useResumoFinanceiro(profissionalId, de, ate);
  const [detalhe, setDetalhe] = useState(false);
  const [menu, setMenu] = useState(false);
  const [imprimir, setImprimir] = useState<'resumido' | 'detalhado' | null>(null);
  const fimImpressao = React.useCallback(() => setImprimir(null), []);
  return (
    <Modal titulo={`Resumo do profissional: ${nome}`} onClose={onClose} largura="md:max-w-[960px]"
      rodape={
        <div className="flex flex-wrap items-center justify-end gap-2 relative">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 text-sm hover:bg-slate-100">Fechar</button>
          <button type="button" disabled={carregando || !!erro} onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold disabled:opacity-60"><Printer size={16} /> Imprimir</button>
          {menu && (
            <div role="menu" className="absolute right-0 bottom-full mb-2 z-10 bg-white border border-slate-200 rounded-xl shadow-xl p-1 w-56">
              <button type="button" role="menuitem" onClick={() => { setMenu(false); setImprimir('resumido'); }} className="block w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-rose-50">Imprimir resumido</button>
              <button type="button" role="menuitem" onClick={() => { setMenu(false); setImprimir('detalhado'); }} className="block w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-rose-50">Imprimir detalhado</button>
            </div>
          )}
        </div>
      }>
      <p className="text-sm text-slate-500 mb-4">Período: <strong className="text-slate-700">{isoParaBR(de)} a {isoParaBR(ate)}</strong> · atendimentos concluídos</p>
      {erro ? <p className="text-sm text-rose-600">{mensagemDeErro(erro, 'Não foi possível carregar o resumo.', 'resumo.profissional')}</p>
        : carregando ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-rose-500" size={32} /></div>
          : (
            <div className="space-y-4">
              <QuadroResumo resumo={resumo} />
              <button type="button" onClick={() => setDetalhe((d) => !d)} aria-expanded={detalhe}
                className="flex items-center gap-1.5 text-sm font-bold text-rose-600 hover:text-rose-700">
                {detalhe ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {detalhe ? 'Ocultar detalhado' : `Ver detalhado (${resumo.itens.length} atendimento(s))`}
              </button>
              {detalhe && <div className="border border-slate-200 rounded-xl overflow-x-auto"><TabelaDetalhada resumo={resumo} /></div>}
              <p className="text-[11px] text-slate-500">Valores em aberto são prévia pelas regras atuais de comissão; os já fechados são os gravados no fechamento.</p>
            </div>
          )}
      {imprimir && !carregando && !erro && (
        <ImpressaoResumo onFim={fimImpressao}>
          <DocumentoResumo resumo={resumo} nome={nome} de={de} ate={ate} detalhado={imprimir === 'detalhado'} />
        </ImpressaoResumo>
      )}
    </Modal>
  );
}
