import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Power, Repeat, ShieldAlert, Sparkles, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { mensagemDeErro } from '../../lib/seguranca/erros';
import { CATALOGO_IA, nomeProvedor, rotuloModelo } from '../../../supabase/functions/ia/nucleo/catalogo.ts';
import { PROVEDORES_IA, type ProvedorIa } from '../../../supabase/functions/ia/nucleo/tipos.ts';
import { apagarTudo, desativarAtual, falhou, iaKeys, listarConfiguracoes, salvarConfiguracao, validarChave, type DiagnosticoIa } from './api';
import { ErroIa } from './PainelIa';
import { useRecarregarIa } from './useIa';

const MONOGRAMA: Record<ProvedorIa, { letra: string; cor: string }> = {
  anthropic: { letra: 'A', cor: 'bg-[#d97757]' },
  openai: { letra: 'O', cor: 'bg-[#10a37f]' },
  google: { letra: 'G', cor: 'bg-[#4285f4]' },
};

const botao = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60';
const primario = `${botao} bg-violet-600 text-white hover:bg-violet-700`;
const secundario = `${botao} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
const perigo = `${botao} border border-red-200 bg-white text-red-600 hover:bg-red-50`;

type ErroTela = { mensagem: string; diagnostico?: DiagnosticoIa } | null;

/**
 * Configurações > Integração com IA. Opcional e por pessoa: cada uma cola a chave
 * de API do próprio provedor. A chave é conferida no provedor, cifrada na Edge
 * Function e nunca volta para o navegador.
 */
export default function IntegracaoIa() {
  const { perfil } = useAuth();
  const recarregar = useRecarregarIa();
  const { data: configuracoes = [], isLoading } = useQuery({ queryKey: iaKeys.configuracoes(perfil?.id), queryFn: listarConfiguracoes, enabled: !!perfil, retry: false });
  const ativa = configuracoes.find((c) => c.is_active) ?? null;
  const [escolhendo, setEscolhendo] = useState(false);
  const [provedor, setProvedor] = useState<ProvedorIa | null>(null);
  const [chave, setChave] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [modelos, setModelos] = useState<string[] | null>(null);
  const [modelo, setModelo] = useState('');
  const [consentimento, setConsentimento] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<ErroTela>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const mostrandoEscolha = escolhendo || (!isLoading && !ativa);
  const salva = provedor ? configuracoes.find((c) => c.provider === provedor) ?? null : null;
  const precisaConsentir = !salva;

  function escolher(p: ProvedorIa) {
    setProvedor(p);
    setChave('');
    setModelos(null);
    setModelo('');
    setConsentimento(false);
    setErro(null);
    setAviso(null);
  }

  function fechar() {
    setEscolhendo(false);
    setProvedor(null);
    setModelos(null);
    setChave('');
  }

  async function validar() {
    if (!provedor) return;
    setOcupado('validar');
    setErro(null);
    setModelos(null);
    const r = await validarChave(provedor, chave.trim() || undefined);
    setOcupado(null);
    if (falhou(r)) return setErro({ mensagem: r.error, diagnostico: r.diagnostico });
    setModelos(r.modelos);
    const anterior = salva?.model_preference;
    setModelo(anterior && r.modelos.includes(anterior) ? anterior : r.modelos[0] ?? '');
  }

  async function salvar() {
    if (!provedor || !modelo) return;
    setOcupado('salvar');
    setErro(null);
    const r = await salvarConfiguracao({
      provider: provedor,
      modelo,
      ...(chave.trim() ? { api_key: chave.trim() } : {}),
      ...(precisaConsentir ? { consentimento } : {}),
    });
    setOcupado(null);
    if (falhou(r)) return setErro({ mensagem: r.error, diagnostico: r.diagnostico });
    setAviso(`Integração ativa: ${nomeProvedor(provedor)}.`);
    fechar();
    void recarregar();
  }

  async function executar(nome: string, acao: () => Promise<void>, ok: string) {
    setOcupado(nome);
    setErro(null);
    try {
      await acao();
      setAviso(ok);
      void recarregar();
    } catch (e) {
      setErro({ mensagem: mensagemDeErro(e, 'Não foi possível concluir.', 'ia.configuracao') });
    } finally {
      setOcupado(null);
    }
  }

  const trocar = () => executar('trocar', async () => { await desativarAtual(); setEscolhendo(true); setProvedor(null); }, 'Integração desativada. Escolha outro provedor; a chave anterior continua guardada.');
  const desativarTudo = () => {
    if (!window.confirm('Desativar a IA e apagar as chaves salvas de todos os provedores? O portal continua funcionando sem IA.')) return;
    void executar('desativar', async () => { await apagarTudo(); fechar(); }, 'IA desativada e chaves apagadas.');
  };

  const status = !ativa ? (
    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-400"><XCircle size={16} /> Não configurada</span>
  ) : ativa.status_chave === 'invalida' ? (
    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-700"><ShieldAlert size={16} /> Chave recusada por {nomeProvedor(ativa.provider)}</span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700"><CheckCircle2 size={16} /> Conectada a {nomeProvedor(ativa.provider)}</span>
  );

  const cat = provedor ? CATALOGO_IA[provedor] : null;

  return (
    <section id="integracao-ia" className="scroll-mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4" aria-labelledby="titulo-ia">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-violet-600" />
        <h3 id="titulo-ia" className="font-bold text-slate-800">Integração com IA</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">opcional</span>
      </div>
      <p className="text-xs text-slate-500">
        Use a sua própria conta de IA (Claude, ChatGPT ou Gemini) para resumir clientes e fazer a triagem de leads. Vale só para você; sem configurar, o portal funciona normalmente.
        O custo é cobrado pelo provedor na sua conta. Limite: 40 usos por dia.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div>
          {isLoading ? <Loader2 size={16} className="animate-spin text-slate-400" /> : status}
          {ativa && <p className="mt-1 text-xs text-slate-500">Modelo: {rotuloModelo(ativa.provider, ativa.model_preference)}</p>}
        </div>
        {ativa && !escolhendo && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secundario} disabled={!!ocupado} onClick={() => { setEscolhendo(true); escolher(ativa.provider); }}><KeyRound size={15} /> Trocar chave ou modelo</button>
            <button type="button" className={secundario} disabled={!!ocupado} onClick={trocar}><Repeat size={15} /> Trocar de provedor</button>
            <button type="button" className={perigo} disabled={!!ocupado} onClick={desativarTudo}><Power size={15} /> Desativar totalmente</button>
          </div>
        )}
        {!ativa && configuracoes.length > 0 && (
          <button type="button" className={perigo} disabled={!!ocupado} onClick={desativarTudo}><Power size={15} /> Apagar chaves salvas</button>
        )}
      </div>

      {mostrandoEscolha && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-bold text-slate-800">1. Escolha o provedor</p>
            <div role="radiogroup" aria-label="Provedor de IA" className="mt-2 grid gap-3 sm:grid-cols-3">
              {PROVEDORES_IA.map((p) => {
                const c = CATALOGO_IA[p];
                const marcado = provedor === p;
                return (
                  <button key={p} type="button" role="radio" aria-checked={marcado} onClick={() => escolher(p)}
                    className={`sem-hover-card flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors ${marcado ? 'border-violet-500 bg-violet-50' : 'border-slate-200 hover:border-violet-300'}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${MONOGRAMA[p].cor}`} aria-hidden>{MONOGRAMA[p].letra}</span>
                    <span>
                      <span className="block text-sm font-bold text-slate-800">{c.empresa} · {c.nome}</span>
                      <span className="block text-xs text-slate-500">{c.descricao}</span>
                      {configuracoes.some((x) => x.provider === p) && <span className="mt-1 block text-[11px] font-bold text-violet-700">Chave já salva</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {cat && provedor && (
            <>
              <div>
                <p className="text-sm font-bold text-slate-800">2. Crie a chave de API em {cat.empresa}</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                  {cat.passos.map((p, i) => <li key={i}>{p}</li>)}
                </ol>
                <a href={cat.linkChave} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-violet-700 hover:underline">
                  <ExternalLink size={14} /> Abrir a página de chaves de {cat.empresa}
                </a>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-bold text-slate-800">3. Cole a chave e valide</p>
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input type={mostrar ? 'text' : 'password'} value={chave} onChange={(e) => { setChave(e.target.value); setModelos(null); }}
                      autoComplete="off" spellCheck={false} maxLength={400}
                      placeholder={salva ? 'Deixe em branco para usar a chave já salva' : 'Cole a chave aqui'}
                      aria-label={`Chave de API ${cat.empresa}`}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 font-mono text-sm text-slate-800" />
                    <button type="button" onClick={() => setMostrar((m) => !m)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700" aria-label={mostrar ? 'Ocultar chave' : 'Mostrar chave'}>
                      {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <button type="button" className={secundario} disabled={!!ocupado || (!chave.trim() && !salva)} onClick={validar}>
                    {ocupado === 'validar' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Validar chave
                  </button>
                </div>
                <p className="text-xs text-slate-500">A chave é conferida no provedor antes de salvar, fica cifrada (AES-256-GCM) e nunca volta para o navegador.</p>
              </div>

              {modelos && (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-slate-800">4. Escolha o modelo</p>
                  <select value={modelo} onChange={(e) => setModelo(e.target.value)} aria-label="Modelo" className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                    {modelos.map((m) => <option key={m} value={m}>{rotuloModelo(provedor, m)}</option>)}
                  </select>
                  <p className="text-xs text-slate-500">A lista vem da sua conta no provedor. Para resumos e mensagens, um modelo rápido e econômico costuma bastar.</p>

                  {precisaConsentir && (
                    <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-700">
                      <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} className="mt-1" />
                      <span>
                        Entendo que, <b>quando eu usar</b> um recurso de IA, os dados necessários (interesse e anotações do lead; atendimentos, histórico técnico e
                        observações da cliente, que podem incluir alergias e cuidados de saúde) serão enviados para <b>{nomeProvedor(provedor)}</b>, provedor externo que
                        pode tratá-los fora do Brasil, conforme os termos da minha conta nesse provedor. O nome da cliente não é enviado; CPF, CNPJ, e-mail e telefone
                        escritos em texto vão substituídos por marcadores. Só uso a IA com dados que a cliente autorizou tratar (LGPD).
                      </span>
                    </label>
                  )}

                  <button type="button" className={primario} disabled={!!ocupado || !modelo || (precisaConsentir && !consentimento)} onClick={salvar}>
                    {ocupado === 'salvar' && <Loader2 size={15} className="animate-spin" />} Salvar e ativar {cat.nome}
                  </button>
                </div>
              )}
            </>
          )}

          {ativa && (
            <button type="button" className="text-xs font-bold text-slate-400 hover:underline" onClick={() => { fechar(); setErro(null); }}>Cancelar</button>
          )}
        </div>
      )}

      <ErroIa mensagem={erro?.mensagem ?? null} diagnostico={erro?.diagnostico} />
      {aviso && <p className="text-xs font-bold text-emerald-700" role="status">{aviso}</p>}
    </section>
  );
}
