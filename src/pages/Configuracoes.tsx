import React, { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, LogOut, Moon, Settings, SlidersHorizontal, Sun, UserCircle } from 'lucide-react';
import AlterarSenhaModal from '../components/AlterarSenhaModal';
import { useTheme } from '../hooks/useTheme';
import { Chave, ConfigComissoes } from '../features/comissoes/ConfigComissoes';
import { useAuth } from '../contexts/AuthContext';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { GRUPOS, ROTULO_PAPEL, modulosDoPapel, type IdModulo } from '../features/acesso/modulos';
import { Aviso } from '../components/ui';

export default function Configuracoes() {
  const { perfil, user, salvarPreferencias, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const ehAdmin = perfil?.role === 'admin';

  // ---------------------------------------------------------------- interface
  const modulos = useMemo(() => (perfil ? modulosDoPapel(perfil.role).filter((m) => m.ocultavel) : []), [perfil]);
  const [ocultos, setOcultos] = useState<IdModulo[]>(perfil?.preferencias_ui.ocultar ?? []);
  useEffect(() => { setOcultos(perfil?.preferencias_ui.ocultar ?? []); }, [perfil?.preferencias_ui]);
  const salvarInterface = useMutation({
    mutationFn: (lista: IdModulo[]) => salvarPreferencias({ ocultar: lista }),
    onSuccess: () => setAviso('Preferências de interface salvas.'),
    onError: (e) => { setOcultos(perfil?.preferencias_ui.ocultar ?? []); setAviso(mensagemDeErro(e, 'Não foi possível salvar as preferências.', 'configuracoes.interface')); },
  });
  const alternar = (id: IdModulo, visivel: boolean) => {
    const lista = visivel ? ocultos.filter((x) => x !== id) : [...ocultos, id];
    setOcultos(lista);
    salvarInterface.mutate(lista);
  };

  if (!perfil) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h2 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-2"><Settings className="text-rose-600" /> Configurações</h2>
        <p className="text-sm text-slate-500 mt-1">Conta, aparência e preferências da sua interface{ehAdmin ? ', e regras de comissão do salão' : ''}.</p>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4" aria-labelledby="titulo-conta">
        <div className="flex items-center gap-2">
          <UserCircle size={18} className="text-rose-600" />
          <h3 id="titulo-conta" className="font-bold text-slate-800">Conta e aparência</h3>
        </div>
        <p className="text-sm text-slate-600">
          <strong className="text-slate-800">{perfil.name}</strong> · {ROTULO_PAPEL[perfil.role]}{user?.email ? <span className="text-slate-500"> · {user.email}</span> : null}
        </p>
        <div className="flex items-center gap-3 py-2.5 border-t border-slate-100">
          {theme === 'dark' ? <Moon size={20} className="text-rose-600" /> : <Sun size={20} className="text-rose-600" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Modo escuro</p>
            <p className="text-xs text-slate-500">Vale para este aparelho.</p>
          </div>
          <Chave ligado={theme === 'dark'} rotulo="Modo escuro" onChange={() => toggleTheme()} />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button type="button" onClick={() => setSenhaAberta(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50">
            <KeyRound size={18} /> Alterar senha
          </button>
          <button type="button" disabled={saindo} onClick={async () => { setSaindo(true); await signOut(); navigate('/login'); }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 disabled:opacity-60">
            <LogOut size={18} /> Sair do sistema
          </button>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4" aria-labelledby="titulo-interface">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={18} className="text-rose-600" />
          <h3 id="titulo-interface" className="font-bold text-slate-800">Módulos do menu</h3>
        </div>
        <p className="text-xs text-slate-500">
          Esconde módulos só da <strong>sua</strong> tela (menu lateral e rotas). Não muda o que a equipe vê nem as permissões de acesso, que continuam garantidas no banco.
        </p>
        {GRUPOS.map((g) => {
          const itens = modulos.filter((m) => m.grupo === g.id);
          if (!itens.length) return null;
          return (
            <div key={g.id} className="space-y-1">
              {g.rotulo && <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pt-2">{g.rotulo}</p>}
              {itens.map((m) => {
                const visivel = !ocultos.includes(m.id);
                const Icon = m.icone;
                return (
                  <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
                    <Icon size={20} className={visivel ? 'text-rose-600' : 'text-slate-300'} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${visivel ? 'text-slate-800' : 'text-slate-400'}`}>{m.rotulo}</p>
                      <p className="text-xs text-slate-500">{m.descricao}</p>
                    </div>
                    <span className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-slate-400 w-20 justify-end">
                      {visivel ? <><Eye size={12} /> Visível</> : <><EyeOff size={12} /> Oculto</>}
                    </span>
                    <Chave ligado={visivel} rotulo={`Mostrar ${m.rotulo}`} desabilitado={salvarInterface.isPending} onChange={(v) => alternar(m.id, v)} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

      {ehAdmin && <ConfigComissoes onAviso={setAviso} />}
      {senhaAberta && <AlterarSenhaModal onClose={() => setSenhaAberta(false)} />}
      <Aviso texto={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}
