import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
const { acessoTela, descreverAcao, permissaoPadrao, MODULOS_COM_PERMISSAO } = await import('./permissoes');
const { modulosVisiveis } = await import('./modulos');

describe('permissões por profissional', () => {
  it('padrão igual ao do banco: telas que a profissional já usava, só os dados dela', () => {
    expect(permissaoPadrao('agenda')).toEqual({ nivel: 'editar', alcance: 'proprio', campos: [] });
    expect(permissaoPadrao('relatorio_comissoes').nivel).toBe('ver');
    expect(permissaoPadrao('financas').nivel).toBe('nenhum');
  });
  it('atalhos de tela', () => {
    const a = acessoTela({ agenda: { nivel: 'ver', alcance: 'todos', campos: [] } }, 'agenda');
    expect(a).toMatchObject({ ver: true, editar: false, todos: true, editarTodos: false });
    const c = acessoTela({ clientes: { nivel: 'ver', alcance: 'proprio', campos: ['telefone'] } }, 'clientes');
    expect(c.campo('telefone')).toBe(true);
    expect(c.campo('email')).toBe(false);
    expect(acessoTela({ clientes: { nivel: 'nenhum', alcance: 'proprio', campos: ['telefone'] } }, 'clientes').campo('telefone')).toBe(false);
  });
  it('menu da profissional segue a permissão nas telas configuráveis', () => {
    const ids = modulosVisiveis('professional', { ocultar: [] }, { agenda: { nivel: 'nenhum' }, clientes: { nivel: 'ver' } }, MODULOS_COM_PERMISSAO).map((m) => m.id);
    expect(ids).not.toContain('agenda');
    expect(ids).not.toContain('meu_painel');
    expect(ids).toContain('clientes');
    expect(ids).toContain('configuracoes');
    expect(ids).not.toContain('financas');
  });
  it('histórico sem dado pessoal', () => {
    const t = descreverAcao({ id: 1, acao: 'alterou', tela: 'agenda', data_referencia: '2026-10-20T13:00:00Z', campos: ['start_time', 'end_time', 'status'], created_at: '' }, () => '20/10/2026 10:00');
    expect(t).toBe('Alterou atendimento de 20/10/2026 10:00 (horário, horário de término, status)');
    expect(descreverAcao({ id: 2, acao: 'criou', tela: 'clientes', data_referencia: null, campos: [], created_at: '' }, () => '')).toBe('Criou registro de cliente');
  });
});
