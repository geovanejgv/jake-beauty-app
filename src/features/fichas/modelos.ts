// Modelos dos três documentos, revisados a partir das fichas em papel do salão.
// Ao criar uma ficha, o modelo é copiado para o banco (fichas.campos): mudar um modelo
// aqui vale só para as próximas fichas. Ao mudar perguntas, suba a versão.
import type { Campo, EsquemaFicha, Opcao, TipoFicha } from './tipos';

const simNao = (id: string, rotulo: string, extra: Partial<Campo> = {}): Campo =>
  ({ id, tipo: 'sim_nao', rotulo, obrigatorio: true, ...extra });
/** Sim/Não que acende alerta para a profissional quando a resposta é "sim". */
const risco = (id: string, rotulo: string, extra: Partial<Campo> = {}): Campo =>
  simNao(id, rotulo, { alertaSe: 'sim', ...extra });
const qual = (rotulo = 'Qual? Desde quando?', obrigatorio = true) => ({ detalhe: { rotulo, obrigatorio } });

const COMO_CONHECEU: Opcao[] = [
  { valor: 'instagram', rotulo: 'Instagram' },
  { valor: 'indicacao', rotulo: 'Indicação de amiga ou cliente' },
  { valor: 'google', rotulo: 'Google' },
  { valor: 'whatsapp', rotulo: 'WhatsApp' },
  { valor: 'passou_em_frente', rotulo: 'Passei em frente' },
  { valor: 'outro', rotulo: 'Outro' },
];

const identificacao = (cpfObrigatorio: boolean): Campo[] => [
  { id: 'nome_completo', tipo: 'texto', rotulo: 'Nome completo', obrigatorio: true, max: 200, largo: true },
  { id: 'data_nascimento', tipo: 'data', rotulo: 'Data de nascimento', obrigatorio: true,
    ajuda: 'Menor de 18 anos assina junto com o responsável legal.' },
  { id: 'cpf', tipo: 'cpf', rotulo: 'CPF', obrigatorio: cpfObrigatorio },
  { id: 'telefone', tipo: 'telefone', rotulo: 'Celular / WhatsApp', obrigatorio: true },
  { id: 'email', tipo: 'email', rotulo: 'E-mail', ajuda: 'Opcional.' },
];

const CONSENTIMENTO_SAUDE: Campo = {
  id: 'consentimento_dados_saude', tipo: 'aceite', obrigatorio: true, largo: true,
  rotulo: 'Autorizo o salão a guardar e usar as informações de saúde desta ficha somente para avaliar a segurança e planejar os meus procedimentos, com acesso restrito à equipe que me atende. Sei que posso pedir acesso, correção ou exclusão desses dados, respeitado o prazo de guarda exigido por lei (LGPD, art. 11).',
};

