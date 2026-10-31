import { describe, expect, it } from 'vitest';
import { agendamentosParaLembrar, diaSeguinte, linkLembrete, mensagemLembrete, situacaoLembrete, telefoneValido, type AgendamentoLembrete } from './lembrete';

const ag = (p: Partial<AgendamentoLembrete> = {}): AgendamentoLembrete => ({
  id: 'a1',
  start_time: '2026-11-05T17:00:00Z', // 14:00 em São Paulo
  status: 'scheduled',
  client_id: 'c1',
  professional_id: 'p1',
  clients: { name: 'Ana Paula Souza', phone: '(11) 98765-4321', contato_visivel: true },
  services: { name: 'Escova' },
  ...p,
});

describe('mensagemLembrete', () => {
  it('segue o modelo do salão com primeiro nome, data e hora de São Paulo', () => {
    expect(mensagemLembrete('Ana Paula Souza', 'Escova', '2026-11-05T17:00:00Z'))
      .toBe('Olá, Ana, passando pra lembrar do seu procedimento Escova no dia 05/11/2026 e no horário 14:00. Até logo.');
  });

  it('procedimento vazio vira "agendado"', () => {
    expect(mensagemLembrete('Bia', '  ', '2026-11-05T17:00:00Z')).toContain('seu procedimento agendado no dia');
  });
});

describe('telefoneValido', () => {
  it('aceita DDD com 10 ou 11 dígitos e com 55', () => {
    expect(telefoneValido('(11) 98765-4321')).toBe(true);
    expect(telefoneValido('1133334444')).toBe(true);
    expect(telefoneValido('+55 11 98765-4321')).toBe(true);
  });

  it('recusa vazio, incompleto e mascarado', () => {
    expect(telefoneValido(null)).toBe(false);
    expect(telefoneValido('98765-4321')).toBe(false);
    expect(telefoneValido('(**) *****-**21')).toBe(false);
  });
});

describe('situacaoLembrete', () => {
  it('pronto, enviado, sem telefone e contato restrito', () => {
    expect(situacaoLembrete(ag())).toBe('pronto');
    expect(situacaoLembrete(ag({ lembrete_enviado_em: '2026-11-04T15:00:00Z' }))).toBe('enviado');
    expect(situacaoLembrete(ag({ clients: { name: 'Ana', phone: '', contato_visivel: true } }))).toBe('sem_telefone');
    expect(situacaoLembrete(ag({ clients: { name: 'Ana', phone: '(**) *****-**21', contato_visivel: false } }))).toBe('contato_restrito');
    expect(situacaoLembrete(ag({ clients: null }))).toBe('contato_restrito');
  });
});

describe('linkLembrete', () => {
  it('abre o WhatsApp da cliente com a mensagem', () => {
    const url = linkLembrete(ag());
    expect(url.startsWith('https://wa.me/5511987654321?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toContain('Olá, Ana,');
  });
});

describe('agendamentosParaLembrar', () => {
  it('só atendimentos ativos de cliente cadastrada no dia, em ordem de horário', () => {
    const lista = [
      ag({ id: 'tarde', start_time: '2026-11-05T20:00:00Z' }),
      ag({ id: 'manha', start_time: '2026-11-05T12:00:00Z', status: 'confirmed' }),
      ag({ id: 'cancelado', status: 'cancelled' }),
      ag({ id: 'concluido', status: 'completed' }),
      ag({ id: 'bloqueio', is_block: true, client_id: null }),
      ag({ id: 'lembrete-retorno', is_manual_reminder: true }),
      ag({ id: 'sem-cliente', client_id: null }),
      ag({ id: 'outro-dia', start_time: '2026-11-06T17:00:00Z' }),
      ag({ id: 'noite-utc', start_time: '2026-11-06T02:00:00Z' }), // 23:00 do dia 05 em São Paulo
    ];
    expect(agendamentosParaLembrar(lista, '2026-11-05').map((a) => a.id)).toEqual(['manha', 'tarde', 'noite-utc']);
  });
});

describe('diaSeguinte', () => {
  it('vira mês e ano', () => {
    expect(diaSeguinte('2026-11-05')).toBe('2026-11-06');
    expect(diaSeguinte('2026-12-31')).toBe('2027-01-01');
  });
});
