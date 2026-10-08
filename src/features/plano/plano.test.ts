import { describe, expect, it } from 'vitest';
import { MENSAGENS_PLANO, demoExpirada, diasRestantesDemo, moduloLiberadoNoPlano, travaDoPlano, usoLimite } from './plano';

const agora = new Date('2026-10-08T12:00:00-03:00');
const demo = (fim: string | null) => ({ plano: 'demonstracao' as const, demo_expira_em: fim });

describe('plano: demonstração', () => {
  it('vence na data; básico e premium nunca vencem', () => {
    expect(demoExpirada(demo('2026-10-08T11:59:59-03:00'), agora)).toBe(true);
    expect(demoExpirada(demo('2026-10-08T12:00:00-03:00'), agora)).toBe(true);
    expect(demoExpirada(demo('2026-10-09T00:00:00-03:00'), agora)).toBe(false);
    expect(demoExpirada({ plano: 'basico', demo_expira_em: '2020-01-01T00:00:00Z' }, agora)).toBe(false);
    expect(demoExpirada({ plano: 'premium', demo_expira_em: null }, agora)).toBe(false);
  });
  it('dias restantes arredondam para cima e nunca ficam negativos', () => {
    expect(diasRestantesDemo(demo('2026-10-08T12:00:01-03:00'), agora)).toBe(1);
    expect(diasRestantesDemo(demo('2026-11-07T12:00:00-03:00'), agora)).toBe(30);
    expect(diasRestantesDemo(demo('2026-10-01T00:00:00-03:00'), agora)).toBe(0);
    expect(diasRestantesDemo({ plano: 'premium', demo_expira_em: null }, agora)).toBeNull();
  });
  it('com a demonstração vencida, só as telas liberadas abrem', () => {
    const vencida = demo('2026-10-01T00:00:00-03:00');
    expect(moduloLiberadoNoPlano('agenda', vencida, agora)).toBe(true);
    expect(moduloLiberadoNoPlano('clientes', vencida, agora)).toBe(true);
    expect(moduloLiberadoNoPlano('plano', vencida, agora)).toBe(true);
    expect(moduloLiberadoNoPlano('tarefas', vencida, agora)).toBe(false);
    expect(moduloLiberadoNoPlano('financas', vencida, agora)).toBe(false);
    expect(moduloLiberadoNoPlano('tarefas', demo('2026-12-01T00:00:00-03:00'), agora)).toBe(true);
    expect(moduloLiberadoNoPlano('tarefas', null, agora)).toBe(true);
  });
});

describe('plano: travas do banco', () => {
  it('mensagem do banco vira texto amigável', () => {
    expect(travaDoPlano('P0001: limite_plano_profissional')).toBe('limite_plano_profissional');
    expect(travaDoPlano('plano_demonstracao_encerrada')).toBe('plano_demonstracao_encerrada');
    expect(travaDoPlano('outra coisa')).toBeNull();
    expect(MENSAGENS_PLANO.plano_sem_compartilhamento).toMatch(/Básico/);
  });
  it('uso x limite com ∞ para ilimitado', () => {
    expect(usoLimite(2, 3)).toBe('2 / 3');
    expect(usoLimite(5, null)).toBe('5 / ∞');
  });
});
