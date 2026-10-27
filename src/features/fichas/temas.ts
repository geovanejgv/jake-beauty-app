// Cinco modelos visuais para os documentos. A administradora escolhe um por documento
// (ficha_preferencias); a ficha guarda o escolhido no momento da criação.
// Classes completas e literais: o Tailwind só gera o que encontra escrito.
import type { IdTema } from './tipos';

export type Tema = {
  id: IdTema;
  nome: string;
  descricao: string;
  /** Cores para a amostra na escolha. */
  amostra: [string, string, string];
  pagina: string;
  folha: string;
  cabecalho: string;
  marca: string;
  titulo: string;
  subtitulo: string;
  secao: string;
  secaoTitulo: string;
  rotulo: string;
  ajuda: string;
  campo: string;
  /** Botão de escolha (sim/não, opções): normal e marcado. */
  chip: string;
  chipMarcado: string;
  botao: string;
  resposta: string;
  alerta: string;
};

export const TEMAS: Record<IdTema, Tema> = {
  classico: {
    id: 'classico',
    nome: 'Clássico',
    descricao: 'Fiel ao papel atual: faixa cinza, título com serifa e linhas de preenchimento.',
    amostra: ['#f1f5f9', '#64748b', '#0f172a'],
    pagina: 'bg-slate-100',
    folha: 'bg-white border border-slate-300 shadow-sm',
    cabecalho: 'text-center border-b border-slate-300 pb-4',
    marca: 'font-serif text-sm tracking-[0.3em] uppercase text-slate-500',
    titulo: 'font-serif text-2xl sm:text-3xl text-slate-900 bg-slate-200 py-2 px-3 mt-2',
    subtitulo: 'text-sm text-slate-500 mt-1',
    secao: 'border-t border-slate-200 pt-4',
    secaoTitulo: 'font-serif text-lg text-slate-800 text-center',
    rotulo: 'text-sm font-medium text-slate-800',
    ajuda: 'text-xs text-slate-500',
    campo: 'w-full border-0 border-b border-slate-400 bg-transparent px-1 py-2 text-slate-900 focus:outline-none focus:border-slate-900',
    chip: 'border border-slate-400 text-slate-700 bg-white',
    chipMarcado: 'border border-slate-900 bg-slate-900 text-white',
    botao: 'bg-slate-900 text-white hover:bg-slate-700',
    resposta: 'border-b border-dotted border-slate-400 text-slate-900',
    alerta: 'border border-red-300 bg-red-50 text-red-800',
  },
  rose: {
    id: 'rose',
    nome: 'Rosé',
    descricao: 'Delicado e acolhedor: tons rosados, cartões arredondados e botões grandes para o dedo.',
    amostra: ['#fff1f2', '#fb7185', '#881337'],
    pagina: 'bg-rose-50',
    folha: 'bg-white rounded-3xl shadow-lg shadow-rose-100 border border-rose-100',
    cabecalho: 'text-center pb-4',
    marca: 'text-sm font-semibold text-rose-400',
    titulo: 'text-2xl sm:text-3xl font-bold text-rose-900 mt-1',
    subtitulo: 'text-sm text-rose-500 mt-1',
    secao: 'rounded-2xl bg-rose-50/60 p-4',
    secaoTitulo: 'text-base font-bold text-rose-800',
    rotulo: 'text-sm font-medium text-slate-800',
    ajuda: 'text-xs text-rose-500',
    campo: 'w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-300',
    chip: 'rounded-full border border-rose-200 text-rose-800 bg-white',
    chipMarcado: 'rounded-full border border-rose-500 bg-rose-500 text-white',
    botao: 'rounded-full bg-rose-500 text-white hover:bg-rose-600',
    resposta: 'text-slate-900 font-medium',
    alerta: 'rounded-2xl border border-rose-300 bg-rose-100 text-rose-900',
  },
  minimal: {
    id: 'minimal',
    nome: 'Minimalista',
    descricao: 'Preto e branco, muito espaço e tipografia limpa. Imprime bem em qualquer impressora.',
    amostra: ['#ffffff', '#d4d4d4', '#000000'],
    pagina: 'bg-white',
    folha: 'bg-white',
    cabecalho: 'border-b-2 border-black pb-4',
    marca: 'text-xs font-semibold uppercase tracking-widest text-neutral-500',
    titulo: 'text-3xl sm:text-4xl font-light tracking-tight text-black mt-2',
    subtitulo: 'text-sm text-neutral-500 mt-1',
    secao: 'pt-2',
    secaoTitulo: 'text-xs font-bold uppercase tracking-widest text-black border-b border-neutral-200 pb-1',
    rotulo: 'text-sm text-neutral-900',
    ajuda: 'text-xs text-neutral-500',
    campo: 'w-full border border-neutral-300 bg-white px-3 py-2.5 text-black focus:outline-none focus:border-black',
    chip: 'border border-neutral-300 text-neutral-800 bg-white',
    chipMarcado: 'border border-black bg-black text-white',
    botao: 'bg-black text-white hover:bg-neutral-800',
    resposta: 'text-black',
    alerta: 'border-l-4 border-black bg-neutral-100 text-black',
  },
  noir: {
    id: 'noir',
    nome: 'Noir & Dourado',
    descricao: 'Sofisticado: cabeçalho preto com detalhes dourados, como a faixa da ficha de fotodepilação.',
    amostra: ['#0c0a09', '#ca8a04', '#fef3c7'],
    pagina: 'bg-stone-200',
    folha: 'bg-white shadow-xl border-t-8 border-stone-950',
    cabecalho: 'text-center bg-stone-950 -mx-5 sm:-mx-8 -mt-5 sm:-mt-8 px-5 sm:px-8 py-6 mb-2',
    marca: 'font-serif text-sm tracking-[0.35em] uppercase text-amber-400',
    titulo: 'font-serif text-2xl sm:text-3xl text-amber-50 mt-2',
    subtitulo: 'text-xs uppercase tracking-widest text-amber-200/80 mt-2',
    secao: 'border-l-2 border-amber-500 pl-4',
    secaoTitulo: 'font-serif text-lg text-stone-900',
    rotulo: 'text-sm font-medium text-stone-800',
    ajuda: 'text-xs text-stone-500',
    campo: 'w-full border border-stone-300 bg-stone-50 px-3 py-2.5 text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600',
    chip: 'border border-stone-300 text-stone-800 bg-white',
    chipMarcado: 'border border-stone-950 bg-stone-950 text-amber-300',
    botao: 'bg-stone-950 text-amber-300 hover:bg-stone-800',
    resposta: 'text-stone-900 border-b border-amber-300',
    alerta: 'border border-amber-500 bg-amber-50 text-stone-900',
  },
  spa: {
    id: 'spa',
    nome: 'Verde Spa',
    descricao: 'Natural e calmo: verde-sálvia, fundo creme e ícones discretos, clima de clínica de bem-estar.',
    amostra: ['#f5f5f0', '#84a98c', '#2f3e46'],
    pagina: 'bg-stone-100',
    folha: 'bg-[#fbfaf6] rounded-2xl border border-emerald-900/10 shadow-sm',
    cabecalho: 'text-center pb-4 border-b border-emerald-900/10',
    marca: 'text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700',
    titulo: 'font-serif text-2xl sm:text-3xl text-emerald-950 mt-2',
    subtitulo: 'text-sm text-emerald-800/70 mt-1',
    secao: 'rounded-xl border border-emerald-900/10 bg-white p-4',
    secaoTitulo: 'text-base font-semibold text-emerald-900',
    rotulo: 'text-sm text-emerald-950',
    ajuda: 'text-xs text-emerald-800/70',
    campo: 'w-full rounded-lg border border-emerald-900/20 bg-white px-3 py-2.5 text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/40',
    chip: 'rounded-lg border border-emerald-900/20 text-emerald-900 bg-white',
    chipMarcado: 'rounded-lg border border-emerald-700 bg-emerald-700 text-white',
    botao: 'rounded-lg bg-emerald-800 text-white hover:bg-emerald-900',
    resposta: 'text-emerald-950',
    alerta: 'rounded-xl border border-orange-300 bg-orange-50 text-orange-900',
  },
};

export const LISTA_TEMAS: IdTema[] = ['classico', 'rose', 'minimal', 'noir', 'spa'];

export function temaDe(id: string | null | undefined): Tema {
  return TEMAS[(id ?? 'classico') as IdTema] ?? TEMAS.classico;
}
