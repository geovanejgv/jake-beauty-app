import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { linkWhatsapp, temTelefone } from '../leads/logic';
import { falhou, gerar, lerResultado, ultimaGeracao, type DiagnosticoIa, type GeracaoIa } from './api';
import { classeBotaoIa, EditorMensagem, ErroIa, Gerando, ListaIa, PainelIa } from './PainelIa';
import { useDisponibilidadeIa, useRecarregarIa } from './useIa';

/** Formato salvo pela Edge Function (validado por schema lá, resumo-cliente.ts). */
type ResumoCliente = {
  resumo: string;
  preferencias: string[];
  cuidados: string[];
  frequencia_media_dias: number | null;
  sugestao_retorno: string;
  servicos_sugeridos: string[];
  mensagem_whatsapp: string;
};

/**
 * Resumo da cliente com IA: histórico, preferências, cuidados, retorno e mensagem.
 * O contexto é o que a pessoa logada já pode ver (RLS e permissões da profissional).
 */
export function ResumoClienteIa({ clienteId, telefone }: { clienteId: string; telefone?: string | null }) {
  const ia = useDisponibilidadeIa();
  const recarregar = useRecarregarIa();
  const [g, setG] = useState<GeracaoIa | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<{ mensagem: string; diagnostico?: DiagnosticoIa } | null>(null);

  useEffect(() => {
    if (!ia.ativa) return;
    let vivo = true;
    ultimaGeracao('resumo_cliente', { client_id: clienteId }).then((x) => vivo && setG(x)).catch(() => undefined);
    return () => { vivo = false; };
  }, [ia.ativa, clienteId]);

  async function resumir() {
    setGerando(true);
    setErro(null);
    const r = await gerar<ResumoCliente>('resumo_cliente', { client_id: clienteId });
    setGerando(false);
    if (falhou(r)) setErro({ mensagem: r.error, diagnostico: r.diagnostico });
    else setG(r.geracao);
    if (!falhou(r) || r.codigo === 'chave_invalida') void recarregar();
  }

  const t = lerResultado<ResumoCliente>(g);

  return (
    <PainelIa titulo="Resumo com IA" descricao="Usa os atendimentos, o histórico técnico e as observações que você pode ver desta cliente.">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={resumir} disabled={gerando} className={classeBotaoIa}>
          <Sparkles size={15} /> {g ? 'Atualizar resumo' : 'Resumir cliente'}
        </button>
        {gerando && <Gerando />}
      </div>
      <ErroIa mensagem={erro?.mensagem ?? null} diagnostico={erro?.diagnostico} />
      {g && t && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <p className="whitespace-pre-line text-sm text-slate-700">{t.resumo}</p>
          <ListaIa titulo="Cuidados" itens={t.cuidados} destaque />
          <ListaIa titulo="Preferências" itens={t.preferencias} />
          <ListaIa titulo="Serviços que combinam" itens={t.servicos_sugeridos} />
          {(t.frequencia_media_dias || t.sugestao_retorno) && (
            <p className="text-sm text-slate-700">
              {t.frequencia_media_dias ? <>Vem em média a cada <strong>{t.frequencia_media_dias} dias</strong>. </> : null}
              {t.sugestao_retorno}
            </p>
          )}
          <EditorMensagem g={g} textoInicial={t.mensagem_whatsapp} telefoneWhats={temTelefone(telefone) ? telefone : null} linkWhats={linkWhatsapp} onAlterado={setG} />
        </div>
      )}
    </PainelIa>
  );
}
