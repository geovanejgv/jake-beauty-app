import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { linkWhatsapp, temTelefone } from '../leads/logic';
import { falhou, gerar, lerResultado, ultimaGeracao, type DiagnosticoIa, type GeracaoIa } from './api';
import { classeBotaoIa, classeBotaoSecundario, EditorMensagem, ErroIa, Gerando, ListaIa, PainelIa } from './PainelIa';
import { useDisponibilidadeIa, useRecarregarIa } from './useIa';

/** Formato salvo pela Edge Function (validado por schema lá, triagem-lead.ts). */
type TriagemLead = {
  resumo: string;
  temperatura: 'fria' | 'morna' | 'quente';
  motivo_temperatura: string;
  servicos_de_interesse: string[];
  perguntas_pendentes: string[];
  alertas: string[];
  proximo_passo: string;
  mensagem_whatsapp: string;
};

const COR_TEMPERATURA: Record<TriagemLead['temperatura'], string> = {
  fria: 'bg-sky-100 text-sky-700', morna: 'bg-amber-100 text-amber-700', quente: 'bg-rose-100 text-rose-700',
};

/**
 * Triagem do lead com IA: resumo, temperatura, perguntas, alertas, próximo passo e
 * mensagem de WhatsApp. Usa os dados salvos do lead (a Edge Function lê pelo RLS).
 */
export function TriagemLeadIa({ leadId, telefone, onUsarProximoPasso }: { leadId: string; telefone?: string | null; onUsarProximoPasso?: (texto: string) => void }) {
  const ia = useDisponibilidadeIa();
  const recarregar = useRecarregarIa();
  const [g, setG] = useState<GeracaoIa | null>(null);
  const [observacao, setObservacao] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<{ mensagem: string; diagnostico?: DiagnosticoIa } | null>(null);

  useEffect(() => {
    if (!ia.ativa) return;
    let vivo = true;
    ultimaGeracao('triagem_lead', { lead_id: leadId }).then((x) => vivo && setG(x)).catch(() => undefined);
    return () => { vivo = false; };
  }, [ia.ativa, leadId]);

  async function analisar() {
    setGerando(true);
    setErro(null);
    const r = await gerar<TriagemLead>('triagem_lead', { lead_id: leadId, ...(observacao.trim() ? { observacao: observacao.trim() } : {}) });
    setGerando(false);
    if (falhou(r)) setErro({ mensagem: r.error, diagnostico: r.diagnostico });
    else { setG(r.geracao); setObservacao(''); }
    if (!falhou(r) || r.codigo === 'chave_invalida') void recarregar();
  }

  const t = lerResultado<TriagemLead>(g);

  return (
    <PainelIa titulo="Triagem com IA" descricao="Usa os dados salvos deste lead. Salve as alterações do formulário antes de analisar.">
      <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={2000}
        placeholder="Opcional: algo que a possível cliente contou agora (sem dados de saúde que ela não autorizou)."
        aria-label="Observação para a IA" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-400 focus:outline-none" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={analisar} disabled={gerando} className={classeBotaoIa}>
          <Sparkles size={15} /> {g ? 'Analisar de novo' : 'Analisar lead'}
        </button>
        {gerando && <Gerando />}
      </div>
      <ErroIa mensagem={erro?.mensagem ?? null} diagnostico={erro?.diagnostico} />
      {g && t && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${COR_TEMPERATURA[t.temperatura] ?? 'bg-slate-100 text-slate-600'}`}>Lead {t.temperatura}</span>
            {t.motivo_temperatura && <span className="text-xs text-slate-500">{t.motivo_temperatura}</span>}
          </div>
          <p className="whitespace-pre-line text-sm text-slate-700">{t.resumo}</p>
          <ListaIa titulo="Alertas" itens={t.alertas} destaque />
          <ListaIa titulo="Serviços de interesse" itens={t.servicos_de_interesse} />
          <ListaIa titulo="Perguntas a fazer" itens={t.perguntas_pendentes} />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-slate-700"><strong className="text-slate-800">Próximo passo:</strong> {t.proximo_passo}</p>
            {onUsarProximoPasso && (
              <button type="button" onClick={() => onUsarProximoPasso(t.proximo_passo.slice(0, 300))} className={classeBotaoSecundario}>Usar como próxima ação</button>
            )}
          </div>
          <EditorMensagem g={g} textoInicial={t.mensagem_whatsapp} telefoneWhats={temTelefone(telefone) ? telefone : null} linkWhats={linkWhatsapp} onAlterado={setG} />
        </div>
      )}
    </PainelIa>
  );
}
