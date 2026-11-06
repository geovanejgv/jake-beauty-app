import { describe, expect, it } from 'vitest';
import type { Servico, Vinculo } from '../catalogo/api';
import { iniciosEmSequencia, montarExtra, ofertasDoProfissional, totalExtras } from './servicoExtra';

const servico = (id: string, x: Partial<Servico> = {}): Servico => ({
  id, categoria_id: 'c', nome: `Serviço ${id}`, descricao: null, preco_base: 50, duracao_base_minutos: 30,
  comissao_base_percentual: 40, custo_material: 0, retorno_dias: null, ativo: true, ...x,
});
const vinculo = (user_id: string, servico_id: string, x: Partial<Vinculo> = {}): Vinculo => ({
  user_id, servico_id, valor_personalizado: null, tempo_execucao_minutos: null, comissao_percentual: null, ativo: true, ...x,
});

const servicos = [servico('a'), servico('b', { ativo: false }), servico('c')];
const vinculos = [vinculo('p1', 'a', { valor_personalizado: 80, tempo_execucao_minutos: 45 }), vinculo('p1', 'b'), vinculo('p2', 'c')];
const ofertas = ofertasDoProfissional(servicos, vinculos, 'p1');
const form = { escolha: '', nomeAvulso: '', minutosAvulso: '30', valor: '' };

describe('ofertasDoProfissional', () => {
  it('só os serviços ativos que o profissional oferece, com preço e tempo dele', () => {
    expect(ofertas.map((o) => o.s.id)).toEqual(['a']);
    expect(ofertas[0].c).toMatchObject({ valor: 80, minutos: 45 });
    expect(ofertasDoProfissional(servicos, vinculos, null)).toEqual([]);
  });
});

describe('montarExtra', () => {
  it('pede o serviço', () => {
    expect(montarExtra(form, ofertas, true, 'k')).toBe('Escolha o serviço.');
  });
  it('serviço do catálogo usa o valor do catálogo quando o campo fica vazio', () => {
    expect(montarExtra({ ...form, escolha: 'a' }, ofertas, true, 'k')).toEqual({ chave: 'k', servicoId: 'a', nome: 'Serviço a', minutos: 45, valor: null, valorExibido: 80 });
  });
  it('administradora pode informar outro valor; profissional não', () => {
    expect(montarExtra({ ...form, escolha: 'a', valor: '99,90' }, ofertas, true, 'k')).toMatchObject({ valor: 99.9, valorExibido: 99.9 });
    expect(montarExtra({ ...form, escolha: 'a', valor: '99,90' }, ofertas, false, 'k')).toMatchObject({ valor: null, valorExibido: 80 });
    expect(montarExtra({ ...form, escolha: 'a', valor: 'abc' }, ofertas, true, 'k')).toBe('Valor inválido.');
  });
  it('recusa serviço que o profissional não oferece', () => {
    expect(montarExtra({ ...form, escolha: 'c' }, ofertas, true, 'k')).toBe('Este profissional não oferece o serviço escolhido.');
  });
  it('avulso exige nome e duração válidos', () => {
    expect(montarExtra({ ...form, escolha: 'avulso' }, ofertas, true, 'k')).toMatch(/Informe o procedimento/);
    expect(montarExtra({ ...form, escolha: 'avulso', nomeAvulso: 'Hidratação', minutosAvulso: '3' }, ofertas, true, 'k')).toMatch(/Duração/);
    expect(montarExtra({ ...form, escolha: 'avulso', nomeAvulso: ' Hidratação ', valor: '40' }, ofertas, false, 'k'))
      .toEqual({ chave: 'k', servicoId: null, nome: 'Hidratação', minutos: 30, valor: 40, valorExibido: 40 });
  });
});

describe('iniciosEmSequencia e totalExtras', () => {
  it('cada extra começa quando o anterior termina', () => {
    const fim = new Date('2026-11-06T13:00:00Z');
    expect(iniciosEmSequencia(fim, [{ minutos: 30 }, { minutos: 45 }, { minutos: 15 }]).map((d) => d.toISOString()))
      .toEqual(['2026-11-06T13:00:00.000Z', '2026-11-06T13:30:00.000Z', '2026-11-06T14:15:00.000Z']);
  });
  it('soma os valores sem erro de arredondamento', () => {
    expect(totalExtras([{ valorExibido: 0.1 }, { valorExibido: 0.2 }])).toBe(0.3);
    expect(totalExtras([])).toBe(0);
  });
});