// -----------------------------------------------------------------------------
// 1. Ficha de anamnese (estética facial e corporal)
// -----------------------------------------------------------------------------
export const ANAMNESE: EsquemaFicha = {
  versao: 'anamnese-2026.1',
  tipo: 'anamnese',
  titulo: 'Ficha de Anamnese',
  subtitulo: 'Estética facial e corporal',
  campoNascimento: 'data_nascimento',
  validadeMeses: 12,
  declaracaoFinal: 'Declaro que as informações acima são verdadeiras e completas e que vou avisar a profissional sobre qualquer mudança na minha saúde antes das próximas sessões.',
  secoes: [
    {
      id: 'dados', titulo: 'Seus dados', campos: [
        ...identificacao(false),
        { id: 'profissao', tipo: 'texto', rotulo: 'Profissão', max: 80, ajuda: 'Ajuda a entender exposição ao sol e rotina.' },
        { id: 'contato_emergencia', tipo: 'texto', rotulo: 'Contato de emergência (nome e telefone)', max: 120, largo: true },
        { id: 'como_conheceu', tipo: 'escolha_unica', rotulo: 'Como conheceu o salão?', opcoes: COMO_CONHECEU },
      ],
    },
    {
      id: 'objetivo', titulo: 'O que você procura', campos: [
        { id: 'queixa_principal', tipo: 'texto_longo', rotulo: 'O que mais te incomoda hoje e qual resultado você espera?', obrigatorio: true, max: 1000, largo: true },
      ],
    },
    {
      id: 'saude', titulo: 'Sua saúde', descricao: 'Algumas condições pedem cuidado ou impedem certos procedimentos. Responda com atenção.', campos: [
        risco('gestante', 'Está gestante ou pode estar?', qual('Quantas semanas?', false)),
        risco('lactante', 'Está amamentando?'),
        risco('alergia', 'Tem alergia (medicamento, cosmético, anestésico, látex, esmalte, alimento)?', qual('A quê?')),
        risco('cardiopatia', 'Tem problema no coração?', qual('Qual?')),
        risco('marca_passo', 'Usa marca-passo ou outro aparelho eletrônico no corpo?'),
        risco('hipertensao', 'Tem pressão alta?'),
        risco('diabetes', 'Tem diabetes?'),
        risco('epilepsia', 'Tem epilepsia ou já teve convulsão?'),
        risco('cancer', 'Tem ou já teve câncer?', qual('Qual, quando e se ainda está em tratamento')),
        risco('coagulacao', 'Tem hemofilia ou outro problema de coagulação?'),
        risco('circulacao', 'Tem trombose, varizes ou outro problema de circulação?'),
        risco('herpes', 'Tem herpes que volta de tempos em tempos?', qual('Em qual região?', false)),
        risco('queloide', 'Tem tendência a queloide (cicatriz alta)?'),
        risco('doenca_pele', 'Tem doença de pele (melasma, psoríase, vitiligo, rosácea, dermatite)?', qual('Qual?')),
        risco('autoimune', 'Tem doença autoimune (lúpus, artrite, tireoide)?', qual('Qual?')),
        risco('protese_metal', 'Tem prótese, placa ou pino de metal no corpo?', qual('Em qual região?')),
        risco('cirurgia_recente', 'Fez cirurgia nos últimos 6 meses?', qual('Qual e quando?')),
        simNao('outra_doenca', 'Tem outra condição de saúde que devemos saber?', qual('Qual?')),
      ],
    },
    {
      id: 'medicamentos', titulo: 'Medicamentos e produtos', campos: [
        simNao('medicamentos', 'Usa algum medicamento contínuo?', qual('Quais?')),
        risco('isotretinoina', 'Usou isotretinoína (Roacutan) nos últimos 6 meses?'),
        risco('anticoagulante', 'Usa anticoagulante ou AAS (aspirina) com frequência?'),
        risco('corticoide', 'Usa corticoide (comprimido, injeção ou pomada)?'),
        simNao('hormonal', 'Usa anticoncepcional ou outra medicação hormonal?', qual('Qual?', false)),
        risco('acidos', 'Usou ácidos, peeling ou retinoides na pele nos últimos 15 dias?', qual('Qual produto?', false)),
      ],
    },
    {
      id: 'habitos', titulo: 'Hábitos', campos: [
        { id: 'agua', tipo: 'escolha_unica', rotulo: 'Quanta água você bebe por dia?', obrigatorio: true,
          opcoes: [{ valor: 'menos_1l', rotulo: 'Menos de 1 litro' }, { valor: '1_2l', rotulo: '1 a 2 litros' }, { valor: 'mais_2l', rotulo: 'Mais de 2 litros' }] },
        { id: 'fumo', tipo: 'escolha_unica', rotulo: 'Fuma?', obrigatorio: true,
          opcoes: [{ valor: 'nao', rotulo: 'Não' }, { valor: 'sim', rotulo: 'Sim', alerta: true }, { valor: 'parou', rotulo: 'Parei' }] },
        { id: 'alcool', tipo: 'escolha_unica', rotulo: 'Bebida alcoólica', obrigatorio: true,
          opcoes: [{ valor: 'nao', rotulo: 'Não bebo' }, { valor: 'social', rotulo: 'Socialmente' }, { valor: 'frequente', rotulo: 'Com frequência' }] },
        { id: 'sono', tipo: 'escolha_unica', rotulo: 'Como é o seu sono?', obrigatorio: true,
          opcoes: [{ valor: 'bom', rotulo: 'Durmo bem' }, { valor: 'regular', rotulo: 'Regular' }, { valor: 'ruim', rotulo: 'Durmo mal' }] },
        simNao('alimentacao', 'Tem alimentação equilibrada?'),
        simNao('atividade_fisica', 'Pratica atividade física?'),
        { id: 'sol', tipo: 'escolha_unica', rotulo: 'Fica exposta ao sol?', obrigatorio: true,
          opcoes: [{ valor: 'raramente', rotulo: 'Raramente' }, { valor: 'as_vezes', rotulo: 'Às vezes' }, { valor: 'muito', rotulo: 'Muito (trabalho, praia, piscina)', alerta: true }] },
        { id: 'protetor', tipo: 'escolha_unica', rotulo: 'Usa protetor solar?', obrigatorio: true,
          opcoes: [{ valor: 'diario', rotulo: 'Todo dia' }, { valor: 'as_vezes', rotulo: 'Às vezes' }, { valor: 'nao', rotulo: 'Não uso' }] },
      ],
    },
    {
      id: 'historico', titulo: 'Procedimentos anteriores', campos: [
        simNao('procedimento_anterior', 'Já fez procedimento estético?', qual('Qual e quando?')),
        risco('reacao_anterior', 'Já teve alguma reação ruim a procedimento estético?', qual('Qual reação e em qual procedimento?')),
      ],
    },
    { id: 'consentimento', titulo: 'Consentimento', campos: [CONSENTIMENTO_SAUDE] },
  ],
};

