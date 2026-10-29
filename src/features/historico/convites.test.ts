import { describe, expect, it } from 'vitest';
import {
  convitesParados, DADOS_EXEMPLO, filtrarAtendimentosPorConvite, filtrarPorConvite, FILTRO_CONVITE_ATENDIMENTOS, FILTRO_CONVITE_PADRAO, indicadoresConvites, linkConvite, MODELOS_SUGERIDOS, preencherMensagem, telefoneWhatsapp,
  travasDoConvite, ultimoPorCliente, type Contato,
} from './convites';

const AGORA = new Date('2026-10-29T12:00:00Z');
const contato = (id: string, extra: Partial<Contato>): Contato => ({
  id, client_id: 'c1', enviado_em: '2026-10-20T12:00:00Z', enviado_por: null, modelo_id: null, texto_enviado: 'Oi',
  resultado: 'enviado', resultado_em: null, agendamento_id: null, ...extra,
});

describe('mensagem', () => {
  it('preenche variáveis e limpa a vazia', () => {
    expect(preencherMensagem('Oi, {primeiro_nome}! Escolha por aqui: {link_agendamento}', DADOS_EXEMPLO)).toBe('Oi, Ana! Escolha por aqui');
    expect(preencherMensagem('{primeiro_nome} , tudo {desconhecida}?', DADOS_EXEMPLO)).toBe('Ana, tudo {desconhecida}?');
  });
  it('modelo padrão sugerido não usa {dias_desde}', () => {
    expect(MODELOS_SUGERIDOS.find((m) => m.padrao)?.texto).not.toContain('{dias_desde}');
  });
});

describe('telefone e link', () => {
  it('aceita celular com ou sem 55 e recusa inválido', () => {
    expect(telefoneWhatsapp('(11) 99999-0000')).toBe('5511999990000');
    expect(telefoneWhatsapp('+55 21 3333-4444')).toBe('552133334444');
    expect(telefoneWhatsapp('9999')).toBeNull();
    expect(telefoneWhatsapp(null)).toBeNull();
    expect(linkConvite('5511999990000', 'Oi, Ana!')).toBe('https://wa.me/5511999990000?text=Oi%2C%20Ana!');
  });
});

describe('travas', () => {
  it('não quer contato e telefone inválido bloqueiam; agendamento e convite recente só avisam', () => {
    const t = travasDoConvite({ naoQuerContato: true, telefone: '1', proximoAgendamento: '2026-11-01T10:00:00Z', ultimoConvite: contato('1', {}) }, AGORA);
    expect(t.map((x) => x.bloqueia)).toEqual([true, true, false, false]);
    expect(t[3].mensagem).toBe('Já recebeu convite há 9 dia(s).');
    expect(travasDoConvite({ naoQuerContato: false, telefone: '11999990000', proximoAgendamento: null, ultimoConvite: contato('1', { enviado_em: '2026-10-01T12:00:00Z' }) }, AGORA)).toEqual([]);
  });
});

describe('convites', () => {
  const lista = [
    contato('a', { enviado_em: '2026-10-01T12:00:00Z', resultado: 'agendou', agendamento_id: 'ag1' }),
    contato('b', { enviado_em: '2026-10-25T12:00:00Z' }),
    contato('c', { client_id: 'c2', enviado_em: '2026-10-10T12:00:00Z', resultado: 'respondeu' }),
    contato('d', { client_id: 'c3', enviado_em: '2026-10-05T12:00:00Z' }),
  ];
  it('último por cliente e parados há mais de 7 dias', () => {
    expect(ultimoPorCliente(lista).get('c1')?.id).toBe('b');
    expect(convitesParados(lista, AGORA).map((c) => c.id)).toEqual(['d']);
  });
  it('indicadores', () => {
    expect(indicadoresConvites(lista, new Map([['ag1', 180]]))).toEqual({ enviados: 4, taxaResposta: 50, taxaReativacao: 25, faturamentoReativado: 180 });
  });
});

describe('filtro de convite', () => {
  const lista = [{ cliente_id: 'c1' }, { cliente_id: 'c2' }, { cliente_id: 'c3' }, { cliente_id: 'c4' }];
  const ultimo = ultimoPorCliente([contato('a', { enviado_em: '2026-10-25T12:00:00Z' }), contato('b', { client_id: 'c2', enviado_em: '2026-08-01T12:00:00Z' })]);
  const naoQuer = new Set(['c4']);
  it('exclui quem não quer contato; nunca recebeu; última mensagem antiga', () => {
    expect(filtrarPorConvite(lista, ultimo, naoQuer, FILTRO_CONVITE_PADRAO, AGORA).map((c) => c.cliente_id)).toEqual(['c1', 'c2', 'c3']);
    expect(filtrarPorConvite(lista, ultimo, naoQuer, { ...FILTRO_CONVITE_PADRAO, convite: 'nunca' }, AGORA).map((c) => c.cliente_id)).toEqual(['c3']);
    expect(filtrarPorConvite(lista, ultimo, naoQuer, { ...FILTRO_CONVITE_PADRAO, convite: 'antigo' }, AGORA).map((c) => c.cliente_id)).toEqual(['c2', 'c3']);
    expect(filtrarPorConvite(lista, ultimo, naoQuer, { ...FILTRO_CONVITE_PADRAO, incluirNaoQuer: true }, AGORA)).toHaveLength(4);
  });
});

describe('filtro de mensagem nos atendimentos', () => {
  const linhas = [{ client_id: 'c1' }, { client_id: 'c2' }, { client_id: 'c2' }, { client_id: 'c3' }, { client_id: null }];
  const ultimo = ultimoPorCliente([contato('a', { enviado_em: '2026-10-25T12:00:00Z' }), contato('b', { client_id: 'c2', enviado_em: '2026-09-20T12:00:00Z' })]);
  const naoQuer = new Set(['c3']);
  it('padrão mostra todas, inclusive sem cliente e quem não quer contato', () => {
    expect(filtrarAtendimentosPorConvite(linhas, ultimo, naoQuer, FILTRO_CONVITE_ATENDIMENTOS, AGORA)).toHaveLength(5);
  });
  it('sem mensagem no período escolhido', () => {
    const f = { ...FILTRO_CONVITE_ATENDIMENTOS, convite: 'antigo' as const, diasSemConvite: 30 };
    expect(filtrarAtendimentosPorConvite(linhas, ultimo, naoQuer, f, AGORA).map((l) => l.client_id)).toEqual(['c2', 'c2', 'c3']);
    expect(filtrarAtendimentosPorConvite(linhas, ultimo, naoQuer, { ...f, diasSemConvite: 60 }, AGORA).map((l) => l.client_id)).toEqual(['c3']);
    expect(filtrarAtendimentosPorConvite(linhas, ultimo, naoQuer, { ...f, incluirNaoQuer: false }, AGORA).map((l) => l.client_id)).toEqual(['c2', 'c2']);
  });
  it('nunca recebeu', () => {
    expect(filtrarAtendimentosPorConvite(linhas, ultimo, naoQuer, { ...FILTRO_CONVITE_ATENDIMENTOS, convite: 'nunca' }, AGORA).map((l) => l.client_id)).toEqual(['c3']);
  });
});
