// Leads: a possível cliente, do primeiro contato até virar cliente (funil).
// Mesmas listas e limites das restrições da tabela leads (migração 20261023120000_leads.sql);
// o banco confere de novo, esta validação só dá a mensagem certa na tela.

export const ETAPAS_LEAD = ['novo', 'contato', 'consulta', 'proposta', 'negociacao', 'fechado', 'perdido'] as const;
export type EtapaLead = (typeof ETAPAS_LEAD)[number];

export const ROTULO_ETAPA: Record<EtapaLead, string> = {
  novo: 'Novo',
  contato: 'Em contato',
  consulta: 'Avaliação',
  proposta: 'Orçamento enviado',
  negociacao: 'Negociação',
  fechado: 'Fechou',
  perdido: 'Perdido',
};

/** Cor da borda superior de cada coluna do funil. */
export const COR_ETAPA: Record<EtapaLead, string> = {
  novo: 'border-t-slate-400',
  contato: 'border-t-sky-500',
  consulta: 'border-t-indigo-500',
  proposta: 'border-t-amber-500',
  negociacao: 'border-t-orange-500',
  fechado: 'border-t-emerald-600',
  perdido: 'border-t-red-500',
};

export const ORIGENS_LEAD = ['indicacao', 'instagram', 'site', 'google', 'whatsapp', 'evento', 'outro'] as const;
export type OrigemLead = (typeof ORIGENS_LEAD)[number];

export const ROTULO_ORIGEM: Record<OrigemLead, string> = {
  indicacao: 'Indicação',
  instagram: 'Instagram',
  site: 'Site',
  google: 'Google',
  whatsapp: 'WhatsApp',
  evento: 'Evento',
  outro: 'Outro',
};

export type Lead = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  origem: OrigemLead | null;
  interesse: string | null;
  resumo: string | null;
  etapa: EtapaLead;
  valor_estimado: number | null;
  proxima_acao: string | null;
  proxima_acao_em: string | null;
  motivo_perda: string | null;
  responsavel_id: string | null;
  client_id: string | null;
  fechado_em: string | null;
  created_at: string;
  updated_at: string;
};

/** O que a tela envia para gravar (texto vazio vira null; o banco grava autor, datas e regras). */
export type DadosLead = {
  nome: string;
  telefone: string | null;
  email: string | null;
  origem: OrigemLead | null;
  interesse: string | null;
  resumo: string | null;
  etapa: EtapaLead;
  valor_estimado: number | null;
  proxima_acao: string | null;
  proxima_acao_em: string | null;
  motivo_perda: string | null;
  responsavel_id: string | null;
};

const vazio = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/** Campos do formulário -> dados para gravar (texto vazio vira null; motivo só em "perdido"). */
export function dadosDoFormulario(f: Record<keyof DadosLead, string>, valor: number | null): DadosLead {
  const etapa = f.etapa as EtapaLead;
  return {
    nome: f.nome.trim().replace(/\s+/g, ' '),
    telefone: vazio(f.telefone),
    email: vazio(f.email),
    origem: (vazio(f.origem) as OrigemLead | null),
    interesse: vazio(f.interesse),
    resumo: vazio(f.resumo),
    etapa,
    valor_estimado: valor,
    proxima_acao: vazio(f.proxima_acao),
    proxima_acao_em: vazio(f.proxima_acao_em),
    motivo_perda: etapa === 'perdido' ? vazio(f.motivo_perda) : null,
    responsavel_id: vazio(f.responsavel_id),
  };
}

