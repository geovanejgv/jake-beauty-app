import { describe, expect, it } from 'vitest';
import { modulosVisiveis, moduloDaRota, moduloVisivel, normalizarPreferencias, rotaInicial } from './modulos';

describe('preferências de interface', () => {
  it('aceita só módulos conhecidos e ocultáveis', () => {
    expect(normalizarPreferencias({ ocultar: ['tarefas', 'xyz', 'configuracoes', 'tarefas', 3] })).toEqual({ ocultar: ['tarefas'] });
    expect(normalizarPreferencias(null)).toEqual({ ocultar: [] });
    expect(normalizarPreferencias({ ocultar: 'tarefas' })).toEqual({ ocultar: [] });
  });
  it('esconde o módulo do menu', () => {
    const prefs = normalizarPreferencias({ ocultar: ['tarefas'] });
    expect(modulosVisiveis('admin', prefs).some((m) => m.id === 'tarefas')).toBe(false);
    expect(moduloVisivel('agenda', 'admin', prefs)).toBe(true);
  });
  it('Configurações nunca some', () => {
    const tudo = normalizarPreferencias({ ocultar: ['resumo', 'meu_painel', 'agenda', 'tarefas', 'clientes', 'relatorio_comissoes'] });
    expect(modulosVisiveis('professional', tudo).map((m) => m.id)).toEqual(['configuracoes']);
    expect(rotaInicial('professional', tudo)).toBe('/configuracoes');
  });
});

describe('papéis', () => {
  it('profissional não vê módulos da administradora', () => {
    const ids = modulosVisiveis('professional', { ocultar: [] }).map((m) => m.id);
    for (const id of ['resumo', 'profissionais', 'servicos', 'financas', 'pagamentos', 'pdv'] as const) expect(ids).not.toContain(id);
    expect(ids).toContain('meu_painel');
    expect(ids).toContain('agenda');
  });
  it('rota inicial é a agenda quando visível', () => {
    expect(rotaInicial('admin', { ocultar: [] })).toBe('/agenda');
    expect(rotaInicial('admin', { ocultar: ['agenda'] })).toBe('/dashboard');
  });
  it('acha o módulo pela rota, inclusive subrotas', () => {
    expect(moduloDaRota('/relatorios/comissoes')?.id).toBe('relatorio_comissoes');
    expect(moduloDaRota('/relatorios/comissoes/imprimir')?.id).toBe('relatorio_comissoes');
    expect(moduloDaRota('/nada')).toBeUndefined();
  });
});
