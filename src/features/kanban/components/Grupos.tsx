import React, { useState } from 'react';
import { LIMITES, validarNomeGrupo, type Grupo, type Quadro } from '../logic';
import { mensagemErro } from '../api';
import { Rodape } from './janelas';
import { Campo, Modal, inputCls } from './ui';

/** Criar ou renomear grupo (organização pessoal da tela inicial). */
export function GrupoModal({ grupo, grupos, onClose, onSalvar }: {
  grupo?: Grupo; grupos: Grupo[]; onClose: () => void; onSalvar: (nome: string) => Promise<void>;
}) {
  const [nome, setNome] = useState(grupo?.nome ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    const e = validarNomeGrupo(nome, grupos, grupo?.id);
    if (e) { setErro(e); return; }
    setOcupado(true); setErro(null);
    try { await onSalvar(nome.trim()); onClose(); } catch (err) { setErro(mensagemErro(err)); } finally { setOcupado(false); }
  };
  return (
    <Modal titulo={grupo ? 'Renomear grupo' : 'Novo grupo'} onClose={onClose} largura="md:max-w-[440px]"
      rodape={<Rodape onFechar={onClose} onSalvar={salvar} ocupado={ocupado} erro={erro} />}>
      <form onSubmit={(e) => { e.preventDefault(); salvar(); }} className="space-y-3">
        <Campo rotulo="Nome do grupo" obrigatorio dica={`${LIMITES.nomeGrupo - nome.length} caracteres restantes`}>
          <input autoFocus type="text" maxLength={LIMITES.nomeGrupo} value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
        </Campo>
        <p className="text-xs text-slate-500">Só você vê os seus grupos. Eles aparecem nas visões do negócio e pessoal.</p>
      </form>
    </Modal>
  );
}

/** Colocar o quadro em um grupo, trocar de grupo ou tirar do grupo. */
export function GrupoDoQuadroModal({ quadro, grupos, grupoAtual, onClose, onSalvar, onNovoGrupo }: {
  quadro: Quadro; grupos: Grupo[]; grupoAtual: string | null;
  onClose: () => void; onSalvar: (grupoId: string | null) => Promise<void>; onNovoGrupo: () => void;
}) {
  const [grupoId, setGrupoId] = useState<string | null>(grupoAtual);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    setOcupado(true); setErro(null);
    try { await onSalvar(grupoId); onClose(); } catch (err) { setErro(mensagemErro(err)); } finally { setOcupado(false); }
  };
  return (
    <Modal titulo={`Grupo: ${quadro.nome}`} onClose={onClose} largura="md:max-w-[440px]"
      rodape={<Rodape onFechar={onClose} onSalvar={salvar} ocupado={ocupado} erro={erro} />}>
      <div className="space-y-3">
        {grupos.length === 0 ? (
          <p className="text-sm text-slate-600">Você ainda não tem grupos.</p>
        ) : (
          <Campo rotulo="Grupo">
            <select value={grupoId ?? ''} onChange={(e) => setGrupoId(e.target.value || null)} className={inputCls}>
              <option value="">Sem grupo</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </Campo>
        )}
        <button type="button" onClick={onNovoGrupo} className="text-xs font-bold tracking-wide text-rose-600 hover:text-rose-700">+ NOVO GRUPO</button>
      </div>
    </Modal>
  );
}
