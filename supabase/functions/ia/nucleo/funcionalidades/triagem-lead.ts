import { blocoDeDados, REGRAS_GERAIS, type Marcadores } from '../prompt.ts';
import { lerJson, listaDeTextos, objetoEstrito, textoLimitado, umDe } from '../saida.ts';
import { ErroIa } from '../tipos.ts';
import { objeto, texto, uuid } from '../validacao.ts';
import type { FuncionalidadeIa } from './tipos.ts';

type Entrada = { lead_id: string; observacao?: string };

export const TEMPERATURAS = ['fria', 'morna', 'quente'] as const;

export type TriagemLeadIa = {
  resumo: string;
  temperatura: (typeof TEMPERATURAS)[number];
  motivo_temperatura: string;
  servicos_de_interesse: string[];
  perguntas_pendentes: string[];
  alertas: string[];
  proximo_passo: string;
  mensagem_whatsapp: string;
};

const CAMPOS = ['resumo', 'temperatura', 'motivo_temperatura', 'servicos_de_interesse', 'perguntas_pendentes', 'alertas', 'proximo_passo', 'mensagem_whatsapp'];

const ROTULO_ORIGEM: Record<string, string> = {
  indicacao: 'Indicação', instagram: 'Instagram', site: 'Site', google: 'Google', whatsapp: 'WhatsApp', evento: 'Evento', outro: 'Outro',
};

/** Valida a saída do modelo campo a campo (LLM-08). Campo a mais ou fora do limite: descarta. */
export function interpretarTriagemLead(textoJson: string): TriagemLeadIa {
  const o = objetoEstrito(lerJson(textoJson), CAMPOS);
  return {
    resumo: textoLimitado(o.resumo, 1, 1200),
    temperatura: umDe(o.temperatura, TEMPERATURAS),
    motivo_temperatura: textoLimitado(o.motivo_temperatura, 0, 400),
    servicos_de_interesse: listaDeTextos(o.servicos_de_interesse, 8, 120),
    perguntas_pendentes: listaDeTextos(o.perguntas_pendentes, 10, 300),
    alertas: listaDeTextos(o.alertas, 8, 300),
    proximo_passo: textoLimitado(o.proximo_passo, 1, 300),
    mensagem_whatsapp: textoLimitado(o.mensagem_whatsapp, 1, 1000),
  };
}

/** Lead (possível cliente) → resumo, temperatura, próximo passo e mensagem de WhatsApp. Só a administradora lê leads (RLS). */
export const triagemLead: FuncionalidadeIa<Entrada, TriagemLeadIa> = {
  id: 'triagem_lead',
  rotulo: 'Triagem do lead',
  formato: 'json',
  maxTokens: 8000,
  esforco: 'low',

  entrada(bruto) {
    const c = objeto(bruto, ['lead_id', 'observacao']);
    return { lead_id: uuid(c, 'lead_id'), observacao: texto(c, 'observacao', 0, 2000, true) };
  },

  async preparar({ leitor, hoje }, e) {
    const lead = await leitor.lead(e.lead_id);
    if (!lead) throw new ErroIa('nao_encontrado');
    const servicos = await leitor.nomesServicos(80);

    const marcadores: Marcadores = new Map();
    const sistema = [
      REGRAS_GERAIS,
      'Tarefa: analisar um lead (possível cliente) do salão e sugerir como conduzir o contato: resumo do que ela procura, temperatura (chance de fechar), serviços de interesse, perguntas que a equipe ainda precisa fazer, alertas (alergia, gestação, procedimento recente, restrição de horário ou de orçamento) e o próximo passo.',
      'Escreva também uma mensagem curta e acolhedora de WhatsApp para a equipe enviar, tratando a pessoa por [CLIENTE] (sem inventar preço, data ou promoção que não estejam nos dados).',
      'Em "servicos_de_interesse", use preferencialmente nomes da lista de serviços do salão.',
      'Responda SOMENTE com um objeto JSON neste formato, sem texto fora dele:',
      '{"resumo": string (até 1200 caracteres), "temperatura": "fria" | "morna" | "quente", "motivo_temperatura": string, "servicos_de_interesse": [string], "perguntas_pendentes": [string], "alertas": [string], "proximo_passo": string (até 300 caracteres), "mensagem_whatsapp": string (até 1000 caracteres)}',
    ].join('\n');
    const usuario = [
      blocoDeDados('lead', {
        'Data de hoje': hoje,
        'Como chegou': lead.origem ? ROTULO_ORIGEM[lead.origem] ?? lead.origem : null,
        Interesse: lead.interesse,
        'Etapa do funil': lead.etapa,
        'Valor estimado (R$)': lead.valor_estimado,
        'Resumo registrado pela equipe': lead.resumo,
        'Próxima ação registrada': lead.proxima_acao,
        'Motivo da perda': lead.motivo_perda,
        'Cadastrado em': lead.created_at.slice(0, 10),
        'Observação de agora': e.observacao,
      }, marcadores, lead.nome),
      blocoDeDados('servicos_do_salao', { Servicos: servicos }),
      'Produza o JSON agora.',
    ].join('\n\n');
    // O nome nunca vai ao provedor; na resposta, [CLIENTE] vira o primeiro nome.
    marcadores.set('[CLIENTE]', lead.nome.trim().split(/\s+/)[0] ?? '');

    return { prompt: { sistema, usuario }, marcadores, vinculo: { lead_id: lead.id }, parametros: { com_observacao: !!e.observacao } };
  },

  interpretar: interpretarTriagemLead,
};
