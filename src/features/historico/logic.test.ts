import { describe, expect, it } from 'vitest';
import {
  clientesDosAtendimentos, clientesParaReativar, diasEntre, filtrarAtendimentos, FILTROS_ATENDIMENTOS_PADRAO, FILTROS_REATIVAR_PADRAO,
  indicadoresRetorno, periodoDoAtalho, retornoDaCliente, somarDias, totaisAtendimentos,
  type ClienteReativacao, type LinhaHistorico,
} from './logic';

const HOJE = '2026-10-29';
const meioDia = (dia: string) => `${dia}T12:00:00`;

const cliente = (id: string, ultimoDia: string, extra: Partial<ClienteReativacao> = {}): ClienteReativacao => ({
  cliente_id: id, nome: `Cliente ${id}`, telefone: '11999990000', ultimo_atendimento: meioDia(ultimoDia),
  ultimo_servico: 'Manicure', ultimo_profissional: 'Pro', retorno_ciclo_dias: null, visitas_12m: 1,
  intervalo_medio_dias: null, total_12m: 0, ticket_medio_12m: null, proximo_agendamento: null, ...extra,
});

describe('datas', () => {
  it('soma e diferença em dias', () => {
    expect(somarDias('2026-10-29', 3)).toBe('2026-11-01');
    expect(diasEntre('2026-10-01', '2026-10-29')).toBe(28);
  });
});

describe('retornoDaCliente', () => {
  it('ciclo do serviço, média da cliente ou 45 dias', () => {
    const porServico = retornoDaCliente(cliente('a', '2026-10-01', { retorno_ciclo_dias: 15, intervalo_medio_dias: 30 }), HOJE);
    expect(porServico).toMatchObject({ previsto: '2026-10-16', origemCiclo: 'servico', atrasoDias: 13, situacao: 'vencido', diasSemVir: 28 });
    expect(retornoDaCliente(cliente('b', '2026-10-01', { intervalo_medio_dias: 40.4 }), HOJE)).toMatchObject({ previsto: '2026-11-10', origemCiclo: 'media', situacao: 'em_dia' });
    expect(retornoDaCliente(cliente('c', '2026-10-01'), HOJE)).toMatchObject({ previsto: '2026-11-15', origemCiclo: 'padrao' });
  });
  it('próximo, inativa e perdida', () => {
    expect(retornoDaCliente(cliente('a', '2026-10-10', { retorno_ciclo_dias: 21 }), HOJE).situacao).toBe('proximo');
    expect(retornoDaCliente(cliente('a', '2026-10-08', { retorno_ciclo_dias: 21 }), HOJE).situacao).toBe('proximo');
    expect(retornoDaCliente(cliente('b', '2026-07-01'), HOJE).situacao).toBe('inativa');
    expect(retornoDaCliente(cliente('c', '2026-03-01'), HOJE).situacao).toBe('perdida');
  });
});

describe('clientesParaReativar', () => {
  const lista = [
    cliente('vencida_barata', '2026-09-01', { retorno_ciclo_dias: 15, total_12m: 100 }),
    cliente('vencida_cara', '2026-10-01', { retorno_ciclo_dias: 15, total_12m: 900 }),
    cliente('agendada', '2026-09-01', { retorno_ciclo_dias: 15, total_12m: 2000, proximo_agendamento: '2026-11-02T10:00:00Z' }),
    cliente('em_dia', '2026-10-25', { retorno_ciclo_dias: 30 }),
    cliente('perdida', '2026-01-10', { total_12m: 5000, telefone: '21988887777' }),
  ];
  it('não traz quem tem agendamento futuro; ordena por vencido, valor e dias sem vir', () => {
    expect(clientesParaReativar(lista, FILTROS_REATIVAR_PADRAO, HOJE).map((c) => c.cliente_id)).toEqual(['vencida_cara', 'vencida_barata']);
  });
  it('filtro de situação e busca por telefone', () => {
    const f = { situacoes: [], semAgendamentoFuturo: false, busca: '988887' };
    expect(clientesParaReativar(lista, f, HOJE).map((c) => c.cliente_id)).toEqual(['perdida']);
    expect(clientesParaReativar(lista, { ...f, busca: '' }, HOJE).map((c) => c.cliente_id)).toEqual(['perdida', 'agendada', 'vencida_cara', 'vencida_barata', 'em_dia']);
  });
  it('indicadores', () => {
    expect(indicadoresRetorno(lista, HOJE)).toEqual({ ativas: 4, vencido: 3, inativas: 0, perdidas: 1 });
  });
});

