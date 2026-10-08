import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Info, Loader2, Plus, Power, ShieldAlert, SlidersHorizontal, Trash2 } from 'lucide-react';
import * as api from '../features/admin-global/api';
import {
  dataLocal, lerLimite, validarEdicao, validarNovoEstabelecimento,
  type EdicaoEstabelecimento, type EstabelecimentoGlobal, type NovoEstabelecimento,
} from '../features/admin-global/logic';
import { LIMITES_PADRAO, PLANOS, ROTULO_PLANO, ROTULO_SITUACAO, demoExpirada, usoLimite, type Plano, type Situacao } from '../features/plano/plano';
import { confirmarCodigo, fatoresTotp, mensagemMfa, nivelMfa } from '../features/acesso/mfa';
import { CampoCodigo } from '../components/SegurancaMfa';
import { Aviso, Campo, Confirmar, Modal, inputCls } from '../components/ui';
import { Rodape } from '../features/kanban/components/janelas';
import { mensagemDeErro } from '../lib/seguranca/erros';

const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const SELO: Record<Situacao, string> = {
  ativo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  desativado: 'bg-amber-50 text-amber-700 border-amber-200',
  excluido: 'bg-red-50 text-red-700 border-red-200',
};

// -----------------------------------------------------------------------------
// Segundo fator: o painel só abre com a sessão em aal2 (o banco confere de novo).
// -----------------------------------------------------------------------------
function useNivelMfa() {
  const [estado, setEstado] = useState<'carregando' | 'aal2' | 'confirmar' | 'cadastrar' | 'erro'>('carregando');
  const [fatorId, setFatorId] = useState<string | null>(null);
  const conferir = useCallback(async () => {
    try {
      const { atual } = await nivelMfa();
      if (atual === 'aal2') return setEstado('aal2');
      const ativo = (await fatoresTotp()).find((f) => f.verificado);
      setFatorId(ativo?.id ?? null);
      setEstado(ativo ? 'confirmar' : 'cadastrar');
    } catch {
      setEstado('erro');
    }
  }, []);
  useEffect(() => { void conferir(); }, [conferir]);
  return { estado, fatorId, conferir };
}

export default function AdminGlobal() {
  const mfa = useNivelMfa();
  const [erroMfa, setErroMfa] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cabecalho = (
    <div>
      <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2"><Building2 className="text-rose-600" /> Administração global</h2>
      <p className="text-sm text-slate-500 mt-1">Estabelecimentos, planos, limites e situação.</p>
    </div>
  );

  if (mfa.estado === 'carregando') return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-rose-500" size={32} /></div>;
  if (mfa.estado !== 'aal2') {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        {cabecalho}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <p className="flex items-center gap-2 font-bold text-slate-800"><ShieldAlert size={18} className="text-rose-600" /> Confirme o segundo fator</p>
          {mfa.estado === 'confirmar' && mfa.fatorId ? (
            <>
              <p className="text-sm text-slate-600">A administração global exige a verificação em duas etapas nesta sessão. Digite o código do seu aplicativo autenticador.</p>
              <CampoCodigo ocupado={ocupado} onConfirmar={async (codigo) => {
                setOcupado(true); setErroMfa(null);
                try { await confirmarCodigo(mfa.fatorId!, codigo); await mfa.conferir(); }
                catch (e) { setErroMfa(mensagemMfa((e as { code?: string })?.code) ?? mensagemDeErro(e, 'Não foi possível conferir o código.', 'mfa')); }
                finally { setOcupado(false); }
              }} />
            </>
          ) : mfa.estado === 'cadastrar' ? (
            <p className="text-sm text-slate-600">
              Ative a verificação em duas etapas em <Link to="/configuracoes#seguranca" className="font-bold text-rose-600 underline">Configurações</Link> e volte aqui.
            </p>
          ) : (
            <p className="text-sm text-slate-600">Não foi possível conferir a verificação em duas etapas. Recarregue a página.</p>
          )}
          {erroMfa && <p role="alert" className="text-sm text-rose-600">{erroMfa}</p>}
        </section>
      </div>
    );
  }
  return <Painel cabecalho={cabecalho} />;
}