/** Mesmas regras dos CHECK da tabela. null = válido; texto = o que corrigir. */
export function validarLead(d: DadosLead): string | null {
  if (d.nome.length < 2) return 'Nome: informe ao menos 2 caracteres.';
  if (d.nome.length > 200) return 'Nome: no máximo 200 caracteres.';
  if (d.telefone && (d.telefone.length > 30 || !/^[\d\s()+.-]*$/.test(d.telefone))) return 'Telefone inválido.';
  if (d.email && (d.email.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email))) return 'E-mail inválido.';
  if (d.origem && !ORIGENS_LEAD.includes(d.origem)) return 'Escolha como a cliente chegou.';
  if (!ETAPAS_LEAD.includes(d.etapa)) return 'Escolha a etapa.';
  if (d.interesse && d.interesse.length > 80) return 'Interesse: no máximo 80 caracteres.';
  if (d.resumo && d.resumo.length > 4000) return 'Resumo: no máximo 4000 caracteres.';
  if (d.proxima_acao && d.proxima_acao.length > 300) return 'Próxima ação: no máximo 300 caracteres.';
  if (d.proxima_acao_em && !/^\d{4}-\d{2}-\d{2}$/.test(d.proxima_acao_em)) return 'Data da próxima ação inválida.';
  if (d.motivo_perda && d.motivo_perda.length > 500) return 'Motivo da perda: no máximo 500 caracteres.';
  if (d.valor_estimado !== null && (d.valor_estimado < 0 || d.valor_estimado > 10_000_000_000)) return 'Valor estimado inválido.';
  return null;
}

export const etapaAberta = (e: EtapaLead) => e !== 'fechado' && e !== 'perdido';

/** Indicadores do topo do funil. `hoje` em AAAA-MM-DD (fuso de São Paulo). */
export function indicadoresLeads(leads: Pick<Lead, 'etapa' | 'valor_estimado' | 'proxima_acao_em'>[], hoje: string) {
  const abertos = leads.filter((l) => etapaAberta(l.etapa));
  const fechados = leads.filter((l) => l.etapa === 'fechado').length;
  const perdidos = leads.filter((l) => l.etapa === 'perdido').length;
  return {
    emAndamento: abertos.length,
    valorEmNegociacao: abertos.reduce((s, l) => s + (l.valor_estimado ?? 0), 0),
    fechados,
    perdidos,
    conversao: fechados + perdidos ? Math.round((fechados / (fechados + perdidos)) * 100) : null,
    atrasados: abertos.filter((l) => !!l.proxima_acao_em && l.proxima_acao_em < hoje).length,
  };
}

export const acaoAtrasada = (l: Pick<Lead, 'etapa' | 'proxima_acao_em'>, hoje: string) =>
  etapaAberta(l.etapa) && !!l.proxima_acao_em && l.proxima_acao_em < hoje;

/** WhatsApp precisa de DDD + número (10 ou mais dígitos). */
export const temTelefone = (t: string | null | undefined): t is string => !!t && t.replace(/\D/g, '').length >= 10;

/** Link do WhatsApp com mensagem pronta (55 na frente quando o número não traz o país). */
export function linkWhatsapp(telefone: string, texto: string): string {
  const d = telefone.replace(/\D/g, '');
  const numero = d.length > 11 && d.startsWith('55') ? d : `55${d}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0];

/** Mensagem para retomar o contato nas etapas antes do fechamento. */
export function mensagemContato(nome: string, estabelecimento?: string | null, assinatura?: string | null): string {
  return [
    `Olá, ${primeiroNome(nome)}! Tudo bem?`,
    '',
    `${estabelecimento ? `Aqui é do ${estabelecimento}. ` : ''}Estou entrando em contato sobre o seu atendimento. Podemos conversar?`,
    assinatura ? `\n${assinatura}` : '',
  ].join('\n').trim();
}

/** Boas-vindas quando a possível cliente fecha. */
export function mensagemBoasVindas(nome: string, estabelecimento?: string | null, assinatura?: string | null): string {
  return [
    `Olá, ${primeiroNome(nome)}! Tudo bem?`,
    '',
    `Seja muito bem-vinda(o)${estabelecimento ? ` ao ${estabelecimento}` : ''}! Já deixamos tudo pronto para o seu atendimento.`,
    'Qualquer dúvida, é só chamar por aqui.',
    assinatura ? `\n${assinatura}` : '',
  ].join('\n').trim();
}

/** Sugestões do campo Interesse: serviços do catálogo + os já usados, sem repetir (acento e caixa). */
export function opcoesDeInteresse(...listas: readonly (string | null | undefined)[][]): string[] {
  const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const mapa = new Map<string, string>();
  for (const lista of listas) for (const v of lista) if (v?.trim() && !mapa.has(chave(v))) mapa.set(chave(v), v.trim());
  return [...mapa.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
