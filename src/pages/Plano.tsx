import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gem, Loader2, LifeBuoy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { ROTULO_PLANO, demoExpirada, diasRestantesDemo, usoLimite, type Plano as TipoPlano } from '../features/plano/plano';

type MeuPlano = {
  nome: string; plano: TipoPlano; status: string; demo_expira_em: string | null;
  max_profissionais: number | null; max_clientes: number | null;
  profissionais: number; administradoras: number; clientes: number;
};

const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** Plano do estabelecimento, prazo da demonstração e uso x limite (RF-16). Visível para toda a equipe. */
export default function Plano() {
  const consulta = useQuery({
    queryKey: ['plano', 'meu'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('meu_plano');
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as MeuPlano | null;
    },
  });

  if (consulta.isLoading) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-rose-500" size={32} /></div>;
  if (consulta.isError || !consulta.data) {
    return <p className="max-w-md mx-auto mt-16 text-center text-sm text-slate-600">{mensagemDeErro(consulta.error, 'Não foi possível carregar o plano.', 'plano')}</p>;
  }
  const p = consulta.data;
  const vencida = demoExpirada(p);
  const dias = diasRestantesDemo(p);
  const linhas: { rotulo: string; usados: number; limite: number | null }[] = [
    { rotulo: 'Profissionais ativos', usados: Number(p.profissionais), limite: p.max_profissionais },
    { rotulo: 'Clientes cadastradas', usados: Number(p.clientes), limite: p.max_clientes },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div>
        <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2"><Gem className="text-rose-600" /> Plano</h2>
        <p className="text-sm text-slate-500 mt-1">{p.nome}</p>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2" aria-labelledby="titulo-plano-atual">
        <p id="titulo-plano-atual" className="text-xs font-bold uppercase tracking-wider text-slate-400">Plano atual</p>
        <p className="text-2xl font-black text-slate-800">{ROTULO_PLANO[p.plano]}</p>
        {p.plano === 'demonstracao' && p.demo_expira_em && (
          <p className={`text-sm font-semibold ${vencida ? 'text-red-600' : 'text-slate-600'}`}>
            {vencida
              ? `A demonstração terminou em ${dataBR(p.demo_expira_em)}. Agenda, clientes, equipe, catálogo e configurações seguem funcionando; os demais módulos voltam com um plano Básico ou Premium.`
              : `Demonstração com acesso completo até ${dataBR(p.demo_expira_em)}: ${dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`}.`}
          </p>
        )}
        {p.plano === 'premium' && <p className="text-sm text-slate-600">Sem limites de cadastro.</p>}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3" aria-labelledby="titulo-limites">
        <h3 id="titulo-limites" className="font-bold text-slate-800">Cadastros e limites</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
              <th className="py-2 font-bold">Recurso</th><th className="py-2 font-bold text-right">Em uso / limite</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l) => {
              const cheio = l.limite !== null && l.usados >= l.limite;
              return (
                <tr key={l.rotulo}>
                  <td className="py-2.5 text-slate-700">{l.rotulo}</td>
                  <td className={`py-2.5 text-right font-bold tabular-nums ${cheio ? 'text-amber-600' : 'text-slate-800'}`}>{usoLimite(l.usados, l.limite)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-slate-500">∞ = sem limite. Administradoras não contam no limite de profissionais.</p>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-3">
        <LifeBuoy size={20} className="text-rose-600 shrink-0 mt-0.5" />
        <div className="text-sm text-slate-600">
          <p className="font-bold text-slate-800">Precisa ampliar ou mudar de plano?</p>
          <p>Fale com o suporte do Jake Beauty: a mudança de plano e de limites é feita pela administração do sistema.</p>
        </div>
      </section>
    </div>
  );
}
