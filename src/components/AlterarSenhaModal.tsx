import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { logger } from '../lib/seguranca/logger';
import { SENHA_MIN, mensagemErroAuth, validarNovaSenha, validarTrocaSenha } from '../lib/seguranca/senha';
import { Campo, Modal, inputCls } from '../features/kanban/components/ui';

/**
 * Troca de senha pelo próprio Supabase Auth (AUT-01): sem hash nem token próprios.
 * Exige a senha atual antes de trocar (AUT-07) e, depois da troca, encerra as
 * sessões dos outros aparelhos (SES-04). A senha nunca vai para log nem para a tela.
 *
 * obrigatoria: primeiro acesso com senha temporária criada pela administradora; a
 * janela não fecha até a troca (ou sair do sistema).
 * definir: primeiro acesso pelo convite por e-mail (nova administradora de um
 * estabelecimento). Não há senha atual: o link do e-mail é a comprovação.
 */
export default function AlterarSenhaModal({ onClose, obrigatoria = false, definir = false }: { onClose: () => void; obrigatoria?: boolean; definir?: boolean }) {
  const { user, signOut } = useAuth();
  const fechar = obrigatoria ? () => {} : onClose;
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [concluido, setConcluido] = useState(false);

  const traduzir = (e: { code?: string } | null | undefined, padrao: string) =>
    mensagemErroAuth(e?.code) ?? mensagemDeErro(e, padrao, 'alterar_senha');

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (ocupado) return;
    const problema = definir ? validarNovaSenha({ nova, confirmacao }) : validarTrocaSenha({ atual, nova, confirmacao });
    if (problema) return setErro(problema);
    if (!user?.email) return setErro('Sessão expirada. Entre novamente.');

    setOcupado(true);
    setErro(null);
    try {
      if (!definir) {
        // Reautenticação: confere a senha atual no Supabase Auth antes de trocar.
        const conferencia = await supabase.auth.signInWithPassword({ email: user.email, password: atual });
        if (conferencia.error) return setErro(traduzir(conferencia.error, 'Não foi possível conferir a senha atual.'));
      }

      // Também desmarca a troca obrigatória do primeiro acesso.
      const troca = await supabase.auth.updateUser({ password: nova, data: definir ? { definir_senha: false, trocar_senha: false } : { trocar_senha: false } });
      if (troca.error) return setErro(traduzir(troca.error, 'Não foi possível trocar a senha.'));

      // Quem estava logado em outro aparelho precisa entrar de novo com a senha nova.
      const outras = await supabase.auth.signOut({ scope: 'others' });
      if (outras.error) logger.warn('Falha ao encerrar as outras sessões após troca de senha', { codigo: outras.error.code });

      setAtual('');
      setNova('');
      setConfirmacao('');
      setConcluido(true);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível trocar a senha.', 'alterar_senha'));
    } finally {
      setOcupado(false);
    }
  };

  const tipo = mostrar ? 'text' : 'password';

  if (concluido) {
    return (
      <Modal titulo="Alterar senha" onClose={onClose}
        rodape={<button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm">Fechar</button>}>
        <p role="status" className="text-sm text-slate-700">
          Senha alterada. Os outros aparelhos conectados a esta conta vão pedir login de novo.
        </p>
      </Modal>
    );
  }

  return (
    <Modal titulo={obrigatoria ? 'Defina a sua senha' : 'Alterar senha'} onClose={fechar} semFechar={obrigatoria}
      rodape={
        <>
          {obrigatoria
            ? <button type="button" onClick={() => { void signOut(); }} className="px-4 py-2 rounded-lg text-slate-600 font-medium text-sm hover:bg-slate-100">Sair</button>
            : <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 font-medium text-sm hover:bg-slate-100">Cancelar</button>}
          <button type="submit" form="form-alterar-senha" disabled={ocupado} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm disabled:opacity-60">
            {ocupado ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </>
      }>
      <form id="form-alterar-senha" onSubmit={salvar} className="space-y-4" noValidate>
        {/* Ajuda os gerenciadores de senha a associar a conta */}
        <input type="email" name="email" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
        {obrigatoria && (
          <p className="text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            {definir
              ? 'Bem-vinda! Crie a sua senha para entrar no sistema das próximas vezes.'
              : 'Primeiro acesso: troque a senha temporária que recebeu por uma senha só sua para continuar.'}
          </p>
        )}
        {!definir && (
          <Campo rotulo={obrigatoria ? 'Senha temporária' : 'Senha atual'} obrigatorio>
            <input type={tipo} autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} className={inputCls} autoFocus />
          </Campo>
        )}
        <Campo rotulo="Nova senha" obrigatorio dica={`Pelo menos ${SENHA_MIN} caracteres. Uma frase longa é fácil de lembrar e difícil de adivinhar.`}>
          <input type={tipo} autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo="Confirme a nova senha" obrigatorio>
          <input type={tipo} autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className={inputCls} />
        </Campo>
        <button type="button" onClick={() => setMostrar((m) => !m)} className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-700">
          {mostrar ? <EyeOff size={14} /> : <Eye size={14} />} {mostrar ? 'Ocultar senhas' : 'Mostrar senhas'}
        </button>
        {erro && <p role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{erro}</p>}
      </form>
    </Modal>
  );
}
