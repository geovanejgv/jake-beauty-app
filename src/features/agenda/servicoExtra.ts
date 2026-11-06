// Serviço extra para uma cliente já agendada (na edição do agendamento ou no checkout).
// Cada serviço continua sendo um atendimento próprio, criado pela função do banco
// agendar_atendimento, que confere de novo permissão, catálogo e valores.
import { lerValor } from '../../lib/formatos';
import type { Servico, Vinculo } from '../catalogo/api';
import { condicoesEfetivas, type Condicoes } from '../catalogo/logic';

export type ServicoExtra = {
  chave: string;
  servicoId: string | null; // null = procedimento avulso
  nome: string;
  minutos: number;
  /** Valor informado; null = o do catálogo (calculado pelo banco). */
  valor: number | null;
  /** Valor mostrado na tela (o informado ou o do catálogo). */
  valorExibido: number;
};

export type Oferta = { s: Servico; c: Condicoes };

/** Serviços que o profissional oferece, com preço e tempo dele. */
export function ofertasDoProfissional(servicos: Servico[], vinculos: Vinculo[], profissionalId: string | null | undefined): Oferta[] {
  if (!profissionalId) return [];
  return servicos
    .map((s) => ({ s, c: condicoesEfetivas(s, vinculos.find((v) => v.user_id === profissionalId && v.servico_id === s.id), null) }))
    .filter((x) => x.c.oferece);
}

export type FormExtra = {
  escolha: string; // '' | 'avulso' | id do serviço
  nomeAvulso: string;
  minutosAvulso: string;
  valor: string; // vazio = valor do catálogo
};

/** Valida o formulário (mesmas regras do banco) e devolve o serviço ou a mensagem de erro. */
export function montarExtra(f: FormExtra, ofertas: Oferta[], podeDefinirValor: boolean, chave: string): ServicoExtra | string {
  if (!f.escolha) return 'Escolha o serviço.';
  const texto = f.valor.trim();
  const valor = texto && podeDefinirValor ? lerValor(texto) : null;
  if (texto && podeDefinirValor && (valor === null || valor > 100000)) return 'Valor inválido.';
  if (f.escolha === 'avulso') {
    const nome = f.nomeAvulso.trim();
    if (!nome || nome.length > 120) return 'Informe o procedimento (até 120 caracteres).';
    const minutos = Number(f.minutosAvulso);
    if (!Number.isInteger(minutos) || minutos < 5 || minutos > 600) return 'Duração entre 5 e 600 minutos.';
    const v = texto ? lerValor(texto) : 0;
    if (v === null || v > 100000) return 'Valor inválido.';
    return { chave, servicoId: null, nome, minutos, valor: v, valorExibido: v };
  }
  const oferta = ofertas.find((o) => o.s.id === f.escolha);
  if (!oferta) return 'Este profissional não oferece o serviço escolhido.';
  return { chave, servicoId: oferta.s.id, nome: oferta.s.nome, minutos: oferta.c.minutos, valor, valorExibido: valor ?? oferta.c.valor };
}

/** Início de cada extra, um depois do outro, a partir do fim do atendimento. */
export function iniciosEmSequencia(fimBase: Date, extras: Pick<ServicoExtra, 'minutos'>[]): Date[] {
  let t = fimBase.getTime();
  return extras.map((e) => {
    const ini = new Date(t);
    t += e.minutos * 60000;
    return ini;
  });
}

/** Soma dos valores dos extras (os do catálogo pelo valor mostrado). */
export const totalExtras = (extras: Pick<ServicoExtra, 'valorExibido'>[]) =>
  Math.round(extras.reduce((s, e) => s + e.valorExibido, 0) * 100) / 100;
