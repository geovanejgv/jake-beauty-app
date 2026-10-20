import type { ProvedorIa } from './tipos.ts';

/**
 * Dados de exibição de cada provedor (tela Configurações > Integração com IA).
 * Sem segredo e sem chamada externa: a tela importa este mesmo arquivo.
 *
 * A lista de modelos NÃO é fixa: vem da conta do usuário quando a chave é
 * validada (os nomes mudam com frequência). "sugeridos" só ordena e rotula; se
 * nenhum existir na conta, o primeiro modelo de texto listado é o padrão.
 * Nomes conferidos em 2026-10-20 [Confirmar a cada atualização].
 */
export type ProvedorCatalogo = {
  id: ProvedorIa;
  nome: string;
  empresa: string;
  descricao: string;
  linkChave: string;
  passos: string[];
  sugeridos: { id: string; rotulo: string }[];
  /** Filtra a listagem do provedor para modelos de geração de texto. */
  ehModeloDeTexto: (id: string) => boolean;
};

export const CATALOGO_IA: Record<ProvedorIa, ProvedorCatalogo> = {
  anthropic: {
    id: 'anthropic',
    nome: 'Claude',
    empresa: 'Anthropic',
    descricao: 'Modelos Claude: Opus (mais capaz), Sonnet (equilíbrio) e Haiku (rápido e econômico).',
    linkChave: 'https://console.anthropic.com/settings/keys',
    passos: [
      'Acesse console.anthropic.com e entre na conta de API (a assinatura do app Claude não inclui a API).',
      'Abra Settings > API Keys e clique em Create Key.',
      'Dê um nome (ex.: Controla Miga) e copie a chave, que começa com sk-ant-.',
      'Cole a chave abaixo. Ela fica cifrada e não aparece de novo.',
      'Confira se há crédito em Plans & Billing: sem saldo, o provedor recusa os pedidos.',
    ],
    sugeridos: [
      { id: 'claude-haiku-5-5', rotulo: 'Claude Haiku 5.5 · rápido e econômico (recomendado)' },
      { id: 'claude-sonnet-5-5', rotulo: 'Claude Sonnet 5.5 · equilíbrio entre qualidade e custo' },
      { id: 'claude-opus-5-5', rotulo: 'Claude Opus 5.5 · mais capaz, mais caro' },
    ],
    ehModeloDeTexto: (id) => id.startsWith('claude-'),
  },
  openai: {
    id: 'openai',
    nome: 'ChatGPT',
    empresa: 'OpenAI',
    descricao: 'Modelos GPT da plataforma de API da OpenAI.',
    linkChave: 'https://platform.openai.com/api-keys',
    passos: [
      'Acesse platform.openai.com/api-keys e entre na conta (a assinatura do ChatGPT não inclui a API).',
      'Clique em Create new secret key, escolha o projeto e as permissões.',
      'Copie a chave (começa com sk-); ela só aparece uma vez.',
      'Cole a chave abaixo. Ela fica cifrada e não aparece de novo.',
      'Confira o saldo em Settings > Billing: sem crédito, o provedor recusa os pedidos.',
    ],
    sugeridos: [
      { id: 'gpt-6-luna', rotulo: 'GPT-6 Luna · rápido e econômico' },
      { id: 'gpt-6.1-sol', rotulo: 'GPT-6.1 Sol · equilíbrio entre qualidade e custo' },
      { id: 'gpt-6-astra', rotulo: 'GPT-6 Astra · mais capaz, mais caro' },
    ],
    ehModeloDeTexto: (id) =>
      /^(gpt-|o\d)/.test(id) && !/(image|realtime|audio|transcribe|tts|live|embedding|moderation|search|cyber|research|instruct)/.test(id),
  },
  google: {
    id: 'google',
    nome: 'Gemini',
    empresa: 'Google',
    descricao: 'Modelos Gemini pelo Google AI Studio: Pro (mais capaz) e Flash (rápido e econômico).',
    linkChave: 'https://aistudio.google.com/apikey',
    passos: [
      'Acesse aistudio.google.com/apikey com a conta Google.',
      'Clique em Criar chave de API e escolha (ou crie) um projeto do Google Cloud.',
      'Copie a chave gerada.',
      'Cole a chave abaixo. Ela fica cifrada e não aparece de novo.',
      'Para dados de clientes, use projeto com faturamento ativo: no nível gratuito o Google pode usar o conteúdo para melhorar produtos.',
    ],
    sugeridos: [
      { id: 'gemini-3.8-flash', rotulo: 'Gemini 3.8 Flash · rápido e econômico' },
      { id: 'gemini-3.5-flash-lite', rotulo: 'Gemini 3.5 Flash-Lite · o mais econômico' },
      { id: 'gemini-3.1-pro-preview', rotulo: 'Gemini 3.1 Pro (prévia) · mais capaz' },
    ],
    ehModeloDeTexto: (id) => id.startsWith('gemini-') && !/(image|live|tts|embedding|audio|robotics|computer-use)/.test(id),
  },
};

/** Ordena: sugeridos primeiro (na ordem do catálogo), depois os demais em ordem alfabética. */
export function ordenarModelos(provedor: ProvedorIa, modelos: string[]): string[] {
  const cat = CATALOGO_IA[provedor];
  const texto = [...new Set(modelos.filter(cat.ehModeloDeTexto))];
  const sugeridos = cat.sugeridos.map((s) => s.id).filter((id) => texto.includes(id));
  const demais = texto.filter((id) => !sugeridos.includes(id)).sort();
  return [...sugeridos, ...demais];
}

export function rotuloModelo(provedor: ProvedorIa, id: string): string {
  return CATALOGO_IA[provedor].sugeridos.find((s) => s.id === id)?.rotulo ?? id;
}

export function nomeProvedor(provedor: ProvedorIa): string {
  const c = CATALOGO_IA[provedor];
  return `${c.empresa} (${c.nome})`;
}
