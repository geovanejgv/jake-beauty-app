// Visuais do portal (tema de cores). A escolha vale para o aparelho (localStorage) e
// é aplicada por classes no <html>: "dark" nos escuros e "tema-jake" no padrão Jake.
// public/tema.js repete a regra de leitura para aplicar o visual antes de renderizar.

export const VISUAIS = ['light', 'dark', 'jake-claro', 'jake-escuro'] as const;
export type Visual = (typeof VISUAIS)[number];

export type OpcaoVisual = {
  id: Visual;
  rotulo: string;
  descricao: string;
  escuro: boolean;
  jake: boolean;
  /** Cor da barra do navegador no celular. */
  corBarra: string;
  /** Amostras para a prévia em Configurações: fundo, painel, destaque, texto. */
  amostras: [string, string, string, string];
};

export const OPCOES_VISUAL: OpcaoVisual[] = [
  { id: 'light', rotulo: 'Clássico claro', descricao: 'O visual atual, em rosa e vidro claro.', escuro: false, jake: false,
    corBarra: '#e11d48', amostras: ['#eef2f7', '#ffffff', '#e11d48', '#1e293b'] },
  { id: 'dark', rotulo: 'Clássico escuro', descricao: 'O modo escuro atual, em azul-ardósia.', escuro: true, jake: false,
    corBarra: '#0f172a', amostras: ['#0b1120', '#1e293b', '#fb7185', '#f1f5f9'] },
  { id: 'jake-claro', rotulo: 'Jake claro', descricao: 'Rosa vibrante e ameixa sobre fundo rosado.', escuro: false, jake: true,
    corBarra: '#e72067', amostras: ['#fdf2f8', '#ffffff', '#e72067', '#360b3f'] },
  { id: 'jake-escuro', rotulo: 'Jake escuro', descricao: 'Ameixa profundo com destaques em rosa e magenta.', escuro: true, jake: true,
    corBarra: '#12060f', amostras: ['#12060f', '#1e0d22', '#f0619c', '#fbeaf5'] },
];

export const CHAVE_VISUAL = 'jb-theme';

/** Valor salvo válido ou, sem escolha, o clássico conforme o tema do sistema. */
export function lerVisual(salvo: string | null, sistemaEscuro: boolean): Visual {
  if (salvo && (VISUAIS as readonly string[]).includes(salvo)) return salvo as Visual;
  return sistemaEscuro ? 'dark' : 'light';
}

export function opcaoVisual(v: Visual): OpcaoVisual {
  return OPCOES_VISUAL.find((o) => o.id === v)!;
}

/**
 * Celular abrindo o portal como computador ("Site para computador" no Chrome, ou zoom da página
 * reduzido): a página é montada com ~980px e encolhida, então tudo fica pequeno e o layout de
 * celular não entra. Sinais: tela de toque estreita com janela bem mais larga que a tela, ou a
 * página já aberta encolhida (escala do visualViewport baixa).
 */
export function modoComputadorNoCelular(t: { toque: boolean; telaLargura: number; janelaLargura: number; escala: number }): boolean {
  if (!t.toque) return false;
  const janelaMaiorQueTela = t.telaLargura > 0 && t.telaLargura < 600 && t.janelaLargura >= t.telaLargura * 1.5;
  const paginaEncolhida = t.escala > 0 && t.escala < 0.7 && t.janelaLargura >= 700;
  return janelaMaiorQueTela || paginaEncolhida;
}
