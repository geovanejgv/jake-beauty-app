import React from 'react';
import { ClipboardList } from 'lucide-react';
import { RelatorioComissoesConteudo } from '../features/comissoes/RelatorioComissoesConteudo';

export default function RelatorioComissoes() {
  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-12">
      <div>
        <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2"><ClipboardList className="text-rose-600" /> Relatório de Comissões</h2>
        <p className="text-sm text-slate-500 mt-1">Data, cliente, serviço, valor bruto, percentual de comissão e valor líquido, com PDF e exportação.</p>
      </div>
      <RelatorioComissoesConteudo />
    </div>
  );
}
