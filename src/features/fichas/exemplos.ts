// Respostas fictícias para pré-visualizar os modelos visuais (nenhum dado real).
import type { Respostas, TipoFicha } from './tipos';

const PESSOA: Respostas = {
  nome_completo: 'Ana Exemplo da Silva',
  data_nascimento: '1992-03-13',
  cpf: '52998224725',
  telefone: '11900000000',
};

export const EXEMPLO_SALAO: Record<TipoFicha, Respostas> = {
  anamnese: {},
  fotodepilacao: {},
  termo: {
    procedimento: 'Limpeza de pele profunda',
    regiao: 'Rosto',
    sessoes: 1,
    resultado_dias: 7,
    valor: 180,
    forma_pagamento: 'pix',
    orientacoes: 'Evitar sol e maquiagem por 24 horas. Usar protetor solar FPS 30 ou mais.',
  },
};

export const EXEMPLO_RESPOSTAS: Record<TipoFicha, Respostas> = {
  anamnese: {
    ...PESSOA,
    profissao: 'Recepcionista',
    como_conheceu: 'indicacao',
    queixa_principal: 'Manchas no rosto e poros dilatados. Quero uma pele mais uniforme.',
    gestante: 'nao', lactante: 'nao', alergia: 'sim', alergia__detalhe: 'Dipirona',
    cardiopatia: 'nao', marca_passo: 'nao', hipertensao: 'nao', diabetes: 'nao', epilepsia: 'nao', cancer: 'nao',
    coagulacao: 'nao', circulacao: 'nao', herpes: 'nao', queloide: 'nao', doenca_pele: 'sim', doenca_pele__detalhe: 'Melasma',
    autoimune: 'nao', protese_metal: 'nao', cirurgia_recente: 'nao', outra_doenca: 'nao',
    medicamentos: 'nao', isotretinoina: 'nao', anticoagulante: 'nao', corticoide: 'nao', hormonal: 'sim', hormonal__detalhe: 'Anticoncepcional oral',
    acidos: 'nao',
    agua: '1_2l', fumo: 'nao', alcool: 'social', sono: 'regular', alimentacao: 'sim', atividade_fisica: 'nao', sol: 'as_vezes', protetor: 'as_vezes',
    procedimento_anterior: 'sim', procedimento_anterior__detalhe: 'Limpeza de pele em 2025', reacao_anterior: 'nao',
    consentimento_dados_saude: true,
  },
  fotodepilacao: {
    ...PESSOA,
    como_conheceu: 'instagram',
    areas: ['buco', 'axilas', 'virilha_completa'],
    fototipo: 'iii', cor_pelo: 'castanho_escuro', metodo_atual: ['cera', 'lamina'], cera_30_dias: 'nao',
    bronzeada: 'nao', sol_30_dias: 'nao', sol_proximos: 'sim',
    gestante: 'nao', lactante: 'nao', cancer_pele: 'nao', cancer: 'nao', epilepsia: 'nao', diabetes: 'nao', hipertensao: 'nao',
    queloide: 'nao', doenca_pele: 'nao', herpes: 'sim', verrugas: 'nao', autoimune: 'nao', ovario_policistico: 'sim',
    tatuagem_area: 'nao', implante_area: 'nao',
    isotretinoina: 'nao', fotossensibilizante: 'nao', acidos: 'nao', anticoagulante: 'nao', terapia_hormonal: 'nao', medicamentos: 'nao',
    ciencia_cuidados: true, ciencia_riscos: true, ciencia_resultado: true, ciencia_teste: true, consentimento_dados_saude: true,
  },
  termo: {
    ...PESSOA,
    email: 'ana.exemplo@exemplo.com',
    ciencia_orientacoes: true, ciencia_riscos: true, declaracao_saude: true, autorizacao: true,
    imagem_acompanhamento: 'sim', imagem_divulgacao: 'sem_rosto',
  },
};