// -----------------------------------------------------------------------------
// Painel
// -----------------------------------------------------------------------------
function Painel({ cabecalho }: { cabecalho: React.ReactNode }) {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: api.chaveEstabelecimentos, queryFn: api.listarEstabelecimentos });
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<EstabelecimentoGlobal | null>(null);
  const [mudarSituacao, setMudarSituacao] = useState<{ e: EstabelecimentoGlobal; para: Situacao } | null>(null);
  const [excluindo, setExcluindo] = useState<EstabelecimentoGlobal | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const atualizar = () => qc.invalidateQueries({ queryKey: api.chaveEstabelecimentos });

  const situacao = useMutation({
    mutationFn: ({ e, para }: { e: EstabelecimentoGlobal; para: Situacao }) =>
      api.atualizarEstabelecimento(e.id, edicaoDe(e, { status: para })),
    onSuccess: async (_d, v) => { await atualizar(); setAviso(v.para === 'ativo' ? 'Estabelecimento reativado.' : v.para === 'excluido' ? 'Estabelecimento excluído (dados guardados).' : 'Estabelecimento desativado.'); },
    onError: (e) => setAviso(mensagemDeErro(e, 'Não foi possível alterar a situação.', 'admin_global')),
    onSettled: () => { setMudarSituacao(null); setExcluindo(null); },
  });

  const acoes = (e: EstabelecimentoGlobal) => (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={() => setEditando(e)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50">
        <SlidersHorizontal size={13} /> Plano e limites
      </button>
      {!e.proprio && (e.status === 'ativo' ? (
        <button type="button" onClick={() => setMudarSituacao({ e, para: 'desativado' })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs font-bold text-amber-700 hover:bg-amber-50">
          <Power size={13} /> Desativar
        </button>
      ) : (
        <button type="button" onClick={() => setMudarSituacao({ e, para: 'ativo' })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
          <Power size={13} /> Reativar
        </button>
      ))}
      {!e.proprio && e.status !== 'excluido' && (
        <button type="button" onClick={() => setExcluindo(e)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50">
          <Trash2 size={13} /> Excluir
        </button>
      )}
    </div>
  );

  const plano = (e: EstabelecimentoGlobal) => (
    <div>
      <p className="font-semibold text-slate-800">{ROTULO_PLANO[e.plano]}</p>
      {e.plano === 'demonstracao' && e.demo_expira_em && (
        demoExpirada(e)
          ? <p className="text-xs font-bold text-red-600">terminou em {dataBR(e.demo_expira_em)}</p>
          : <p className="text-xs text-slate-500">até {dataBR(e.demo_expira_em)}</p>
      )}
    </div>
  );
  const selo = (s: Situacao) => <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border ${SELO[s]}`}>{ROTULO_SITUACAO[s]}</span>;
  const ilimitado = (e: EstabelecimentoGlobal, v: number | null) => (e.plano === 'premium' ? null : v);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        {cabecalho}
        <button type="button" onClick={() => setNovo(true)} className="self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-sm shadow-sm">
          <Plus size={18} /> Novo estabelecimento
        </button>
      </div>
      <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex gap-2">
        <Info size={18} className="text-rose-600 shrink-0 mt-0.5" />
        Aqui você gerencia contas, planos e limites. Os dados de cada estabelecimento ficam isolados no banco e não aparecem para a administração global.
      </p>

      {lista.isLoading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-rose-500" size={28} /></div>
        : lista.isError ? <p className="text-sm text-rose-600">{mensagemDeErro(lista.error, 'Não foi possível carregar os estabelecimentos.', 'admin_global')}</p>
        : (
          <>
            {/* PC: tabela */}
            <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-3 font-bold">Estabelecimento</th>
                    <th className="px-4 py-3 font-bold">Plano</th>
                    <th className="px-4 py-3 font-bold">Situação</th>
                    <th className="px-4 py-3 font-bold text-right">Profissionais</th>
                    <th className="px-4 py-3 font-bold text-right">Clientes</th>
                    <th className="px-4 py-3 font-bold">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(lista.data ?? []).map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-800">{e.nome}{e.proprio && <span className="ml-1.5 text-[11px] font-bold text-rose-600">(o seu)</span>}</p>
                        <p className="text-xs text-slate-500">criado em {dataBR(e.created_at)} · {e.administradoras} {e.administradoras === 1 ? 'administradora' : 'administradoras'}</p>
                      </td>
                      <td className="px-4 py-3">{plano(e)}</td>
                      <td className="px-4 py-3">{selo(e.status)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{usoLimite(e.profissionais, ilimitado(e, e.max_profissionais))}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{usoLimite(e.clientes, ilimitado(e, e.max_clientes))}</td>
                      <td className="px-4 py-3">{acoes(e)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Celular: cartões */}
            <div className="md:hidden space-y-3">
              {(lista.data ?? []).map((e) => (
                <div key={e.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 truncate">{e.nome}{e.proprio && <span className="ml-1.5 text-[11px] font-bold text-rose-600">(o seu)</span>}</p>
                      <p className="text-xs text-slate-500">criado em {dataBR(e.created_at)}</p>
                    </div>
                    {selo(e.status)}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>{plano(e)}</div>
                    <div><p className="text-slate-400">Profissionais</p><p className="font-bold tabular-nums">{usoLimite(e.profissionais, ilimitado(e, e.max_profissionais))}</p></div>
                    <div><p className="text-slate-400">Clientes</p><p className="font-bold tabular-nums">{usoLimite(e.clientes, ilimitado(e, e.max_clientes))}</p></div>
                  </div>
                  {acoes(e)}
                </div>
              ))}
            </div>
          </>
        )}

      {novo && <NovoModal onClose={() => setNovo(false)} onCriado={async () => { await atualizar(); setAviso('Estabelecimento criado. A administradora recebeu o convite por e-mail para definir a senha.'); }} />}
      {editando && <EditarModal estabelecimento={editando} onClose={() => setEditando(null)} onSalvo={async () => { await atualizar(); setAviso('Plano e limites salvos.'); }} />}
      {mudarSituacao && (
        <Confirmar
          titulo={mudarSituacao.para === 'ativo' ? 'Reativar estabelecimento' : 'Desativar estabelecimento'}
          texto={mudarSituacao.para === 'ativo'
            ? `"${mudarSituacao.e.nome}" volta a ter acesso na hora, com os dados como estavam.`
            : `Ninguém de "${mudarSituacao.e.nome}" entra mais no sistema a partir de agora (o bloqueio vale no banco). Os dados ficam guardados e dá para reativar.`}
          botao={mudarSituacao.para === 'ativo' ? 'Reativar' : 'Desativar'}
          ocupado={situacao.isPending}
          onConfirmar={() => situacao.mutate(mudarSituacao)}
          onCancelar={() => setMudarSituacao(null)}
        />
      )}
      {excluindo && <ExcluirModal estabelecimento={excluindo} ocupado={situacao.isPending} onClose={() => setExcluindo(null)} onConfirmar={() => situacao.mutate({ e: excluindo, para: 'excluido' })} />}
      <Aviso texto={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}

function edicaoDe(e: EstabelecimentoGlobal, mudar: Partial<EdicaoEstabelecimento> = {}): EdicaoEstabelecimento {
  return {
    nome: e.nome, plano: e.plano, status: e.status, demo_expira_em: dataLocal(e.demo_expira_em),
    max_profissionais: e.max_profissionais, max_clientes: e.max_clientes, ...mudar,
  };
}

// -----------------------------------------------------------------------------
// Janelas
// -----------------------------------------------------------------------------
function BotoesPlano({ valor, onChange }: { valor: Plano; onChange: (p: Plano) => void }) {
  return (
    <div role="radiogroup" aria-label="Plano" className="grid grid-cols-3 gap-2">
      {PLANOS.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={valor === p} onClick={() => onChange(p)}
          className={`py-2.5 rounded-lg border text-xs font-bold ${valor === p ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-white border-slate-200 text-slate-600'}`}>
          {ROTULO_PLANO[p]}
        </button>
      ))}
    </div>
  );
}

