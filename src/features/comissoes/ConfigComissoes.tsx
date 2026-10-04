import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Percent } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { lerValor, valorParaCampo } from '../../lib/formatos';
import { comissoesKeys } from './api';

type Taxa = { forma: string; percentual: number };
type ConfigComissao = { descontar_taxa_pagamento: boolean; descontar_custo_material: boolean; dia_fechamento: number | null };

const ROTULO_FORMA: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', debito: 'Cartão de débito', credito: 'Cartão de crédito', cartao: 'Cartão (registros antigos)', outro: 'Outro',
};

/** Chave liga/desliga acessível (role="switch"). */
export function Chave({ ligado, onChange, rotulo, desabilitado }: { ligado: boolean; onChange: (v: boolean) => void; rotulo: string; desabilitado?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={() => onChange(!ligado)}
      className={`sem-hover relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${ligado ? 'bg-rose-600' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

/** "Configurações adicionais de comissões": descontos e taxas por forma de pagamento (administradora). */
export function ConfigComissoes({ onAviso }: { onAviso: (t: string) => void }) {
  const queryClient = useQueryClient();
  const setAviso = onAviso;
  const { data: config } = useQuery({
    queryKey: ['config-comissao'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracoes_comissao').select('descontar_taxa_pagamento, descontar_custo_material, dia_fechamento').maybeSingle();
      if (error) throw error;
      return data as ConfigComissao | null;
    },
  });
  const { data: taxas = [] } = useQuery({
    queryKey: ['taxas-pagamento'],
    queryFn: async () => {
      const { data, error } = await supabase.from('taxas_pagamento').select('forma, percentual').order('forma');
      if (error) throw error;
      return (data || []) as Taxa[];
    },
  });
  const [taxasEdicao, setTaxasEdicao] = useState<Record<string, string>>({});
  useEffect(() => { setTaxasEdicao(Object.fromEntries(taxas.map((t) => [t.forma, valorParaCampo(t.percentual)]))); }, [taxas]);

  const salvarConfig = useMutation({
    mutationFn: async (campos: Partial<ConfigComissao>) => {
      const { error } = await supabase.from('configuracoes_comissao').update(campos).eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['config-comissao'] }); queryClient.invalidateQueries({ queryKey: comissoesKeys.regras }); setAviso('Regras de comissão salvas.'); },
    onError: (e) => setAviso(mensagemDeErro(e, 'Não foi possível salvar as regras.', 'configuracoes.comissao')),
  });
  const salvarTaxas = useMutation({
    mutationFn: async () => {
      for (const t of taxas) {
        const v = lerValor(taxasEdicao[t.forma] ?? '');
        if (v === null || v > 30) throw new Error('TAXA_INVALIDA');
        if (v !== Number(t.percentual)) {
          const { error } = await supabase.from('taxas_pagamento').update({ percentual: v, updated_at: new Date().toISOString() }).eq('forma', t.forma);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['taxas-pagamento'] }); queryClient.invalidateQueries({ queryKey: comissoesKeys.regras }); setAviso('Taxas salvas.'); },
    onError: (e) => setAviso((e as Error).message === 'TAXA_INVALIDA' ? 'Informe taxas entre 0 e 30%.' : mensagemDeErro(e, 'Não foi possível salvar as taxas.', 'configuracoes.taxas')),
  });

  return (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4" aria-labelledby="titulo-comissao">
          <div className="flex items-center gap-2">
            <Percent size={18} className="text-rose-600" />
            <h3 id="titulo-comissao" className="font-bold text-slate-800">Configurações adicionais de comissões</h3>
          </div>
          {!config ? (
            <Loader2 className="animate-spin text-rose-500" />
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-3 py-2.5 border-b border-slate-100">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">Descontar a taxa da forma de pagamento antes da comissão</p>
                  <p className="text-xs text-slate-500">Ex.: atendimento de R$ 100 no crédito (3,49%) gera comissão sobre R$ 96,51.</p>
                </div>
                <Chave ligado={config.descontar_taxa_pagamento} rotulo="Descontar taxa de pagamento" desabilitado={salvarConfig.isPending}
                  onChange={(v) => salvarConfig.mutate({ descontar_taxa_pagamento: v })} />
              </div>
              <div className="flex items-center gap-3 py-2.5 border-b border-slate-100">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">Descontar o custo de material do serviço</p>
                  <p className="text-xs text-slate-500">Usa o "custo de material" cadastrado em cada serviço do catálogo.</p>
                </div>
                <Chave ligado={config.descontar_custo_material} rotulo="Descontar custo de material" desabilitado={salvarConfig.isPending}
                  onChange={(v) => salvarConfig.mutate({ descontar_custo_material: v })} />
              </div>
              <p className="text-xs text-slate-500 pt-2">As regras valem para os próximos fechamentos; os já gerados guardam os valores calculados na época.</p>
            </div>
          )}

          <div className="pt-2">
            <p className="text-sm font-semibold text-slate-800 mb-2">Taxas por forma de pagamento</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {taxas.map((t) => (
                <label key={t.forma} className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="text-sm text-slate-700">{ROTULO_FORMA[t.forma] ?? t.forma}</span>
                  <span className="flex items-center gap-1">
                    <input inputMode="decimal" value={taxasEdicao[t.forma] ?? ''} onChange={(e) => setTaxasEdicao((x) => ({ ...x, [t.forma]: e.target.value }))}
                      className="w-20 text-right border border-slate-200 rounded-lg px-2 py-1.5 text-sm" aria-label={`Taxa ${ROTULO_FORMA[t.forma] ?? t.forma}`} />
                    <span className="text-sm text-slate-500">%</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end pt-3">
              <button type="button" onClick={() => salvarTaxas.mutate()} disabled={salvarTaxas.isPending}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm disabled:opacity-60">
                {salvarTaxas.isPending ? 'Salvando...' : 'Salvar taxas'}
              </button>
            </div>
          </div>
        </section>
  );
}
