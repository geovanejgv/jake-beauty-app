import { describe, expect, it } from 'vitest';
import { condicoesEfetivas, divisao, duracaoTexto, estadoCategoria } from './logic';
import type { Servico, Vinculo } from './api';

const corte: Servico = {
  id: 's1', categoria_id: 'c1', nome: 'Corte', descricao: null, preco_base: 100, duracao_base_minutos: 60,
  comissao_base_percentual: 30, custo_material: 10, retorno_dias: null, ativo: true,
};
const vinc = (x: Partial<Vinculo>): Vinculo => ({ user_id: 'u', servico_id: 's1', valor_personalizado: null, tempo_execucao_minutos: null, comissao_percentual: null, ativo: true, ...x });

describe('condições efetivas (mesma ordem do banco)', () => {
  it('vínculo do profissional prevalece', () => {
    expect(condicoesEfetivas(corte, vinc({ valor_personalizado: 120, comissao_percentual: 60, tempo_execucao_minutos: 50 }), 40))
      .toEqual({ oferece: true, valor: 120, minutos: 50, comissao: 60, origemComissao: 'servico_profissional' });
  });
  it('sem comissão no vínculo usa a taxa fixa do perfil; sem perfil, a do serviço', () => {
    expect(condicoesEfetivas(corte, vinc({}), 40).comissao).toBe(40);
    expect(condicoesEfetivas(corte, vinc({}), null).comissao).toBe(30);
    expect(condicoesEfetivas({ ...corte, comissao_base_percentual: null }, vinc({}), null)).toMatchObject({ comissao: 0, origemComissao: 'nenhuma' });
  });
  it('sem vínculo ativo não oferece', () => {
    expect(condicoesEfetivas(corte, undefined, 40).oferece).toBe(false);
    expect(condicoesEfetivas(corte, vinc({ ativo: false }), 40).oferece).toBe(false);
    expect(condicoesEfetivas({ ...corte, ativo: false }, vinc({}), 40).oferece).toBe(false);
  });
});

describe('textos', () => {
  it('divisão e duração', () => {
    expect(divisao(60)).toBe('60% profissional / 40% salão');
    expect(divisao(33.33)).toBe('33,33% profissional / 66,67% salão');
    expect(duracaoTexto(45)).toBe('45 min');
    expect(duracaoTexto(90)).toBe('1h30');
    expect(duracaoTexto(120)).toBe('2h');
  });
  it('estado do "ticar categoria inteira"', () => {
    const lista = [corte, { ...corte, id: 's2' }, { ...corte, id: 's3', ativo: false }];
    expect(estadoCategoria(lista, new Set())).toBe('nenhum');
    expect(estadoCategoria(lista, new Set(['s1']))).toBe('parcial');
    expect(estadoCategoria(lista, new Set(['s1', 's2']))).toBe('todos');
  });
});
