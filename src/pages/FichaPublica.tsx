import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Lock, Printer } from 'lucide-react';
import { mensagemDeErro } from '../lib/seguranca/erros';
import { abrirFichaPublica, assinarFichaPublica, type FichaPublica as DadosFicha } from '../features/fichas/api';
import { AssinaturaCanvas, type AssinaturaRef } from '../features/fichas/AssinaturaCanvas';
import { DocumentoFicha } from '../features/fichas/DocumentoFicha';
import { FormularioFicha } from '../features/fichas/FormularioFicha';
import { ehMenor, limparRespostas, tokenDoFragmento, validarResponsavel, validarRespostas } from '../features/fichas/logic';
import { temaDe } from '../features/fichas/temas';
import type { Respostas, Responsavel } from '../features/fichas/tipos';

/**
 * Ficha aberta pela cliente no próprio celular (ou no aparelho do salão), sem login.
 * O token vem no fragmento da URL (#), nunca vai para o servidor da Vercel nem para logs.
 * As respostas ficam só na memória da página: nada é salvo no navegador (dado de saúde).
 */
export default function FichaPublica() {
  const token = useMemo(() => tokenDoFragmento(window.location.hash), []);
  const [ficha, setFicha] = useState<DadosFicha | null>(null);
  const [erroAbrir, setErroAbrir] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Respostas>({});
  const [responsavel, setResponsavel] = useState<Responsavel>({ nome: '', cpf: '', parentesco: '' });
  const [erro, setErro] = useState<{ campo: string | null; mensagem: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [assinada, setAssinada] = useState<{ assinado_em: string; hash: string; respostas: Respostas; assinatura: string; assinaturaResp: string | null } | null>(null);
  const assinaturaCliente = useRef<AssinaturaRef>(null);
  const assinaturaResp = useRef<AssinaturaRef>(null);

  // Documento claro mesmo com o modo escuro do aparelho.
  useEffect(() => {
    const raiz = document.documentElement;
    const escuro = raiz.classList.contains('dark');
    raiz.classList.remove('dark');
    return () => { if (escuro) raiz.classList.add('dark'); };
  }, []);

  useEffect(() => {
    if (!token) { setErroAbrir('Link inválido ou vencido. Peça um novo link ao salão.'); return; }
    abrirFichaPublica(token).then(setFicha).catch((e) => setErroAbrir(mensagemDeErro(e, 'Não foi possível abrir a ficha.', 'ficha_publica_abrir')));
  }, [token]);

  // Aviso ao sair com a ficha começada.
  useEffect(() => {
    if (!ficha || assinada || Object.keys(respostas).length === 0) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [ficha, assinada, respostas]);

  const tema = temaDe(ficha?.modelo_visual);
  const menor = ficha ? ehMenor(ficha.campos, respostas) : false;

  const mostrarErro = (campo: string | null, mensagem: string) => {
    setErro({ campo, mensagem });
    const alvo = campo ? document.getElementById(campo.startsWith('#') ? campo.slice(1) : `campo-${campo}`) : null;
    alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const enviar = async () => {
    if (!ficha || !token) return;
    const limpas = limparRespostas(ficha.campos, respostas, 'cliente');
    const problema = validarRespostas(ficha.campos, limpas, 'cliente');
    if (problema) return mostrarErro(problema.campo || null, problema.mensagem);
    let dadosResp: Responsavel | null = null;
    let imgResp: string | null = null;
    if (menor) {
      const p = validarResponsavel(responsavel);
      if (p) return mostrarErro('#bloco-responsavel', p);
      imgResp = assinaturaResp.current?.imagem() ?? null;
      if (!imgResp) return mostrarErro('#bloco-responsavel', 'O responsável legal também precisa assinar.');
      dadosResp = responsavel;
    }
    const img = assinaturaCliente.current?.imagem() ?? null;
    if (!img) return mostrarErro('#bloco-assinatura', 'Faça a sua assinatura no quadro.');
    setErro(null);
    setEnviando(true);
    try {
      const r = await assinarFichaPublica({ token, respostas: limpas, assinatura: img, responsavel: dadosResp, assinaturaResponsavel: imgResp });
      setAssinada({ ...r, respostas: limpas, assinatura: img, assinaturaResp: imgResp });
      window.scrollTo({ top: 0 });
    } catch (e) {
      mostrarErro(null, mensagemDeErro(e, 'Não foi possível enviar a ficha.', 'ficha_publica_assinar'));
    } finally {
      setEnviando(false);
    }
  };

  if (erroAbrir) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow p-6 text-center space-y-2">
          <Lock className="mx-auto text-slate-400" />
          <h1 className="text-lg font-bold text-slate-900">Não foi possível abrir</h1>
          <p className="text-sm text-slate-600">{erroAbrir}</p>
        </div>
      </div>
    );
  }
  if (!ficha) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  if (assinada) {
    return (
      <div className={`min-h-screen ${tema.pagina} print:bg-white`}>
        <div className="max-w-3xl mx-auto px-4 py-6 print:p-0 space-y-4">
          <div className="print:hidden rounded-2xl bg-white border border-emerald-200 p-5 text-center space-y-2">
            <CheckCircle2 className="mx-auto text-emerald-600" size={36} />
            <h1 className="text-lg font-bold text-slate-900">Ficha assinada. Obrigada, {ficha.primeiro_nome}!</h1>
            <p className="text-sm text-slate-600">O salão já recebeu. Se quiser, guarde uma cópia em PDF.</p>
            <button type="button" onClick={() => window.print()} className={`${tema.botao} inline-flex items-center gap-2 px-5 py-3 font-bold`}>
              <Printer size={18} /> Salvar cópia em PDF
            </button>
          </div>
          <DocumentoFicha esquema={ficha.campos} tema={tema} estabelecimento={ficha.estabelecimento} profissional={ficha.profissional}
            dadosSalao={ficha.dados_salao} respostas={assinada.respostas}
            assinatura={{
              assinaturaCliente: assinada.assinatura, assinaturaResponsavel: assinada.assinaturaResp,
              responsavel: assinada.assinaturaResp ? { nome: responsavel.nome.trim(), cpf: responsavel.cpf.replace(/\D/g, ''), parentesco: responsavel.parentesco.trim() } : null,
              assinadoEm: assinada.assinado_em, hash: assinada.hash,
            }} />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${tema.pagina}`}>
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <article className={`${tema.folha} p-5 sm:p-8 space-y-6 text-slate-900`}>
          <header className={tema.cabecalho}>
            <p className={tema.marca}>{ficha.estabelecimento}</p>
            <h1 className={tema.titulo}>{ficha.campos.titulo}</h1>
            {ficha.campos.subtitulo && <p className={tema.subtitulo}>{ficha.campos.subtitulo}</p>}
          </header>

          <p className="text-sm">
            Olá, <strong>{ficha.primeiro_nome}</strong>! Preencha com calma, leva uns 5 minutos.
            Os campos com <span className="text-red-600">*</span> são obrigatórios. No final, assine com o dedo.
          </p>

          <FormularioFicha esquema={ficha.campos} origem="cliente" respostas={respostas} onMudar={(r) => { setRespostas(r); setErro(null); }}
            tema={tema} dadosSalao={ficha.dados_salao} campoComErro={erro?.campo ?? null} />

          {menor && (
            <section id="bloco-responsavel" className={`${tema.secao} space-y-4`}>
              <div>
                <h2 className={tema.secaoTitulo}>Responsável legal</h2>
                <p className={`${tema.ajuda} mt-1`}>Por ser menor de 18 anos, a mãe, o pai ou o responsável legal precisa acompanhar e assinar junto.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className={tema.rotulo}>Nome completo do responsável <span className="text-red-600">*</span></span>
                  <input type="text" maxLength={200} value={responsavel.nome} onChange={(e) => setResponsavel({ ...responsavel, nome: e.target.value })} className={`${tema.campo} mt-1 text-base`} />
                </label>
                <label className="block">
                  <span className={tema.rotulo}>CPF do responsável <span className="text-red-600">*</span></span>
                  <input type="text" inputMode="numeric" maxLength={14} value={responsavel.cpf} onChange={(e) => setResponsavel({ ...responsavel, cpf: e.target.value })} className={`${tema.campo} mt-1 text-base`} />
                </label>
                <label className="block">
                  <span className={tema.rotulo}>Parentesco <span className="text-red-600">*</span></span>
                  <input type="text" maxLength={60} placeholder="Mãe, pai, tutor..." value={responsavel.parentesco} onChange={(e) => setResponsavel({ ...responsavel, parentesco: e.target.value })} className={`${tema.campo} mt-1 text-base`} />
                </label>
              </div>
              <AssinaturaCanvas ref={assinaturaResp} rotulo="Assinatura do responsável legal" />
            </section>
          )}

          <section id="bloco-assinatura" className={`${tema.secao} space-y-3`}>
            <h2 className={tema.secaoTitulo}>Assinatura</h2>
            {ficha.campos.declaracaoFinal && <p className="text-sm">{ficha.campos.declaracaoFinal}</p>}
            <AssinaturaCanvas ref={assinaturaCliente} rotulo={menor ? 'Assinatura da cliente' : 'Sua assinatura'} />
          </section>

          {erro && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro.mensagem}</p>}

          <button type="button" onClick={() => { void enviar(); }} disabled={enviando}
            className={`${tema.botao} w-full py-4 text-base font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60`}>
            {enviando && <Loader2 size={18} className="animate-spin" />} Assinar e enviar
          </button>
          <p className={`${tema.ajuda} text-center`}>
            Link pessoal, válido até {new Date(ficha.expira_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Depois de assinada, a ficha não pode ser alterada.
          </p>
        </article>
      </div>
    </div>
  );
}
