import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { dataHoraBR } from '../../lib/formatos';
import { Modal } from '../../components/ui';
import {
  CAMPOS_CLIENTE, ROTULO_ALCANCE, ROTULO_NIVEL, TELAS_PERMISSAO, descreverAcao, historicoDe, permissaoDe, permissoesDe,
  permissoesKeys, salvarPermissoes, type CampoCliente, type ModuloPermissao, type Permissao,
} from './permissoes';

type Mapa = Record<ModuloPermissao, Permissao>;

/** Quadro de permissões de uma profissional: nível por tela, alcance e dados de clientes. */
export function PermissoesProfissional({ membro, onClose, onAviso }: { membro: { id: string; name: string }; onClose: () => void; onAviso: (t: string) => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: permissoesKeys.doUsuario(membro.id), queryFn: () => permissoesDe(membro.id) });
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (data) setMapa(Object.fromEntries(TELAS_PERMISSAO.map((t) => [t.id, permissaoDe(data, t.id)])) as Mapa);
  }, [data]);
  const salvar = useMutation({
    mutationFn: () => salvarPermissoes(membro.id, mapa!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: permissoesKeys.base }); onAviso(`Permissões de ${membro.name} salvas. Valem no próximo acesso dela.`); onClose(); },
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível salvar as permissões.', 'permissoes.salvar')),
  });
  const mudar = (id: ModuloPermissao, p: Partial<Permissao>) => setMapa((m) => (m ? { ...m, [id]: { ...m[id], ...p } } : m));
  const alternarCampo = (c: CampoCliente) => setMapa((m) => {
    if (!m) return m;
    const campos = m.clientes.campos.includes(c) ? m.clientes.campos.filter((x) => x !== c) : [...m.clientes.campos, c];
    return { ...m, clientes: { ...m.clientes, campos } };
  });

  return (
    <Modal titulo={`Permissões: ${membro.name}`} onClose={onClose} largura="md:max-w-[760px]"
      rodape={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 text-sm hover:bg-slate-100">Cancelar</button>
        <button type="button" disabled={!mapa || salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm disabled:opacity-60">{salvar.isPending ? 'Salvando...' : 'Salvar permissões'}</button></div>}>
      {error ? <p className="text-sm text-rose-600">{mensagemDeErro(error, 'Não foi possível carregar as permissões.', 'permissoes.ler')}</p>
        : isLoading || !mapa ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-rose-500" /></div>
          : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">O banco confere cada permissão: o que estiver sem acesso some do menu e fica bloqueado mesmo por fora da tela. Configurações é sempre da própria profissional (preferências dela).</p>
              {TELAS_PERMISSAO.map((t) => {
                const p = mapa[t.id];
                return (
                  <section key={t.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-800 text-sm">{t.rotulo}</h4>
                        <p className="text-[11px] text-slate-500">{t.dica}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select value={p.nivel} onChange={(e) => mudar(t.id, { nivel: e.target.value as Permissao['nivel'] })} aria-label={`Acesso a ${t.rotulo}`}
                          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white">
                          {t.niveis.map((n) => <option key={n} value={n}>{n === 'editar' && t.niveis.length === 2 ? 'Com acesso' : ROTULO_NIVEL[n]}</option>)}
                        </select>
                        {t.alcance && (
                          <select value={p.alcance} disabled={p.nivel === 'nenhum'} onChange={(e) => mudar(t.id, { alcance: e.target.value as Permissao['alcance'] })} aria-label={`Alcance em ${t.rotulo}`}
                            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white disabled:opacity-40">
                            {(['proprio', 'todos'] as const).map((a) => <option key={a} value={a}>{ROTULO_ALCANCE[a]}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                    {t.id === 'clientes' && p.nivel !== 'nenhum' && (
                      <fieldset className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                        <legend className="text-[11px] font-bold text-slate-500 mb-1">Dados das clientes além do nome</legend>
                        {CAMPOS_CLIENTE.map((c) => (
                          <label key={c.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                            <input type="checkbox" checked={p.campos.includes(c.id)} onChange={() => alternarCampo(c.id)} className="w-4 h-4 accent-rose-600" /> {c.rotulo}
                          </label>
                        ))}
                      </fieldset>
                    )}
                  </section>
                );
              })}
              <p className="text-[11px] text-slate-500">Resumo, Leads, Serviços, Finanças, Pagamentos, PDV, Pacotes e Profissionais seguem só com a administradora até a próxima etapa, quando ganham a mesma checagem no banco.</p>
              {erro && <p role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{erro}</p>}
            </div>
          )}
    </Modal>
  );
}

/** Histórico de ações da profissional (agenda e clientes), só para a administradora. */
export function HistoricoProfissional({ membro, onClose }: { membro: { id: string; name: string }; onClose: () => void }) {
  const { data = [], isLoading, error } = useQuery({ queryKey: permissoesKeys.historico(membro.id), queryFn: () => historicoDe(membro.id) });
  return (
    <Modal titulo={`Histórico: ${membro.name}`} onClose={onClose}>
      {error ? <p className="text-sm text-rose-600">{mensagemDeErro(error, 'Não foi possível carregar o histórico.', 'permissoes.historico')}</p>
        : isLoading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-rose-500" /></div>
          : data.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Nenhuma ação registrada.</p>
            : (
              <ul className="divide-y divide-slate-100">
                {data.map((a) => (
                  <li key={a.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                    <span><span className="text-[10px] font-bold uppercase text-slate-400 mr-2">{a.tela === 'agenda' ? 'Agenda' : 'Clientes'}</span>{descreverAcao(a, dataHoraBR)}</span>
                    <span className="text-xs text-slate-500 whitespace-nowrap">{dataHoraBR(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
      <p className="text-[11px] text-slate-500 mt-3">Registra o que a profissional criou, alterou ou excluiu na Agenda e em Clientes (últimas 200 ações), sem dados pessoais das clientes.</p>
    </Modal>
  );
}
