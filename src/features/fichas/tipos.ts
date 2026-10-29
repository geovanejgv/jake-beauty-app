// Estrutura em JSON das fichas (anamnese, fotodepilação, termo). O mesmo JSON é gravado
// em fichas.campos e validado no banco por public.ficha_validar_respostas.

export type TipoFicha = 'anamnese' | 'fotodepilacao' | 'termo';
export type IdTema = 'classico' | 'rose' | 'minimal' | 'noir' | 'spa';

export type TipoCampo =
  | 'informativo' | 'texto' | 'texto_longo' | 'telefone' | 'cpf' | 'email' | 'data' | 'numero'
  | 'sim_nao' | 'escolha_unica' | 'escolha_multipla' | 'aceite';

export type Opcao = { valor: string; rotulo: string; ajuda?: string; alerta?: boolean };

export type Campo = {
  /** Chave da resposta: minúsculas, números e "_". */
  id: string;
  tipo: TipoCampo;
  rotulo: string;
  ajuda?: string;
  obrigatorio?: boolean;
  /** Quem preenche: a cliente (padrão) ou o salão, ao criar a ficha. */
  origem?: 'cliente' | 'salao';
  /** Texto: tamanho máximo. Número: valor máximo. */
  max?: number;
  min?: number;
  opcoes?: Opcao[];
  /** Sim/Não: resposta que acende o alerta para a profissional. */
  alertaSe?: 'sim' | 'nao';
  /** Sim/Não: pergunta complementar quando a resposta é "sim" (chave `${id}__detalhe`). */
  detalhe?: { rotulo: string; obrigatorio?: boolean };
  /** Só aparece quando outro campo tem este valor. */
  mostrarSe?: { campo: string; igual: string | boolean };
  /** Ocupa a linha toda em telas largas. */
  largo?: boolean;
};

export type Secao = { id: string; titulo: string; descricao?: string; campos: Campo[] };

export type EsquemaFicha = {
  versao: string;
  tipo: TipoFicha;
  titulo: string;
  subtitulo?: string;
  /** Campo com a data de nascimento: menor de 18 anos assina com o responsável legal. */
  campoNascimento?: string;
  /** Validade em meses de um questionário de saúde assinado (padrão 12). */
  validadeMeses?: number;
  /** Texto final, acima das assinaturas. */
  declaracaoFinal?: string;
  secoes: Secao[];
};

export type ValorResposta = string | number | boolean | string[];
export type Respostas = Record<string, ValorResposta>;

export type Responsavel = { nome: string; cpf: string; parentesco: string };
