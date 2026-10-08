import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Copy, KeyRound, Loader2, Plus, Search, ShieldCheck, ShieldOff, UserCog, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { Aviso, Campo, Confirmar, Modal, inputCls } from '../components/ui';
import {
  ROTULO_CONTRATO, acaoDeAcesso, definirAtivo, equipeKeys, gerarSenhaTemporaria, listarEquipe, salvarMembro,
  type DadosMembro, type MembroEquipe, type ModeloContrato,
} from '../features/equipe/api';
import { ROTULO_PAPEL, type Papel } from '../features/acesso/modulos';
import { cnpjValido, cpfValido, formatarCnpj, formatarCpf, formatarTelefone, lerValor, pct, valorParaCampo } from '../lib/formatos';

type Filtro = 'ativos' | 'inativos' | 'todos';

const vazio: DadosMembro = {
  name: '', apelido: '', role: 'professional', email: '', telefone: '', cpf: '', cnpj: '', modelo_contrato: 'salao_parceiro',
  comissao_padrao_percentual: null, chave_pix: '', inicio_contrato: '', observacoes: '',
};

export default function Profissionais() {
  const queryClient = useQueryClient();
  const { perfil } = useAuth();
  const [filtro, setFiltro] = useState<Filtro>('ativos');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<MembroEquipe | 'novo' | null>(null);
  const [acesso, setAcesso] = useState<{ membro: MembroEquipe; modo: 'criar' | 'redefinir' } | null>(null);
  const [status, setStatus] = useState<{ membro: MembroEquipe; ativo: boolean } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const { data: equipe = [], isLoading, error } = useQuery({ queryKey: equipeKeys.lista, queryFn: listarEquipe });

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return equipe
      .filter((m) => (filtro === 'todos' ? true : filtro === 'ativos' ? m.active : !m.active))
      .filter((m) => !t || m.name.toLowerCase().includes(t) || (m.perfil?.cpf ?? '').includes(t.replace(/\D/g, '') || '###'));
  }, [equipe, filtro, busca]);

  const alterarStatus = useMutation({
    mutationFn: ({ membro, ativo }: { membro: MembroEquipe; ativo: boolean }) => definirAtivo(membro, ativo),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: equipeKeys.lista });
      setStatus(null);
      setAviso(v.ativo ? `${v.membro.name} reativado(a).` : `${v.membro.name} desativado(a): o acesso foi cortado na hora.`);
    },
    onError: (e) => { setStatus(null); setAviso(mensagemDeErro(e, 'Não foi possível alterar o status.', 'equipe.status')); },
  });

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2"><UserCog className="text-rose-600" /> Profissionais</h2>
          <p className="text-sm text-slate-500 mt-1">Equipe, acessos ao sistema, CPF, CNPJ/MEI e modelo de contrato.</p>
        </div>
        <button type="button" onClick={() => setEditando('novo')} className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm">
          <Plus size={18} /> Novo profissional
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF" aria-label="Buscar profissional"
            className="w-full border border-slate-200 bg-white pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rose-500" />
        </div>
        <div className="bg-slate-200 p-0.5 rounded-xl flex" role="tablist" aria-label="Filtrar por status">
          {(['ativos', 'inativos', 'todos'] as Filtro[]).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filtro === f} onClick={() => setFiltro(f)}
              className={`px-3 py-2 rounded-lg text-xs font-bold capitalize ${filtro === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600'}`}>{f}</button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-rose-500" size={32} /></div>
      ) : error ? (
        <p className="text-sm text-rose-600">{mensagemDeErro(error, 'Não foi possível carregar a equipe.', 'equipe.lista')}</p>
      ) : lista.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">Nenhum profissional neste filtro.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((m) => {
            const p = m.perfil;
            const semCnpj = (p?.modelo_contrato ?? 'salao_parceiro') === 'salao_parceiro' && !p?.cnpj && m.role === 'professional';
            const eu = m.id === perfil?.id;
            return (
              <article key={m.id} className={`bg-white rounded-2xl border shadow-sm p-4 flex flex-col gap-3 ${m.active ? 'border-slate-200' : 'border-slate-200 opacity-70'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-800 truncate">{m.name}{eu && <span className="text-xs text-slate-400 font-medium"> (você)</span>}</h3>
                    {m.apelido && <p className="text-xs text-slate-500 truncate">Na agenda: <strong>{m.apelido}</strong></p>}
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.role === 'admin' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{ROTULO_PAPEL[m.role]}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{m.active ? 'Ativo' : 'Inativo'}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.auth_id ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>{m.auth_id ? 'Com acesso' : 'Sem acesso ao sistema'}</span>
                    </div>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-slate-400">CPF</dt><dd className="text-slate-700 text-right">{p?.cpf ? formatarCpf(p.cpf) : '-'}</dd>
                  <dt className="text-slate-400">CNPJ/MEI</dt><dd className="text-slate-700 text-right">{p?.cnpj ? formatarCnpj(p.cnpj) : '-'}</dd>
                  <dt className="text-slate-400">Contrato</dt><dd className="text-slate-700 text-right truncate">{p ? ROTULO_CONTRATO[p.modelo_contrato].split(' (')[0] : '-'}</dd>
                  <dt className="text-slate-400">Comissão padrão</dt><dd className="text-slate-700 text-right">{p?.comissao_padrao_percentual != null ? pct(p.comissao_padrao_percentual) : 'por serviço'}</dd>
                  <dt className="text-slate-400">Serviços habilitados</dt><dd className="text-slate-700 text-right">{m.qtd_servicos}</dd>
                </dl>
                {semCnpj && (
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                    <AlertTriangle size={14} className="shrink-0 mt-px" /> Salão parceiro sem CNPJ/MEI cadastrado. Confira a formalização do contrato de parceria.
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-auto pt-1">
                  <button type="button" onClick={() => setEditando(m)} className="flex-1 min-w-[90px] text-xs font-bold border border-slate-200 rounded-lg py-2 hover:bg-slate-50">Editar perfil</button>
                  <button type="button" onClick={() => setAcesso({ membro: m, modo: m.auth_id ? 'redefinir' : 'criar' })} disabled={!m.active}
                    className="flex-1 min-w-[90px] flex items-center justify-center gap-1 text-xs font-bold border border-indigo-200 text-indigo-700 rounded-lg py-2 hover:bg-indigo-50 disabled:opacity-40">
                    {m.auth_id ? <><KeyRound size={14} /> Redefinir senha</> : <><UserPlus size={14} /> Criar acesso</>}
                  </button>
                  {!eu && (
                    <button type="button" onClick={() => setStatus({ membro: m, ativo: !m.active })}
                      className={`flex-1 min-w-[90px] flex items-center justify-center gap-1 text-xs font-bold rounded-lg py-2 border ${m.active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>
                      {m.active ? <><ShieldOff size={14} /> Desativar</> : <><ShieldCheck size={14} /> Reativar</>}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editando && (
        <EditarMembro
          membro={editando === 'novo' ? null : editando}
          onClose={() => setEditando(null)}
          onSalvo={(novo) => {
            queryClient.invalidateQueries({ queryKey: equipeKeys.lista });
            queryClient.invalidateQueries({ queryKey: equipeKeys.ativos });
            setEditando(null);
            setAviso(novo ? 'Profissional cadastrado. Use "Criar acesso" para liberar o login.' : 'Perfil salvo.');
          }}
        />
      )}
      {acesso && (
        <AcessoModal
          membro={acesso.membro}
          modo={acesso.modo}
          onClose={() => setAcesso(null)}
          onFeito={(msg) => { queryClient.invalidateQueries({ queryKey: equipeKeys.lista }); setAcesso(null); setAviso(msg); }}
        />
      )}
      {status && (
        <Confirmar
          titulo={status.ativo ? 'Reativar profissional?' : 'Desativar profissional?'}
          texto={status.ativo
            ? `${status.membro.name} volta a acessar o sistema e a aparecer na agenda.`
            : `${status.membro.name} perde o acesso na hora (login bloqueado e dados fechados pelo banco). O histórico de atendimentos e comissões é mantido.`}
          botao={status.ativo ? 'Reativar' : 'Desativar'}
          ocupado={alterarStatus.isPending}
          onCancelar={() => setStatus(null)}
          onConfirmar={() => alterarStatus.mutate(status)}
        />
      )}
      <Aviso texto={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}

function EditarMembro({ membro, onClose, onSalvo }: { membro: MembroEquipe | null; onClose: () => void; onSalvo: (novo: boolean) => void }) {
  const { perfil: eu } = useAuth();
  const p = membro?.perfil;
  const [d, setD] = useState<DadosMembro>(() => membro ? {
    name: membro.name, apelido: membro.apelido ?? '', role: membro.role,
    email: p?.email ?? '', telefone: formatarTelefone(p?.telefone), cpf: formatarCpf(p?.cpf), cnpj: formatarCnpj(p?.cnpj),
    modelo_contrato: p?.modelo_contrato ?? 'salao_parceiro', comissao_padrao_percentual: p?.comissao_padrao_percentual ?? null,
    chave_pix: p?.chave_pix ?? '', inicio_contrato: p?.inicio_contrato ?? '', observacoes: p?.observacoes ?? '',
  } : vazio);
  const [comissao, setComissao] = useState(valorParaCampo(d.comissao_padrao_percentual));
  const [erro, setErro] = useState<string | null>(null);
  const set = <K extends keyof DadosMembro>(k: K, v: DadosMembro[K]) => setD((x) => ({ ...x, [k]: v }));

  const salvar = useMutation({
    mutationFn: (dados: DadosMembro) => salvarMembro(membro?.id ?? null, dados),
    onSuccess: () => onSalvo(!membro),
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível salvar.', 'equipe.salvar')),
  });

  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (d.name.trim().length < 2) return setErro('Informe o nome.');
    if (d.apelido.trim().length > 40) return setErro('Apelido com no máximo 40 caracteres.');
    if (d.cpf && !cpfValido(d.cpf)) return setErro('CPF inválido. Confira os dígitos.');
    if (d.cnpj && !cnpjValido(d.cnpj)) return setErro('CNPJ/MEI inválido. Confira os dígitos.');
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) return setErro('E-mail inválido.');
    const pctNum = comissao.trim() ? lerValor(comissao) : null;
    if (comissao.trim() && (pctNum === null || pctNum > 100)) return setErro('Comissão padrão deve ser entre 0 e 100%.');
    if (membro && membro.id === eu?.id && d.role !== 'admin') return setErro('Você não pode remover o seu próprio papel de administradora.');
    setErro(null);
    salvar.mutate({ ...d, comissao_padrao_percentual: pctNum });
  };

  return (
    <Modal titulo={membro ? `Editar: ${membro.name}` : 'Novo profissional'} onClose={onClose} largura="md:max-w-[760px]"
      rodape={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 font-medium text-sm hover:bg-slate-100">Cancelar</button>
          <button type="submit" form="form-membro" disabled={salvar.isPending} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm disabled:opacity-60">
            {salvar.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      }>
      <form id="form-membro" onSubmit={enviar} className="space-y-5" noValidate>
        <fieldset className="grid sm:grid-cols-2 gap-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Identificação</legend>
          <Campo rotulo="Nome completo" obrigatorio><input value={d.name} onChange={(e) => set('name', e.target.value)} className={inputCls} maxLength={120} autoFocus /></Campo>
          <Campo rotulo="Apelido (nome na agenda)" dica="Como aparece na agenda e nos filtros. Em branco, usa o nome completo.">
            <input value={d.apelido} onChange={(e) => set('apelido', e.target.value)} className={inputCls} maxLength={40} placeholder="Ex.: Jake" />
          </Campo>
          <Campo rotulo="Papel no sistema" obrigatorio>
            <select value={d.role} onChange={(e) => set('role', e.target.value as Papel)} className={inputCls}>
              <option value="professional">{ROTULO_PAPEL.professional}</option>
              <option value="admin">{ROTULO_PAPEL.admin}</option>
            </select>
          </Campo>
          <Campo rotulo="CPF" dica="Único por profissional (evita cadastro duplicado)."><input inputMode="numeric" value={d.cpf ?? ''} onChange={(e) => set('cpf', formatarCpf(e.target.value))} className={inputCls} placeholder="000.000.000-00" /></Campo>
          <Campo rotulo="CNPJ / MEI" dica="Recomendado no contrato de salão parceiro."><input inputMode="numeric" value={d.cnpj ?? ''} onChange={(e) => set('cnpj', formatarCnpj(e.target.value))} className={inputCls} placeholder="00.000.000/0000-00" /></Campo>
          <Campo rotulo="Telefone"><input inputMode="tel" value={d.telefone ?? ''} onChange={(e) => set('telefone', formatarTelefone(e.target.value))} className={inputCls} placeholder="(11) 99999-9999" /></Campo>
          <Campo rotulo="E-mail"><input type="email" value={d.email ?? ''} onChange={(e) => set('email', e.target.value)} className={inputCls} maxLength={254} /></Campo>
        </fieldset>
        <fieldset className="grid sm:grid-cols-2 gap-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Contrato e divisão de lucros</legend>
          <Campo rotulo="Modelo de contrato" obrigatorio>
            <select value={d.modelo_contrato} onChange={(e) => set('modelo_contrato', e.target.value as ModeloContrato)} className={inputCls}>
              {(Object.keys(ROTULO_CONTRATO) as ModeloContrato[]).map((k) => <option key={k} value={k}>{ROTULO_CONTRATO[k]}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Início do contrato"><input type="date" value={d.inicio_contrato ?? ''} onChange={(e) => set('inicio_contrato', e.target.value)} className={inputCls} /></Campo>
          <Campo rotulo="Comissão padrão do profissional (%)" dica="Taxa fixa para todos os serviços. Deixe vazio para usar a comissão de cada serviço. Ex.: 60 = 60% profissional / 40% salão.">
            <input inputMode="decimal" value={comissao} onChange={(e) => setComissao(e.target.value)} className={inputCls} placeholder="Ex.: 60" />
          </Campo>
          <Campo rotulo="Chave PIX para repasse"><input value={d.chave_pix ?? ''} onChange={(e) => set('chave_pix', e.target.value)} className={inputCls} maxLength={140} /></Campo>
          <div className="sm:col-span-2">
            <Campo rotulo="Observações internas"><textarea value={d.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} className={`${inputCls} min-h-[80px]`} maxLength={2000} /></Campo>
          </div>
        </fieldset>
        {erro && <p role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{erro}</p>}
      </form>
    </Modal>
  );
}

function AcessoModal({ membro, modo, onClose, onFeito }: { membro: MembroEquipe; modo: 'criar' | 'redefinir'; onClose: () => void; onFeito: (msg: string) => void }) {
  const [email, setEmail] = useState(membro.perfil?.email ?? '');
  const [senha, setSenha] = useState(() => gerarSenhaTemporaria());
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const executar = useMutation({
    mutationFn: () => modo === 'criar'
      ? acaoDeAcesso({ acao: 'criar_acesso', user_id: membro.id, email: email.trim(), senha_temporaria: senha })
      : acaoDeAcesso({ acao: 'redefinir_senha', user_id: membro.id, senha_temporaria: senha }),
    onSuccess: () => onFeito(modo === 'criar'
      ? `Acesso criado para ${membro.name}. Entregue a senha temporária pessoalmente; no primeiro login a troca é obrigatória.`
      : `Senha de ${membro.name} redefinida. No próximo login a troca é obrigatória.`),
    onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível concluir.', 'equipe.acesso')),
  });

  const copiar = async () => {
    try { await navigator.clipboard.writeText(senha); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { setErro('Não foi possível copiar. Selecione e copie a senha manualmente.'); }
  };

  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (modo === 'criar' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErro('Informe um e-mail válido para o login.');
    if ([...senha].length < 12) return setErro('A senha temporária precisa ter pelo menos 12 caracteres.');
    setErro(null);
    executar.mutate();
  };

  return (
    <Modal titulo={modo === 'criar' ? `Criar acesso: ${membro.name}` : `Redefinir senha: ${membro.name}`} onClose={onClose}
      rodape={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 font-medium text-sm hover:bg-slate-100">Cancelar</button>
          <button type="submit" form="form-acesso" disabled={executar.isPending} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm disabled:opacity-60">
            {executar.isPending ? 'Enviando...' : modo === 'criar' ? 'Criar acesso' : 'Redefinir senha'}
          </button>
        </div>
      }>
      <form id="form-acesso" onSubmit={enviar} className="space-y-4" noValidate>
        {modo === 'criar' && (
          <Campo rotulo="E-mail de login" obrigatorio>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="off" maxLength={254} autoFocus />
          </Campo>
        )}
        <Campo rotulo="Senha temporária" obrigatorio composto dica="Entregue pessoalmente. No primeiro acesso o sistema obriga a troca por uma senha pessoal.">
          <div className="flex gap-2">
            <input value={senha} onChange={(e) => setSenha(e.target.value)} className={`${inputCls} font-mono`} autoComplete="off" spellCheck={false} aria-label="Senha temporária" />
            <button type="button" onClick={copiar} className="px-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold flex items-center gap-1" title="Copiar">
              <Copy size={14} /> {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <button type="button" onClick={() => setSenha(gerarSenhaTemporaria())} className="px-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold">Gerar</button>
          </div>
        </Campo>
        <p className="text-xs text-slate-500">
          O papel ({ROTULO_PAPEL[membro.role]}) e o status vêm do cadastro do profissional. O login é criado já confirmado, sem depender de e-mail.
        </p>
        {erro && <p role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{erro}</p>}
      </form>
    </Modal>
  );
}
