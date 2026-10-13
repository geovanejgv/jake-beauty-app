import { describe, expect, it } from 'vitest';
import { nomeDoServico, proximosPagamentos, separarAgenda, somarDias, tarefasDoDia, type EventoDoDia, type LancamentoPendente, type TarefaComPrazo } from './logic';

const ev = (id: string, ini: string, x: Partial<EventoDoDia> = {}): EventoDoDia => ({
  id, start_time: ini, end_time: null, status: 'scheduled', is_block: false, is_manual_reminder: false,
  block_reason: null, professional_id: 'p1', notes: null, ...x,
});

describe('agenda do dia', () => {
  it('separa atendimentos, bloqueios e lembretes em ordem de horário, sem cancelados e faltas', () => {
    const r = separarAgenda([
      ev('b', '2026-10-13T15:00:00Z', { is_block: true, block_reason: 'Almoço' }),
      ev('a2', '2026-10-13T14:00:00Z'),
      ev('a1', '2026-10-13T12:00:00Z', { status: 'confirmed' }),
      ev('c', '2026-10-13T13:00:00Z', { status: 'cancelled' }),
      ev('f', '2026-10-13T13:30:00Z', { status: 'no_show' }),
      ev('l', '2026-10-13T11:00:00Z', { is_manual_reminder: true }),
    ]);
    expect(r.atendimentos.map((e) => e.id)).toEqual(['a1', 'a2']);
    expect(r.bloqueios.map((e) => e.id)).toEqual(['b']);
    expect(r.lembretes.map((e) => e.id)).toEqual(['l']);
  });
  it('nome do serviço: catálogo, avulso antigo, observação', () => {
    expect(nomeDoServico(ev('x', 'x', { servicos: { nome: 'Corte' }, services: { name: 'Antigo' } }))).toBe('Corte');
    expect(nomeDoServico(ev('x', 'x', { services: { name: 'Antigo' } }))).toBe('Antigo');
    expect(nomeDoServico(ev('x', 'x', { notes: 'Escova' }))).toBe('Escova');
    expect(nomeDoServico(ev('x', 'x'))).toBe('Atendimento');
  });
});

describe('tarefas com prazo', () => {
  const t = (id: string, data_limite: string, x: Partial<TarefaComPrazo> = {}): TarefaComPrazo => ({
    id, titulo: id, data_limite, status: 'pendente', criticidade: 'normal', responsible_id: null, ...x,
  });
  it('separa do dia e atrasadas, sem concluídas nem futuras, críticas primeiro', () => {
    const r = tarefasDoDia([
      t('hoje-normal', '2026-10-13'),
      t('hoje-critica', '2026-10-13', { criticidade: 'critico' }),
      t('ontem', '2026-10-12', { status: 'em_andamento' }),
      t('feita', '2026-10-13', { status: 'concluida' }),
      t('amanha', '2026-10-14'),
    ], '2026-10-13');
    expect(r.doDia.map((x) => x.id)).toEqual(['hoje-critica', 'hoje-normal']);
    expect(r.atrasadas.map((x) => x.id)).toEqual(['ontem']);
  });
});

describe('próximos pagamentos', () => {
  const l = (id: string, data: string, valor: number): LancamentoPendente => ({ id, origem: 'financas', descricao: id, valor, data, escopo: 'negocio' });
  it('separa vencidos e próximos até o limite, somando o total', () => {
    const r = proximosPagamentos([l('luz', '2026-10-15', 200), l('aluguel', '2026-10-10', 1500), l('agua', '2026-10-13', 80), l('longe', '2026-11-30', 999)], '2026-10-13', '2026-10-20');
    expect(r.vencidos.map((x) => x.id)).toEqual(['aluguel']);
    expect(r.proximos.map((x) => x.id)).toEqual(['agua', 'luz']);
    expect(r.total).toBe(1780);
  });
  it('soma dias atravessando mês e ano', () => {
    expect(somarDias('2026-10-28', 7)).toBe('2026-11-04');
    expect(somarDias('2026-12-30', 2)).toBe('2027-01-01');
  });
});