describe('atendimentos', () => {
  const linha = (id: string, extra: Partial<LinhaHistorico>): LinhaHistorico => ({
    id, start_time: '2026-10-10T13:00:00Z', status: 'completed', valor_cobrado: 100, payment_method: 'pix', professional_id: 'p1',
    client_id: 'c1', servico_id: 's1', cliente_nome: 'Ana Lima', servico_nome: 'Manicure', profissional_nome: 'Pro', ...extra,
  });
  const linhas = [
    linha('1', {}),
    linha('2', { valor_cobrado: 50.5, payment_method: 'credito', servico_id: 's2', client_id: 'c2', cliente_nome: 'Bia' }),
    linha('3', { status: 'cancelled', valor_cobrado: 80 }),
    linha('4', { status: 'no_show', professional_id: 'p2' }),
  ];
  const categorias = new Map([['s1', 'unhas'], ['s2', 'cabelo']]);
  const telefones = new Map<string, string | null>([['c1', '11911112222'], ['c2', null]]);

  it('atalhos de período', () => {
    expect(periodoDoAtalho('hoje', HOJE)).toEqual({ de: HOJE, ate: HOJE });
    expect(periodoDoAtalho('7dias', HOJE)).toEqual({ de: '2026-10-23', ate: HOJE });
    expect(periodoDoAtalho('mes', HOJE)).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(periodoDoAtalho('mes_anterior', '2026-01-15')).toEqual({ de: '2025-12-01', ate: '2025-12-31' });
  });
  it('filtros combinados', () => {
    const f = FILTROS_ATENDIMENTOS_PADRAO;
    expect(filtrarAtendimentos(linhas, { ...f, categoria: 'cabelo' }, categorias, telefones).map((l) => l.id)).toEqual(['2']);
    expect(filtrarAtendimentos(linhas, { ...f, status: 'no_show' }, categorias, telefones).map((l) => l.id)).toEqual(['4']);
    expect(filtrarAtendimentos(linhas, { ...f, busca: '1111' }, categorias, telefones).map((l) => l.id)).toEqual(['1', '3', '4']);
    expect(filtrarAtendimentos(linhas, { ...f, forma: 'credito', profissional: 'p1' }, categorias, telefones).map((l) => l.id)).toEqual(['2']);
  });
  it('totais só com realizados, como o relatório de comissões', () => {
    expect(totaisAtendimentos(linhas)).toEqual({ quantidade: 4, realizados: 2, faturamento: 150.5, ticketMedio: 75.25 });
  });
});

describe('clientes dos atendimentos para o convite', () => {
  const linha = (id: string, client_id: string | null, dia: string, extra: Partial<LinhaHistorico> = {}): LinhaHistorico => ({
    id, start_time: meioDia(dia), status: 'completed', valor_cobrado: 100, payment_method: null, professional_id: 'p', client_id,
    servico_id: 's', cliente_nome: `Cliente ${client_id}`, servico_nome: 'Laser', profissional_nome: 'Jakeline de Jesus', ...extra,
  });
  const reativacao = [{ ...cliente('a', '2026-10-10', { ultimo_servico: 'Drenagem' }), retorno: retornoDaCliente(cliente('a', '2026-10-10'), HOJE) }];
  const agora = new Date(meioDia(HOJE));
  it('uma vez por cliente, na ordem; último serviço concluído vem da reativação', () => {
    const r = clientesDosAtendimentos([linha('1', 'a', '2026-09-01'), linha('2', null, '2026-09-02'), linha('3', 'b', '2026-09-03'), linha('4', 'a', '2026-09-04')],
      reativacao, new Map([['b', '11988887777']]), HOJE, agora);
    expect(r.map((c) => c.cliente_id)).toEqual(['a', 'b']);
    expect(r[0].ultimo_servico).toBe('Drenagem');
    expect(r[1]).toMatchObject({ ultimo_servico: 'Laser', ultimo_profissional: 'Jakeline de Jesus', telefone: '11988887777', proximo_agendamento: null });
    expect(r[1].retorno.ultimoDia).toBe('2026-09-03');
  });
  it('sem atendimento concluído, horário futuro da linha vira próximo agendamento', () => {
    const r = clientesDosAtendimentos([linha('1', 'c', '2026-11-05', { status: 'scheduled' })], [], new Map(), HOJE, agora);
    expect(r[0].proximo_agendamento).toBe(meioDia('2026-11-05'));
  });
});
