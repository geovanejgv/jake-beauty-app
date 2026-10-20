import { blocoDeDados, REGRAS_GERAIS, type Marcadores } from '../prompt.ts';
import { inteiroOuNulo, lerJson, listaDeTextos, objetoEstrito, textoLimitado } from '../saida.ts';
import { ErroIa } from '../tipos.ts';
import { objeto, uuid } from '../validacao.ts';
import type { FuncionalidadeIa } from './tipos.ts';

type Entrada = { client_id: string };

export type ResumoClienteIa = {
  resumo: string;
  preferencias: string[];
  cuidados: string[];
  frequencia_media_dias: number | null;
  sugestao_retorno: string;
  servicos_sugeridos: string[];
  mensagem_whatsapp: string;
};

const CAMPOS = ['resumo', 'preferencias', 'cuidados', 'frequencia_media_dias', 'sugestao_retorno', 'servicos_sugeridos', 'mensagem_whatsapp'];

const STATUS: Record<string, string> = {
  completed: 'concluído', scheduled: 'agendado', confirmed: 'confirmado', cancelled: 'cancelado', no_show: 'faltou',
};
const TIPO_ANOTACAO: Record<string, string> = { tecnico: 'técnico', alergia: 'alergia', preferencia: 'preferência', observacao: 'observação' };

/** Limites do contexto: últimos atendimentos e anotações (IAD-03, LLM-11). */
export const LIMITE_ATENDIMENTOS = 40;
export const LIMITE_ANOTACOES = 40;

export function interpretarResumoCliente(textoJson: string): ResumoClienteIa {
  const o = objetoEstrito(lerJson(textoJson), CAMPOS);
  return {
    resumo: textoLimitado(o.resumo, 1, 1500),
    preferencias: listaDeTextos(o.preferencias, 10, 300),
    cuidados: listaDeTextos(o.cuidados, 10, 300),
    frequencia_media_dias: inteiroOuNulo(o.frequencia_media_dias, 1, 730),
    sugestao_retorno: textoLimitado(o.sugestao_retorno, 0, 300),
    servicos_sugeridos: listaDeTextos(o.servicos_sugeridos, 6, 120),
    mensagem_whatsapp: textoLimitado(o.mensagem_whatsapp, 1, 1000),
  };
}

/**
 * Cliente → resumo do histórico, preferências, cuidados, retorno sugerido e mensagem.
 * A leitura usa o cliente do usuário: a profissional só vê os próprios atendimentos e
 * as observações que a permissão dela libera (view clientes_visiveis e RLS da agenda).
 */
export const resumoCliente: FuncionalidadeIa<Entrada, ResumoClienteIa> = {
  id: 'resumo_cliente',
  rotulo: 'Resumo da cliente',
  formato: 'json',
  maxTokens: 8000,
  esforco: 'low',

  entrada(bruto) {
    const c = objeto(bruto, ['client_id']);
    return { client_id: uuid(c, 'client_id') };
  },

  async preparar({ leitor, hoje }, e) {
    const cliente = await leitor.cliente(e.client_id);
    if (!cliente) throw new ErroIa('nao_encontrado');
    const [anotacoes, atendimentos, servicos] = await Promise.all([
      leitor.anotacoesCliente(cliente.id, LIMITE_ANOTACOES),
      leitor.atendimentosCliente(cliente.id, LIMITE_ATENDIMENTOS),
      leitor.nomesServicos(80),
    ]);

    const marcadores: Marcadores = new Map();
    const sistema = [
      REGRAS_GERAIS,
      'Tarefa: resumir o histórico de uma cliente do salão para a profissional se preparar para o próximo atendimento: o que ela costuma fazer, preferências, cuidados (alergias, reações, contraindicações anotadas pela equipe), frequência média entre atendimentos concluídos, quando seria bom o retorno e serviços que combinam com o histórico.',
      'Escreva também uma mensagem curta e cordial de WhatsApp convidando a cliente a agendar o retorno, tratando-a por [CLIENTE] (sem inventar preço, data ou promoção).',
      'Calcule "frequencia_media_dias" só com atendimentos concluídos; com menos de dois, use null.',
      'Responda SOMENTE com um objeto JSON neste formato, sem texto fora dele:',
      '{"resumo": string (até 1500 caracteres), "preferencias": [string], "cuidados": [string], "frequencia_media_dias": número inteiro ou null, "sugestao_retorno": string, "servicos_sugeridos": [string], "mensagem_whatsapp": string (até 1000 caracteres)}',
    ].join('\n');
    const usuario = [
      blocoDeDados('cliente', { 'Data de hoje': hoje, 'Observações do cadastro': cliente.observacoes }, marcadores, cliente.nome),
      blocoDeDados('anotacoes', {
        Anotacoes: anotacoes.map((a) => `${a.created_at.slice(0, 10)} (${TIPO_ANOTACAO[a.tipo] ?? 'observação'}): ${a.texto}`),
      }, marcadores, cliente.nome),
      blocoDeDados('atendimentos', {
        Atendimentos: atendimentos.map((a) => `${a.inicio.slice(0, 10)}: ${a.servico ?? 'serviço não informado'} (${STATUS[a.status ?? ''] ?? 'agendado'})`),
      }, marcadores, cliente.nome),
      blocoDeDados('servicos_do_salao', { Servicos: servicos }),
      'Produza o JSON agora.',
    ].join('\n\n');
    marcadores.set('[CLIENTE]', cliente.nome.trim().split(/\s+/)[0] ?? '');

    return {
      prompt: { sistema, usuario },
      marcadores,
      vinculo: { client_id: cliente.id },
      parametros: { atendimentos: atendimentos.length, anotacoes: anotacoes.length },
    };
  },

  interpretar: interpretarResumoCliente,
};
