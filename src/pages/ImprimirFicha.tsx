import { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { buscarFicha, fichasKeys, registrarAcessoFicha } from '../features/fichas/api';
import { DocumentoFicha } from '../features/fichas/DocumentoFicha';
import { temaDe } from '../features/fichas/temas';
import { equipeKeys, listarAtivos } from '../features/equipe/api';

/**
 * Ficha para ver, imprimir ou "Salvar como PDF" pelo navegador: página limpa, sem menu,
 * texto selecionável e sem biblioteca nova. O banco só entrega a ficha a quem pode vê-la.
 */
export default function ImprimirFicha() {
  const { id = '' } = useParams();
  const { perfil } = useAuth();
  const { data: ficha, isLoading, error } = useQuery({ queryKey: fichasKeys.uma(id), queryFn: () => buscarFicha(id), enabled: !!id });
  const { data: equipe = [] } = useQuery({ queryKey: equipeKeys.ativos, queryFn: listarAtivos });
  const [params] = useSearchParams();
  const baixar = params.get('baixar') === '1';
  const registrado = useRef(false);

  // Trilha LGPD (dado de saúde): quem abriu e quem baixou. Com ?baixar=1, já abre a impressão.
  useEffect(() => {
    if (!ficha || registrado.current) return;
    registrado.current = true;
    void registrarAcessoFicha(ficha.id, baixar);
    if (baixar) { const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t); }
  }, [ficha, baixar]);
  const imprimir = () => { if (ficha && !baixar) void registrarAcessoFicha(ficha.id, true); window.print(); };

  useEffect(() => {
    const raiz = document.documentElement;
    const escuro = raiz.classList.contains('dark');
    raiz.classList.remove('dark');
    return () => { if (escuro) raiz.classList.add('dark'); };
  }, []);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  if (error || !ficha) {
    return <p className="p-6 text-center text-sm text-slate-600">{error ? mensagemDeErro(error, 'Não foi possível abrir a ficha.', 'imprimir_ficha') : 'Ficha não encontrada.'}</p>;
  }
  const tema = temaDe(ficha.modelo_visual);
  const profissional = equipe.find((m) => m.id === ficha.profissional_id)?.name ?? null;
  return (
    <div className={`min-h-screen ${tema.pagina} print:bg-white`}>
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 print:p-0 space-y-3">
        <div className="print:hidden flex items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            {ficha.status === 'pendente' ? 'Ficha ainda não assinada pela cliente.' : ficha.status === 'cancelada' ? 'Ficha cancelada.' : 'Ficha assinada.'}
          </p>
          <button type="button" onClick={imprimir} className={`${tema.botao} inline-flex items-center gap-2 px-4 py-2 text-sm font-bold`}>
            <Printer size={16} /> Imprimir / Salvar PDF
          </button>
        </div>
        <DocumentoFicha
          esquema={ficha.campos} tema={tema} mostrarAlertas
          estabelecimento={perfil?.estabelecimento?.nome ?? ''} profissional={profissional}
          dadosSalao={ficha.dados_salao} respostas={ficha.respostas ?? {}}
          cancelado={ficha.status === 'cancelada' ? ficha.cancelado_motivo : null}
          assinatura={{
            assinaturaCliente: ficha.assinatura_cliente, assinaturaResponsavel: ficha.assinatura_responsavel,
            responsavel: ficha.responsavel_nome ? { nome: ficha.responsavel_nome, cpf: ficha.responsavel_cpf, parentesco: ficha.responsavel_parentesco } : null,
            assinadoEm: ficha.assinado_em, ip: ficha.assinatura_ip, dispositivo: ficha.assinatura_dispositivo, hash: ficha.hash_documento,
          }} />
      </div>
    </div>
  );
}