// -----------------------------------------------------------------------------
// 2. Fotodepilação (laser / luz intensa pulsada)
// -----------------------------------------------------------------------------
export const FOTODEPILACAO: EsquemaFicha = {
  versao: 'fotodepilacao-2026.1',
  tipo: 'fotodepilacao',
  titulo: 'Fotodepilação: Laser / Luz Intensa Pulsada',
  subtitulo: 'Avaliação e termo de autorização',
  campoNascimento: 'data_nascimento',
  validadeMeses: 12,
  declaracaoFinal: 'Declaro que as informações acima são verdadeiras e completas, que recebi as orientações e tirei minhas dúvidas, e autorizo a fotodepilação nas áreas indicadas.',
  secoes: [
    {
      id: 'dados', titulo: 'Seus dados', campos: [
        ...identificacao(true),
        { id: 'como_conheceu', tipo: 'escolha_unica', rotulo: 'Como conheceu o salão?', opcoes: COMO_CONHECEU },
      ],
    },
    {
      id: 'areas', titulo: 'Áreas e pelos', campos: [
        { id: 'areas', tipo: 'escolha_multipla', rotulo: 'Áreas que deseja tratar', obrigatorio: true, largo: true, opcoes: [
          { valor: 'buco', rotulo: 'Buço' }, { valor: 'queixo', rotulo: 'Queixo' }, { valor: 'rosto', rotulo: 'Rosto inteiro' },
          { valor: 'axilas', rotulo: 'Axilas' }, { valor: 'bracos', rotulo: 'Braços' }, { valor: 'abdomen', rotulo: 'Abdômen / linha alba' },
          { valor: 'costas', rotulo: 'Costas' }, { valor: 'virilha_simples', rotulo: 'Virilha simples' }, { valor: 'virilha_completa', rotulo: 'Virilha completa' },
          { valor: 'perianal', rotulo: 'Perianal' }, { valor: 'coxas', rotulo: 'Coxas' }, { valor: 'meia_perna', rotulo: 'Meia perna' },
          { valor: 'pernas', rotulo: 'Pernas inteiras' }, { valor: 'pes', rotulo: 'Pés e dedos' },
        ] },
        { id: 'outras_areas', tipo: 'texto', rotulo: 'Outra área', max: 120 },
        { id: 'fototipo', tipo: 'escolha_unica', rotulo: 'Qual descrição mais combina com a sua pele?', obrigatorio: true, largo: true,
          ajuda: 'Escala de Fitzpatrick. A profissional confirma na avaliação.', opcoes: [
            { valor: 'i', rotulo: 'I: muito clara, sempre queima e nunca bronzeia' },
            { valor: 'ii', rotulo: 'II: clara, queima fácil e bronzeia pouco' },
            { valor: 'iii', rotulo: 'III: morena clara, às vezes queima e bronzeia aos poucos' },
            { valor: 'iv', rotulo: 'IV: morena, raramente queima e bronzeia fácil' },
            { valor: 'v', rotulo: 'V: morena escura, quase nunca queima', alerta: true },
            { valor: 'vi', rotulo: 'VI: negra, nunca queima', alerta: true },
          ] },
        { id: 'cor_pelo', tipo: 'escolha_unica', rotulo: 'Cor dos pelos na área', obrigatorio: true,
          ajuda: 'Pelos claros respondem pouco à luz.', opcoes: [
            { valor: 'preto', rotulo: 'Preto' }, { valor: 'castanho_escuro', rotulo: 'Castanho escuro' },
            { valor: 'castanho_claro', rotulo: 'Castanho claro' }, { valor: 'loiro', rotulo: 'Loiro', alerta: true },
            { valor: 'ruivo', rotulo: 'Ruivo', alerta: true }, { valor: 'branco', rotulo: 'Branco ou grisalho', alerta: true },
          ] },
        { id: 'metodo_atual', tipo: 'escolha_multipla', rotulo: 'Como você tira os pelos hoje?', obrigatorio: true, opcoes: [
          { valor: 'lamina', rotulo: 'Lâmina' }, { valor: 'cera', rotulo: 'Cera' }, { valor: 'pinca_linha', rotulo: 'Pinça ou linha' },
          { valor: 'creme', rotulo: 'Creme depilatório' }, { valor: 'laser', rotulo: 'Já fiz laser / luz pulsada' }, { valor: 'nada', rotulo: 'Não tiro' },
        ] },
        risco('cera_30_dias', 'Usou cera, pinça, linha ou epilador na área nos últimos 30 dias?',
          { ajuda: 'Esses métodos arrancam a raiz que a luz precisa encontrar. Entre as sessões, use só lâmina.' }),
      ],
    },
    {
      id: 'sol', titulo: 'Sol e bronzeado', campos: [
        risco('bronzeada', 'Está bronzeada agora?'),
        risco('sol_30_dias', 'Tomou sol, fez bronzeamento artificial ou usou autobronzeador nos últimos 30 dias?'),
        risco('sol_proximos', 'Vai à praia, piscina ou tomar sol nos próximos 30 dias?'),
      ],
    },
    {
      id: 'saude', titulo: 'Sua saúde', descricao: 'A luz pulsada não é feita em algumas condições. Responda com atenção.', campos: [
        risco('gestante', 'Está gestante ou pode estar?'),
        risco('lactante', 'Está amamentando?'),
        risco('cancer_pele', 'Tem ou já teve câncer de pele ou melanoma?'),
        risco('cancer', 'Tem ou já teve outro câncer, ou faz quimioterapia ou radioterapia?', qual('Qual e quando?')),
        risco('epilepsia', 'Tem epilepsia ou convulsão provocada por luz?'),
        risco('diabetes', 'Tem diabetes?'),
        simNao('hipertensao', 'Tem pressão alta?'),
        risco('queloide', 'Tem tendência a queloide (cicatriz alta)?'),
        risco('doenca_pele', 'Tem doença de pele na área (melasma, psoríase, vitiligo, ferida)?', qual('Qual?')),
        risco('herpes', 'Tem herpes que volta na área (por exemplo, perto da boca)?'),
        risco('verrugas', 'Tem verrugas ou HPV na área?'),
        risco('autoimune', 'Tem lúpus ou outra doença autoimune?', qual('Qual?')),
        simNao('ovario_policistico', 'Tem ovário policístico ou outra alteração hormonal?',
          { ajuda: 'Não impede, mas pode pedir mais sessões.' }),
        risco('tatuagem_area', 'Tem tatuagem, micropigmentação ou pinta escura na área?', qual('Onde?')),
        risco('implante_area', 'Tem preenchimento, fio ou implante na área nos últimos 30 dias?'),
      ],
    },
    {
      id: 'medicamentos', titulo: 'Medicamentos', campos: [
        risco('isotretinoina', 'Usou isotretinoína (Roacutan) nos últimos 6 meses?'),
        risco('fotossensibilizante', 'Usa remédio que deixa a pele sensível ao sol (alguns antibióticos, anti-inflamatórios, diuréticos, antidepressivos, erva-de-são-joão)?', qual('Qual?')),
        risco('acidos', 'Usou ácidos, peeling ou retinoides na área nos últimos 15 dias?'),
        risco('anticoagulante', 'Usa anticoagulante?'),
        simNao('terapia_hormonal', 'Faz terapia hormonal ou usa anabolizante?', qual('Qual?', false)),
        simNao('medicamentos', 'Usa outro medicamento contínuo?', qual('Quais?')),
      ],
    },
    {
      id: 'ciencia', titulo: 'Orientações e ciência', campos: [
        { id: 'ciencia_cuidados', tipo: 'aceite', obrigatorio: true, largo: true,
          rotulo: 'Recebi e entendi os cuidados: não tomar sol e usar protetor FPS 30 ou mais na área; entre as sessões, usar só lâmina (nada de cera, pinça ou linha); evitar calor, sauna e exercício intenso por 24 a 48 horas; hidratar a pele.' },
        { id: 'ciencia_riscos', tipo: 'aceite', obrigatorio: true, largo: true,
          rotulo: 'Fui informada de que podem acontecer vermelhidão, inchaço e sensação de calor e, com menos frequência, bolhas, crostas e manchas claras ou escuras; e de que devo avisar o salão se tiver qualquer reação.' },
        { id: 'ciencia_resultado', tipo: 'aceite', obrigatorio: true, largo: true,
          rotulo: 'Sei que o resultado varia com a cor do pelo, o tom da pele e fatores hormonais, que são necessárias várias sessões no intervalo indicado e que não há garantia de eliminar 100% dos pelos.' },
        { id: 'ciencia_teste', tipo: 'aceite', obrigatorio: true, largo: true,
          rotulo: 'Sei que pode ser feito um teste em pequena área antes da primeira sessão.' },
        CONSENTIMENTO_SAUDE,
      ],
    },
  ],
};

