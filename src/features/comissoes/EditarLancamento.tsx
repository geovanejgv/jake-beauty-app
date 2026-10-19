import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { brl, dataBR, lerValor, valorParaCampo } from '../../lib/formatos';
import { Campo, Confirmar, Modal, inputCls } from '../../components/ui';
import { comissoesKeys, editarLancamento, excluirLancamento } from './api';
import { ROTULO_FORMA, type FormaPagamento } from './logic';
import type { LinhaRelatorio } from './relatorio';

const FORMAS = (Object.keys(ROTULO_FORMA) as FormaPagamento[]).filter((f) => f !== 'pacote');

/** Edita valor, % de comissão, forma de pagamento e gorjeta de um lançamento em aberto. */
export function EditarLancamento({ linha, onClose, onAviso }: { linha: LinhaRelatorio; onClose: () => void; onAviso: (t: string) => void }) {
  const queryClient = useQueryClient();
  const [valor, setValor] = useState(valorParaCampo(linha.valor_cobrado ?? 0));
  const [comissao, setComissao] = useState(valorParaCampo(linha.comissao_percentual ?? 0));
  const [forma, setForma] = useState(linha.payment_method ?? '');
  const [gorjeta, setGorjeta] = useState(valorParaCampo(linha.gorjeta ?? 0));
  const [erro, setErro] = useState<string | null>(null);
  const pacote = linha.payment_method === 'pacote';
  const salvar = useMutation({
    mutationFn: () => {
      const v = lerValor(valor || '0');
      const c = lerValor(comissao || '0');
      const g = lerValor(gorjeta || '0');
      if (v === null || v > 100000) throw new Error('valor');
      if (c === null || c > 100) throw new Error('comissao');
      if (g === null || g > 100000) throw new Error('gorjeta');
      return editarLancamento(linha.id, { valor_cobrado: v, comissao_percentual: c, gorjeta: g, payment_method: pacote ? 'pacote' : (forma || null) as FormaPagamento | null });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: comissoesKeys.base }); onAviso('Lançamento atualizado.'); onClose(); },
    onError: (e) => setErro(
      e instanceof Error && e.message === 'valor' ? 'Valor inválido.'
        : e instanceof Error && e.message === 'comissao' ? 'Comissão entre 0 e 100%.'
          : e instanceof Error && e.message === 'gorjeta' ? 'Gorjeta inválida.'
            : mensagemDeErro(e, 'Não foi possível salvar o lançamento.', 'lancamento.editar')),
  });
  return (
    <Modal titulo="Editar lançamento" onClose={onClose}
      rodape={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 text-sm hover:bg-slate-100">Cancelar</button>
        <button type="button" disabled={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm disabled:opacity-60">{salvar.isPending ? 'Salvando...' : 'Salvar'}</button></div>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{dataBR(linha.start_time)} · {linha.cliente_nome} · {linha.servico_nome} · {linha.profissional_nome}</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor bruto (R$)" obrigatorio><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={inputCls} disabled={pacote} autoFocus /></Campo>
          <Campo rotulo="% Comissão" obrigatorio><input inputMode="decimal" value={comissao} onChange={(e) => setComissao(e.target.value)} className={inputCls} disabled={pacote} /></Campo>
          <Campo rotulo="Forma de pagamento">
            <select value={forma} onChange={(e) => setForma(e.target.value)} className={inputCls} disabled={pacote}>
              <option value="">Não informada</option>
              {FORMAS.map((f) => <option key={f} value={f}>{ROTULO_FORMA[f]}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Gorjeta (R$)"><input inputMode="decimal" value={gorjeta} onChange={(e) => setGorjeta(e.target.value)} className={inputCls} /></Campo>
        </div>
        {pacote && <p className="text-xs text-slate-500">Sessão de pacote: valor, comissão e forma vêm do pacote; só a gorjeta pode mudar aqui.</p>}
        <p className="text-xs text-slate-500">Se depois a comissão da profissional for alterada no cadastro, os lançamentos em aberto voltam a seguir a configuração.</p>
        {erro && <p role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{erro}</p>}
      </div>
    </Modal>
  );
}

/** Confirma e exclui o lançamento (o atendimento sai da agenda e dos relatórios). */
export function ExcluirLancamento({ linha, onClose, onAviso }: { linha: LinhaRelatorio; onClose: () => void; onAviso: (t: string) => void }) {
  const queryClient = useQueryClient();
  const excluir = useMutation({
    mutationFn: () => excluirLancamento(linha.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: comissoesKeys.base }); onAviso('Lançamento excluído.'); onClose(); },
    onError: (e) => { onAviso(mensagemDeErro(e, 'Não foi possível excluir o lançamento.', 'lancamento.excluir')); onClose(); },
  });
  return (
    <Confirmar titulo="Excluir lançamento?" botao="Excluir" ocupado={excluir.isPending} onCancelar={onClose} onConfirmar={() => excluir.mutate()}
      texto={`${dataBR(linha.start_time)} · ${linha.cliente_nome} · ${linha.servico_nome} (${brl(linha.calculo.bruto)}). O atendimento sai da agenda e dos relatórios. Esta ação não pode ser desfeita.`} />
  );
}
