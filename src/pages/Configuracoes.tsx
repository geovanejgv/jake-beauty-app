import React, { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Settings, SlidersHorizontal } from 'lucide-react';
import { Chave, ConfigComissoes } from '../features/comissoes/ConfigComissoes';
import { useAuth } from '../contexts/AuthContext';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { GRUPOS, modulosDoPapel, type IdModulo } from '../features/acesso/modulos';
import { Aviso } from '../components/ui';

export default function Configuracoes() {
  const { perfil, salvarPreferencias } = useAuth();
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
        <p className="text-sm text-slate-500 mt-1">Preferências da sua interface{ehAdmin ? ' e regras de comissão do salão' : ''}.</p>
      </div>

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
      <Aviso texto={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}
