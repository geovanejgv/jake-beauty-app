import { describe, expect, it } from 'vitest';
import { agendamentosParaLembrar, diaSeguinte, linkLembrete, mensagemConfirmacao, mensagemLembrete, retornosDoDia, situacaoLembrete, situacaoRetorno, telefoneValido, type RetornoLembrete } from './lembrete';

const ag = (p: Partial<RetornoLembrete> = {}): RetornoLembrete => ({
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

describe('retornosDoDia', () => {
  it('retorno marcado no atendimento e lembrete manual do dia, por nome', () => {
    const lista = [
      ag({ id: 'retorno', status: 'completed', start_time: '2026-10-01T17:00:00Z', return_reminder_date: '2026-11-05', clients: { name: 'Zélia', phone: '11987654321', contato_visivel: true } }),
      ag({ id: 'manual', is_manual_reminder: true, start_time: '2026-11-05T12:00:00Z', clients: { name: 'Bia', phone: '11987654321', contato_visivel: true } }),
      ag({ id: 'retorno-outro-dia', return_reminder_date: '2026-11-06' }),
      ag({ id: 'manual-outro-dia', is_manual_reminder: true, start_time: '2026-11-06T12:00:00Z' }),
      ag({ id: 'atendimento-do-dia' }),
      ag({ id: 'sem-cliente', is_manual_reminder: true, start_time: '2026-11-05T12:00:00Z', client_id: null }),
    ];
    expect(retornosDoDia(lista, '2026-11-05').map((a) => a.id)).toEqual(['manual', 'retorno']);
  });

  it('situação usa a data em que a cliente foi chamada', () => {
    expect(situacaoRetorno(ag())).toBe('pronto');
    expect(situacaoRetorno(ag({ return_reminder_sent_at: '2026-11-05T13:00:00Z' }))).toBe('enviado');
    expect(situacaoRetorno(ag({ clients: { name: 'Ana', phone: null, contato_visivel: true } }))).toBe('sem_telefone');
  });
});

describe('mensagemConfirmacao', () => {
  it('leva data, dia da semana, horário, serviço, profissional e valor', () => {
    const m = mensagemConfirmacao('Ana Paula', [{ inicio: '2026-11-16T12:00:00Z', servico: 'Depilação a laser - rosto', profissional: 'Jakeline', valor: 99.9 }], 'Studio Labeli');
    expect(m).toContain('Olá, Ana!');
    expect(m).toContain('do *Studio Labeli*');
    expect(m).toContain('*Data:* 16/11/2026 (segunda-feira)');
    expect(m).toMatch(/\*09:00\* Depilação a laser - rosto com Jakeline \(R\$\s99,90\)/);
    expect(m).not.toContain('Total');
  });
  it('vários serviços em ordem, pacote sem valor e total só do que é cobrado', () => {
    const m = mensagemConfirmacao('Bia', [
      { inicio: '2026-11-16T14:00:00Z', servico: 'Sobrancelha', valor: 40 },
      { inicio: '2026-11-16T13:00:00Z', servico: 'Limpeza de pele', valor: 150, pacote: true },
      { inicio: '2026-11-16T15:00:00Z', servico: 'Buço', valor: 20 },
    ]);
    const linhas = m.split('\n');
    expect(linhas.findIndex((l) => l.includes('Limpeza'))).toBeLessThan(linhas.findIndex((l) => l.includes('Sobrancelha')));
    expect(m).toContain('Limpeza de pele (sessão do pacote)');
    expect(m).toMatch(/\*Total:\* R\$\s60,00/);
    expect(m).toContain('do salão');
  });
  it('sem valor quando não deve mostrar', () => {
    expect(mensagemConfirmacao('Ana', [{ inicio: '2026-11-16T12:00:00Z', servico: 'Escova', valor: 50 }], null, false)).not.toContain('R$');
  });
});
