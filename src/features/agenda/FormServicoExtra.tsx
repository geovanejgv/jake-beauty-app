import { useState } from 'react';
import { Plus } from 'lucide-react';
import { brl } from '../../lib/formatos';
import { duracaoTexto } from '../catalogo/logic';
import { montarExtra, type FormExtra, type Oferta, type ServicoExtra } from './servicoExtra';

const VAZIO: FormExtra = { escolha: '', nomeAvulso: '', minutosAvulso: '30', valor: '' };
const campo = 'w-full border border-slate-200 p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 text-sm bg-white';

/**
 * Escolha de um serviço a mais para a cliente (catálogo do profissional ou avulso).
 * Só monta o serviço; quem usa decide se cria o atendimento na hora ou no fechamento.
 */
export function FormServicoExtra({ ofertas, podeDefinirValor, ocupado = false, rotuloBotao = 'Adicionar serviço', onAdicionar }: {
  ofertas: Oferta[];
  podeDefinirValor: boolean;
  ocupado?: boolean;
  rotuloBotao?: string;
  onAdicionar: (extra: ServicoExtra) => void | Promise<unknown>;
}) {
  const [f, setF] = useState<FormExtra>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const oferta = ofertas.find((o) => o.s.id === f.escolha);
  const avulso = f.escolha === 'avulso';
  const valorEditavel = avulso || podeDefinirValor;

  const adicionar = async () => {
    const r = montarExtra(f, ofertas, podeDefinirValor, crypto.randomUUID());
    if (typeof r === 'string') return setErro(r);
    setErro(null);
    try {
      await onAdicionar(r);
      setF(VAZIO);
    } catch {
      // Quem chamou já mostrou o erro; o formulário fica como está para corrigir.
    }
  };

  return (
    <div className="space-y-2">
      <select value={f.escolha} onChange={(e) => { setF({ ...f, escolha: e.target.value, valor: '' }); setErro(null); }} aria-label="Serviço a adicionar" className={campo}>
        <option value="">Escolha o serviço...</option>
        {ofertas.map((o) => <option key={o.s.id} value={o.s.id}>{o.s.nome} · {brl(o.c.valor)} · {duracaoTexto(o.c.minutos)}</option>)}
        <option value="avulso">Outro procedimento (avulso)</option>
      </select>
      {avulso && (
        <div className="grid grid-cols-3 gap-2">
          <input value={f.nomeAvulso} onChange={(e) => setF({ ...f, nomeAvulso: e.target.value })} maxLength={120} placeholder="Procedimento" aria-label="Nome do procedimento" className={`${campo} col-span-2`} />
          <input value={f.minutosAvulso} onChange={(e) => setF({ ...f, minutosAvulso: e.target.value })} inputMode="numeric" placeholder="Min" aria-label="Duração em minutos" className={campo} />
        </div>
      )}
      {f.escolha && (
        <div className="flex gap-2">
          {valorEditavel
            ? <input value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} inputMode="decimal" aria-label="Valor (R$)"
                placeholder={oferta ? `Valor: ${brl(oferta.c.valor).replace('R$', '').trim()}` : 'Valor (R$)'} className={`${campo} flex-1`} />
            : <p className="flex-1 text-sm text-slate-600 self-center">Valor: <strong>{brl(oferta?.c.valor)}</strong></p>}
          <button type="button" onClick={() => void adicionar()} disabled={ocupado}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-60">
            <Plus size={16} /> {ocupado ? 'Salvando...' : rotuloBotao}
          </button>
        </div>
      )}
      {erro && <p role="alert" className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}
