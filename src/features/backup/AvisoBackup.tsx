import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { dataLocal } from '../../lib/formatos';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { Modal, inputCls } from '../../components/ui';
import { codigoValido, confirmarCodigo, fatoresTotp, mensagemMfa } from '../acesso/mfa';
import { abasDoBackup } from './abas';
import { ROTULO_BACKUP, backupEmDia, linhasDeDados, nomeArquivoBackup, type TipoBackup } from './logic';
import { escreverXlsx } from './xlsx';

export const backupKeys = { ultimos: ['backup', 'ultimos'] as const };

/** Data do último backup de cada tipo no estabelecimento (só a administradora recebe). */
async function ultimosBackups(): Promise<Partial<Record<TipoBackup, string>>> {
  const { data, error } = await supabase.rpc('ultimos_backups');
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as { tipo: TipoBackup; ultimo: string }[]).map((l) => [l.tipo, l.ultimo]));
}

/** Monta a planilha, pede ao banco o registro (administradora + aal2) e só então entrega o arquivo. */
async function gerarEBaixar(tipo: TipoBackup) {
  const abas = await abasDoBackup(tipo);
  const arquivo = escreverXlsx(abas);
  const { error } = await supabase.rpc('registrar_backup', { p_tipo: tipo, p_linhas: linhasDeDados(abas) });
  if (error) throw error;
  const url = URL.createObjectURL(new Blob([arquivo as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivoBackup(tipo, dataLocal());
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Backup em planilha (.xlsx) de um tipo, só para a administradora.
 * Em dia: botão discreto. Pendente no mês: faixa amarela com "Fazer backup agora".
 * Sem o segundo fator confirmado na sessão, pede o código do autenticador antes.
 * exibir: 'faixa' mostra só a pendência; 'botao' só o botão quando em dia (telas de altura
 * fixa, como Agenda e Finanças, põem a faixa no topo e o botão na barra de controles).
 */
export function AvisoBackup({ tipo, exibir = 'tudo' }: { tipo: TipoBackup; exibir?: 'tudo' | 'faixa' | 'botao' }) {
  const { perfil, nivel, atualizarNivel } = useAuth();
  const queryClient = useQueryClient();
  const ehAdmin = perfil?.role === 'admin';
  const { data: ultimos, isLoading } = useQuery({ queryKey: backupKeys.ultimos, queryFn: ultimosBackups, enabled: ehAdmin, staleTime: 60_000 });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pedirCodigo, setPedirCodigo] = useState<{ fatorId: string } | 'sem-autenticador' | null>(null);
  const [codigo, setCodigo] = useState('');

  if (!ehAdmin || isLoading) return null;
  const ultimo = ultimos?.[tipo] ?? null;
  const emDia = backupEmDia(ultimo, dataLocal());
  const rotulo = ROTULO_BACKUP[tipo];
  const mostrar = exibir === 'tudo' || (exibir === 'faixa' ? !emDia : emDia);

  const baixar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      await gerarEBaixar(tipo);
      await queryClient.invalidateQueries({ queryKey: backupKeys.ultimos });
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível gerar o backup.', 'backup.gerar'));
    } finally {
      setOcupado(false);
    }
  };

  const iniciar = async () => {
    setErro(null);
    if (nivel.atual === 'aal2') return baixar();
    try {
      const fator = (await fatoresTotp()).find((f) => f.verificado);
      setCodigo('');
      setPedirCodigo(fator ? { fatorId: fator.id } : 'sem-autenticador');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível conferir o autenticador.', 'backup.mfa'));
    }
  };

  const confirmar = async () => {
    if (!pedirCodigo || pedirCodigo === 'sem-autenticador') return;
    if (!codigoValido(codigo)) return setErro('Digite os 6 números do aplicativo autenticador.');
    setOcupado(true);
    setErro(null);
    try {
      await confirmarCodigo(pedirCodigo.fatorId, codigo);
      await atualizarNivel();
      setPedirCodigo(null);
      await gerarEBaixar(tipo);
      await queryClient.invalidateQueries({ queryKey: backupKeys.ultimos });
    } catch (e) {
      const codigoErro = (e as { code?: string } | null)?.code;
      setErro(mensagemMfa(codigoErro) ?? mensagemDeErro(e, 'Não foi possível gerar o backup.', 'backup.codigo'));
    } finally {
      setOcupado(false);
    }
  };

  const botao = (
    <button type="button" onClick={iniciar} disabled={ocupado}
      title={ultimo ? `Último backup em ${new Date(ultimo).toLocaleDateString('pt-BR')}` : 'Nenhum backup ainda'}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap disabled:opacity-60 ${emDia ? 'bg-white border border-slate-200 text-slate-600 hover:text-rose-600' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
      {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
      {emDia ? `Backup (${rotulo})` : 'Fazer backup agora'}
    </button>
  );

  return (
    <>
      {!mostrar ? null : emDia ? botao : (
        <div role="status" className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <p className="flex-1 min-w-[14rem] text-sm text-amber-900">
            <strong>Backup mensal pendente:</strong> baixe a planilha de {rotulo.toLowerCase()} deste mês e guarde em local protegido.
            {ultimo && <span className="text-amber-800"> Último em {new Date(ultimo).toLocaleDateString('pt-BR')}.</span>}
          </p>
          {botao}
        </div>
      )}
      {mostrar && erro && !pedirCodigo && <p role="alert" className="text-sm text-red-600">{erro}</p>}

      {pedirCodigo && (
        <Modal titulo={`Backup de ${rotulo.toLowerCase()}`} onClose={() => setPedirCodigo(null)} largura="md:max-w-[420px]"
          rodape={pedirCodigo === 'sem-autenticador' ? undefined : (
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPedirCodigo(null)} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg">Cancelar</button>
              <button type="button" onClick={confirmar} disabled={ocupado} className="px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded-lg disabled:opacity-50">
                {ocupado ? 'Gerando...' : 'Confirmar e baixar'}
              </button>
            </div>
          )}>
          {pedirCodigo === 'sem-autenticador' ? (
            <div className="space-y-3 text-sm text-slate-600">
              <p>O backup tem dados das clientes e do caixa, então exige a verificação em duas etapas.</p>
              <Link to="/configuracoes#seguranca" className="inline-flex items-center gap-2 font-bold text-rose-600"><ShieldCheck size={16} /> Ativar em Configurações &gt; Segurança</Link>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void confirmar(); }} className="space-y-3">
              <p className="text-sm text-slate-600">Digite o código de 6 números do aplicativo autenticador para baixar o backup.</p>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus
                aria-label="Código do autenticador" className={`${inputCls} text-center text-lg tracking-[0.4em] font-bold`} />
              {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
