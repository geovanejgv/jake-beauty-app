import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { clientesKeys, criarOrigem, type Origem } from './api';
import { limparNome, nomeRepetido } from './logic';

const NOVA = '__nova';

/** Origem da cliente: escolhe entre as cadastradas ou cria outra na hora. */
export function CampoOrigem({ origens, valor, onChange }: { origens: Origem[]; valor: string; onChange: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const criar = useMutation({
    mutationFn: criarOrigem,
    onSuccess: (o) => {
      queryClient.invalidateQueries({ queryKey: clientesKeys.origens });
      onChange(o.id);
      setCriando(false);
      setNome('');
    },
    onError: (e: unknown) => alert(mensagemDeErro(e, 'Não foi possível criar a origem.', 'clientes.origem_criar')),
  });
  const confirmar = () => {
    const limpo = limparNome(nome, 60);
    if (!limpo) return alert('Informe o nome da origem (até 60 caracteres).');
    const igual = origens.find((o) => nomeRepetido(limpo, [o]));
    if (igual) { onChange(igual.id); setCriando(false); setNome(''); return; }
    criar.mutate(limpo);
  };
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 mb-1">Origem</label>
      {criando ? (
        <div className="flex gap-2">
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } }} maxLength={60} placeholder="Ex.: Indicação, Instagram" aria-label="Nova origem" className="flex-1 border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm" />
          <button type="button" onClick={confirmar} disabled={criar.isPending} className="px-3 rounded-xl bg-rose-600 text-white text-sm font-bold disabled:opacity-40">Criar</button>
          <button type="button" onClick={() => { setCriando(false); setNome(''); }} className="px-3 rounded-xl border text-slate-500 text-sm">Voltar</button>
        </div>
      ) : (
        <select value={valor} onChange={(e) => (e.target.value === NOVA ? setCriando(true) : onChange(e.target.value))} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm bg-white">
          <option value="">Não informada</option>
          {origens.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          <option value={NOVA}>+ Outra origem...</option>
        </select>
      )}
    </div>
  );
}