// -----------------------------------------------------------------------------
// 3. Termo de consentimento e autorização (qualquer procedimento)
// -----------------------------------------------------------------------------
export const TERMO: EsquemaFicha = {
  versao: 'termo-2026.1',
  tipo: 'termo',
  titulo: 'Termo de Consentimento e Autorização',
  subtitulo: 'Procedimento estético',
  campoNascimento: 'data_nascimento',
  declaracaoFinal: 'Li este termo, tive a oportunidade de tirar minhas dúvidas e concordo com o que está acima.',
  secoes: [
    {
      id: 'procedimento', titulo: 'Procedimento combinado', descricao: 'Preenchido pelo salão.', campos: [
        { id: 'procedimento', tipo: 'texto', rotulo: 'Procedimento', obrigatorio: true, origem: 'salao', max: 160, largo: true },
        { id: 'regiao', tipo: 'texto', rotulo: 'Região do corpo', origem: 'salao', max: 120 },
        { id: 'sessoes', tipo: 'numero', rotulo: 'Sessões previstas', origem: 'salao', min: 1, max: 50 },
        { id: 'intervalo_dias', tipo: 'numero', rotulo: 'Intervalo entre sessões (dias)', origem: 'salao', min: 1, max: 365 },
        { id: 'resultado_dias', tipo: 'numero', rotulo: 'Prazo para ver o resultado (dias)', origem: 'salao', min: 1, max: 365 },
        { id: 'valor', tipo: 'numero', rotulo: 'Valor (R$)', obrigatorio: true, origem: 'salao', min: 0, max: 100000 },
        { id: 'forma_pagamento', tipo: 'escolha_unica', rotulo: 'Forma de pagamento', obrigatorio: true, origem: 'salao', opcoes: [
          { valor: 'pix', rotulo: 'Pix' }, { valor: 'dinheiro', rotulo: 'Dinheiro' }, { valor: 'debito', rotulo: 'Cartão de débito' },
          { valor: 'credito', rotulo: 'Cartão de crédito' }, { valor: 'pacote', rotulo: 'Pacote de sessões' },
        ] },
        { id: 'orientacoes', tipo: 'texto_longo', rotulo: 'Cuidados antes e depois', origem: 'salao', max: 2000, largo: true },
      ],
    },
    { id: 'dados', titulo: 'Seus dados', campos: identificacao(true) },
    {
      id: 'ciencia', titulo: 'Ciência e autorização', campos: [
        { id: 'ciencia_orientacoes', tipo: 'aceite', obrigatorio: true, largo: true,
          rotulo: 'A profissional me explicou como é o procedimento, os cuidados antes e depois e o que pode acontecer, e tirei minhas dúvidas.' },
        { id: 'ciencia_riscos', tipo: 'aceite', obrigatorio: true, largo: true,
          rotulo: 'Entendo que todo procedimento estético tem riscos e que o resultado depende também da resposta do meu organismo e de eu seguir as orientações, sem garantia de resultado específico.' },
        { id: 'declaracao_saude', tipo: 'aceite', obrigatorio: true, largo: true,
          rotulo: 'Informei na ficha de anamnese todas as minhas condições de saúde, medicamentos e alergias, e vou avisar se algo mudar.' },
        { id: 'autorizacao', tipo: 'aceite', obrigatorio: true, largo: true,
          rotulo: 'Autorizo a realização do procedimento descrito acima.' },
      ],
    },
    {
      id: 'imagem', titulo: 'Uso de imagem', descricao: 'Autorização gratuita, separada do procedimento. Você pode mudar de ideia quando quiser pelo WhatsApp do salão; vale para as publicações seguintes.', campos: [
        { id: 'imagem_acompanhamento', tipo: 'escolha_unica', rotulo: 'Fotos de antes e depois para acompanhar o meu tratamento (uso interno, sem publicar)', obrigatorio: true, largo: true,
          opcoes: [{ valor: 'sim', rotulo: 'Autorizo' }, { valor: 'nao', rotulo: 'Não autorizo' }] },
        { id: 'imagem_divulgacao', tipo: 'escolha_unica', rotulo: 'Publicar fotos ou vídeos nas redes sociais e materiais do salão', obrigatorio: true, largo: true,
          opcoes: [
            { valor: 'nao', rotulo: 'Não autorizo' },
            { valor: 'sem_rosto', rotulo: 'Autorizo sem mostrar meu rosto, nome ou tatuagens' },
            { valor: 'com_rosto', rotulo: 'Autorizo, inclusive com meu rosto' },
          ] },
      ],
    },
  ],
};

export const MODELOS: Record<TipoFicha, EsquemaFicha> = { anamnese: ANAMNESE, fotodepilacao: FOTODEPILACAO, termo: TERMO };

export const ROTULO_TIPO: Record<TipoFicha, string> = {
  anamnese: 'Ficha de anamnese',
  fotodepilacao: 'Fotodepilação (laser / IPL)',
  termo: 'Termo de consentimento',
};

export const TIPOS_FICHA: TipoFicha[] = ['anamnese', 'fotodepilacao', 'termo'];