function CamposLimites({ prof, cli, onProf, onCli, premium }: { prof: string; cli: string; onProf: (v: string) => void; onCli: (v: string) => void; premium: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Campo rotulo="Máx. de profissionais" dica={premium ? 'Premium não tem limite.' : 'Vazio = sem limite.'}>
        <input type="number" min={0} max={10000} inputMode="numeric" disabled={premium} value={premium ? '' : prof} onChange={(e) => onProf(e.target.value)} className={inputCls} />
      </Campo>
      <Campo rotulo="Máx. de clientes" dica={premium ? 'Premium não tem limite.' : 'Vazio = sem limite.'}>
        <input type="number" min={0} max={1000000} inputMode="numeric" disabled={premium} value={premium ? '' : cli} onChange={(e) => onCli(e.target.value)} className={inputCls} />
      </Campo>
    </div>
  );
}

const textoLimite = (v: number | null) => (v === null ? '' : String(v));

function NovoModal({ onClose, onCriado }: { onClose: () => void; onCriado: () => Promise<void> }) {
  const [nome, setNome] = useState('');
  const [plano, setPlano] = useState<Plano>('demonstracao');
  const [prof, setProf] = useState(textoLimite(LIMITES_PADRAO.demonstracao.max_profissionais));
  const [cli, setCli] = useState(textoLimite(LIMITES_PADRAO.demonstracao.max_clientes));
  const [admNome, setAdmNome] = useState('');
  const [admEmail, setAdmEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const trocarPlano = (p: Plano) => { setPlano(p); setProf(textoLimite(LIMITES_PADRAO[p].max_profissionais)); setCli(textoLimite(LIMITES_PADRAO[p].max_clientes)); };

  const salvar = async () => {
    const dados: NovoEstabelecimento = {
      nome, plano, admin_nome: admNome, admin_email: admEmail,
      max_profissionais: plano === 'premium' ? null : lerLimite(prof), max_clientes: plano === 'premium' ? null : lerLimite(cli),
    };
    const e = validarNovoEstabelecimento(dados);
    if (e) return setErro(e);
    setOcupado(true); setErro(null);
    try { await api.criarEstabelecimento(dados); await onCriado(); onClose(); }
    catch (err) { setErro(mensagemDeErro(err, 'Não foi possível criar o estabelecimento.', 'admin_global')); }
    finally { setOcupado(false); }
  };

  return (
    <Modal titulo="Novo estabelecimento" onClose={onClose} rodape={<Rodape onFechar={onClose} onSalvar={salvar} ocupado={ocupado} erro={erro} textoSalvar="CRIAR" />}>
      <div className="space-y-4">
        <Campo rotulo="Nome do estabelecimento" obrigatorio><input autoFocus value={nome} maxLength={200} onChange={(e) => setNome(e.target.value)} className={inputCls} /></Campo>
        <div><span className="block text-xs font-bold text-slate-500 mb-2">Plano</span><BotoesPlano valor={plano} onChange={trocarPlano} />
          {plano === 'demonstracao' && <p className="mt-1.5 text-[11px] text-slate-500">Demonstração de 30 dias com acesso completo.</p>}</div>
        <CamposLimites prof={prof} cli={cli} onProf={setProf} onCli={setCli} premium={plano === 'premium'} />
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Primeira administradora</p>
          <Campo rotulo="Nome" obrigatorio><input value={admNome} maxLength={200} onChange={(e) => setAdmNome(e.target.value)} className={inputCls} /></Campo>
          <Campo rotulo="E-mail (conta de login)" obrigatorio dica="Ela recebe um convite por e-mail e define a própria senha. A administração global não define senha nem ganha acesso ao estabelecimento.">
            <input type="email" value={admEmail} maxLength={200} onChange={(e) => setAdmEmail(e.target.value)} className={inputCls} />
          </Campo>
        </div>
      </div>
    </Modal>
  );
}

function EditarModal({ estabelecimento, onClose, onSalvo }: { estabelecimento: EstabelecimentoGlobal; onClose: () => void; onSalvo: () => Promise<void> }) {
  const [d, setD] = useState<EdicaoEstabelecimento>(() => edicaoDe(estabelecimento));
  const [prof, setProf] = useState(textoLimite(estabelecimento.max_profissionais));
  const [cli, setCli] = useState(textoLimite(estabelecimento.max_clientes));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const trocarPlano = (p: Plano) => {
    setD((x) => ({ ...x, plano: p, demo_expira_em: p === 'demonstracao' ? (x.demo_expira_em ?? dataLocal(new Date(Date.now() + 30 * 86_400_000).toISOString())) : x.demo_expira_em }));
    if (p !== estabelecimento.plano) { setProf(textoLimite(LIMITES_PADRAO[p].max_profissionais)); setCli(textoLimite(LIMITES_PADRAO[p].max_clientes)); }
  };
  const salvar = async () => {
    const dados: EdicaoEstabelecimento = {
      ...d,
      max_profissionais: d.plano === 'premium' ? null : lerLimite(prof),
      max_clientes: d.plano === 'premium' ? null : lerLimite(cli),
    };
    const e = validarEdicao(dados);
    if (e) return setErro(e);
    setOcupado(true); setErro(null);
    try { await api.atualizarEstabelecimento(estabelecimento.id, dados); await onSalvo(); onClose(); }
    catch (err) { setErro(mensagemDeErro(err, 'Não foi possível salvar.', 'admin_global')); }
    finally { setOcupado(false); }
  };
  return (
    <Modal titulo={`Plano e limites: ${estabelecimento.nome}`} onClose={onClose} rodape={<Rodape onFechar={onClose} onSalvar={salvar} ocupado={ocupado} erro={erro} />}>
      <div className="space-y-4">
        <Campo rotulo="Nome do estabelecimento" obrigatorio><input value={d.nome} maxLength={200} onChange={(e) => setD({ ...d, nome: e.target.value })} className={inputCls} /></Campo>
        <div><span className="block text-xs font-bold text-slate-500 mb-2">Plano</span><BotoesPlano valor={d.plano} onChange={trocarPlano} /></div>
        {d.plano === 'demonstracao' && (
          <Campo rotulo="Fim da demonstração" obrigatorio dica="Vale até o fim do dia (horário de Brasília).">
            <input type="date" value={d.demo_expira_em ?? ''} onChange={(e) => setD({ ...d, demo_expira_em: e.target.value || null })} className={inputCls} />
          </Campo>
        )}
        <CamposLimites prof={prof} cli={cli} onProf={setProf} onCli={setCli} premium={d.plano === 'premium'} />
      </div>
    </Modal>
  );
}

/** Exclusão lógica com confirmação digitada (EXCLUIR). */
function ExcluirModal({ estabelecimento, ocupado, onClose, onConfirmar }: { estabelecimento: EstabelecimentoGlobal; ocupado: boolean; onClose: () => void; onConfirmar: () => void }) {
  const [texto, setTexto] = useState('');
  const ok = texto.trim() === 'EXCLUIR';
  return (
    <Modal titulo="Excluir estabelecimento" onClose={onClose}
      rodape={<Rodape onFechar={onClose} onSalvar={() => { if (ok) onConfirmar(); }} ocupado={ocupado} textoSalvar="EXCLUIR" erro={null} />}>
      <div className="space-y-3 text-sm text-slate-700">
        <p>O acesso de <strong>{estabelecimento.nome}</strong> acaba na hora. Os dados ficam guardados e o estabelecimento pode ser reativado.</p>
        <Campo rotulo='Para confirmar, digite EXCLUIR'>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} className={inputCls} aria-label="Confirmação" />
        </Campo>
        {!ok && texto && <p className="text-xs text-slate-500">Digite exatamente EXCLUIR.</p>}
      </div>
    </Modal>
  );
}
