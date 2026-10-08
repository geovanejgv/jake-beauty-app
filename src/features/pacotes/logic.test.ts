import { describe, expect, it } from 'vitest';
import {
  agruparSaldos, diasEntre, itemParaAbater, linkWhatsApp, mensagemBaixa, mensagemExtrato, ratearPacote,
  situacaoPacote, somarMeses, taxaMedia, type LinhaSaldo,
} from './logic';

const linha = (x: Partial<LinhaSaldo>): LinhaSaldo => ({
  pacote_id: 'p1', cliente_id: 'c1', pacote_nome: 'Corpo verão', status: 'ativo', validade: '2027-10-08', vencido: false,
  vendido_em: '2026-10-08T12:00:00Z', item_id: 'i1', servico_id: 's1', servico_nome: 'Laser', sessoes: 8, usadas: 0,
  faltas: 0, reservadas: 0, disponiveis: 8, valor_sessao: 90, valor_restante: 720, comissao_percentual: 40, ...x,
});

describe('datas', () => {
  it('validade padrão de 12 meses, inclusive no fim do mês', () => {
    expect(somarMeses('2026-10-08', 12)).toBe('2027-10-08');
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(diasEntre('2026-10-08', '2026-11-07')).toBe(30);
  });
});

describe('rateio (espelho do banco)', () => {
  it('divide pelo preço de tabela x sessões', () => {
    expect(ratearPacote(900, [{ precoBase: 100, sessoes: 8 }, { precoBase: 50, sessoes: 4 }])).toEqual([
      { valorItem: 720, valorSessao: 90, valorUltima: 90 },
      { valorItem: 180, valorSessao: 45, valorUltima: 45 },
    ]);
  });
  it('a última sessão fecha o centavo', () => {
    expect(ratearPacote(100, [{ precoBase: 100, sessoes: 3 }])).toEqual([{ valorItem: 100, valorSessao: 33.33, valorUltima: 33.34 }]);
  });
  it('sem preço de tabela, divide pelas sessões', () => {
    const r = ratearPacote(100, [{ precoBase: 0, sessoes: 1 }, { precoBase: 0, sessoes: 3 }]);
    expect(r.map((x) => x.valorItem)).toEqual([25, 75]);
  });
});

describe('taxa média', () => {
  it('pondera pelo valor de cada forma', () => {
    expect(taxaMedia([{ forma: 'credito', parcelas: 3, valor: 500 }, { forma: 'pix', parcelas: 1, valor: 400 }], { credito: 3.49, pix: 0 })).toBe(1.94);
    expect(taxaMedia([], {})).toBe(0);
  });
});

describe('situação e saldo', () => {
  it('classifica o pacote', () => {
    expect(situacaoPacote({ status: 'anulado', validade: '2027-01-01', restantes: 3 }, '2026-10-08')).toBe('anulado');
    expect(situacaoPacote({ status: 'ativo', validade: '2026-10-07', restantes: 3 }, '2026-10-08')).toBe('vencido');
    expect(situacaoPacote({ status: 'ativo', validade: '2027-01-01', restantes: 0 }, '2026-10-08')).toBe('esgotado');
    expect(situacaoPacote({ status: 'ativo', validade: '2026-11-01', restantes: 2 }, '2026-10-08')).toBe('a_vencer');
    expect(situacaoPacote({ status: 'ativo', validade: '2027-10-08', restantes: 2 }, '2026-10-08')).toBe('ativo');
  });
  it('agrupa os serviços do pacote', () => {
    const [p] = agruparSaldos([
      linha({ usadas: 2, faltas: 1, reservadas: 1, disponiveis: 4, valor_restante: 450 }),
      linha({ item_id: 'i2', servico_id: 's2', servico_nome: 'Drenagem', sessoes: 4, disponiveis: 4, valor_restante: 180 }),
    ]);
    expect(p).toMatchObject({ sessoes: 12, consumidas: 3, reservadas: 1, restantes: 9, valorRestante: 630 });
  });
  it('abate do pacote que vence primeiro, com saldo', () => {
    const linhas = [
      linha({ item_id: 'tarde', validade: '2027-12-01' }),
      linha({ item_id: 'cedo', validade: '2027-01-01' }),
      linha({ item_id: 'sem', validade: '2026-12-01', disponiveis: 0 }),
      linha({ item_id: 'vencido', validade: '2026-01-01', vencido: true }),
    ];
    expect(itemParaAbater(linhas, 's1')?.item_id).toBe('cedo');
    expect(itemParaAbater(linhas, 's2')).toBeNull();
    expect(itemParaAbater(linhas, null)).toBeNull();
  });
});

describe('mensagens', () => {
  it('baixa e falta', () => {
    expect(mensagemBaixa({ cliente: 'Carla Souza', servico: 'Laser', pacote: 'Corpo verão', restantes: 7, validade: '2027-10-08' }))
      .toBe('Olá, Carla! Hoje você utilizou 1 sessão de Laser do seu pacote "Corpo verão". Restam 7 sessões deste serviço, válidas até 08/10/2027. Qualquer dúvida, é só responder esta mensagem.');
    expect(mensagemBaixa({ cliente: 'Carla', servico: 'Laser', pacote: 'P', restantes: 1, validade: '2027-10-08', falta: true }))
      .toContain('registramos a falta na sessão de Laser, que foi descontada');
  });
  it('extrato', () => {
    const [p] = agruparSaldos([linha({ usadas: 1 })]);
    expect(mensagemExtrato('Carla', p)).toContain('Laser: 1 de 8 usadas, 7 restantes');
  });
  it('link do WhatsApp só com telefone válido', () => {
    expect(linkWhatsApp('(11) 98765-4321', 'oi')).toBe('https://wa.me/5511987654321?text=oi');
    expect(linkWhatsApp('123', 'oi')).toBeNull();
    expect(linkWhatsApp(null, 'oi')).toBeNull();
  });
});
