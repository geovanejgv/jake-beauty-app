import { describe, expect, it } from 'vitest';
import {
  acaoAtrasada, dadosDoFormulario, indicadoresLeads, linkWhatsapp,
  mensagemBoasVindas, mensagemContato, opcoesDeInteresse, temTelefone, validarLead, type DadosLead,
} from './logic';

const base: DadosLead = {
  nome: 'Maria Souza', telefone: null, email: null, origem: null, interesse: null, resumo: null, etapa: 'novo',
  valor_estimado: null, proxima_acao: null, proxima_acao_em: null, motivo_perda: null, responsavel_id: null,
};

describe('validação do lead (mesmas regras do banco)', () => {
  it('aceita o mínimo (nome) e recusa nome curto', () => {
    expect(validarLead(base)).toBeNull();
    expect(validarLead({ ...base, nome: 'M' })).toMatch(/Nome/);
  });
  it('confere telefone, e-mail, etapa, origem e valor', () => {
    expect(validarLead({ ...base, telefone: 'abc' })).toMatch(/Telefone/);
    expect(validarLead({ ...base, email: 'nao-e-email' })).toMatch(/E-mail/);
    expect(validarLead({ ...base, etapa: 'ganho' as never })).toMatch(/etapa/);
    expect(validarLead({ ...base, origem: 'tiktok' as never })).toMatch(/chegou/);
    expect(validarLead({ ...base, valor_estimado: -1 })).toMatch(/Valor/);
    expect(validarLead({ ...base, telefone: '(11) 9 6000-0000', email: 'a@b.com', origem: 'instagram', valor_estimado: 1500 })).toBeNull();
  });
});

describe('formulário', () => {
  it('texto vazio vira null e o motivo só vale em perdido', () => {
    const campos = { nome: '  Ana   Lima ', telefone: '', email: ' ', origem: '', interesse: 'Unhas', resumo: '', etapa: 'contato',
      proxima_acao: '', proxima_acao_em: '', motivo_perda: 'Achou caro', responsavel_id: '', valor_estimado: '' };
    const d = dadosDoFormulario(campos, null);
    expect(d).toMatchObject({ nome: 'Ana Lima', telefone: null, email: null, origem: null, interesse: 'Unhas', motivo_perda: null, responsavel_id: null });
    expect(dadosDoFormulario({ ...campos, etapa: 'perdido' }, null).motivo_perda).toBe('Achou caro');
  });
});

describe('indicadores do funil', () => {
  const leads = [
    { etapa: 'novo' as const, valor_estimado: 100, proxima_acao_em: '2026-10-10' },
    { etapa: 'proposta' as const, valor_estimado: 250.5, proxima_acao_em: '2026-10-20' },
    { etapa: 'fechado' as const, valor_estimado: 900, proxima_acao_em: '2026-10-01' },
    { etapa: 'perdido' as const, valor_estimado: null, proxima_acao_em: '2026-10-01' },
    { etapa: 'fechado' as const, valor_estimado: null, proxima_acao_em: null },
  ];
  it('em andamento, valor, conversão e atrasados', () => {
    expect(indicadoresLeads(leads, '2026-10-18')).toEqual({ emAndamento: 2, valorEmNegociacao: 350.5, fechados: 2, perdidos: 1, conversao: 67, atrasados: 1 });
    expect(indicadoresLeads([], '2026-10-18').conversao).toBeNull();
  });
  it('ação atrasada só em etapa aberta', () => {
    expect(acaoAtrasada({ etapa: 'novo', proxima_acao_em: '2026-10-10' }, '2026-10-18')).toBe(true);
    expect(acaoAtrasada({ etapa: 'fechado', proxima_acao_em: '2026-10-10' }, '2026-10-18')).toBe(false);
  });
});

describe('WhatsApp', () => {
  it('telefone com DDD e link com 55', () => {
    expect(temTelefone('(11) 9 6000-0000')).toBe(true);
    expect(temTelefone('96000')).toBe(false);
    expect(linkWhatsapp('(11) 96000-0000', 'Oi')).toBe('https://wa.me/5511960000000?text=Oi');
    expect(linkWhatsapp('+55 11 96000-0000', 'Oi')).toBe('https://wa.me/5511960000000?text=Oi');
  });
  it('mensagens com primeiro nome, estabelecimento e assinatura no fim', () => {
    const m = mensagemBoasVindas('Maria da Silva', 'Studio Labeli', 'Jake');
    expect(m).toMatch(/^Olá, Maria!/);
    expect(m).toContain('ao Studio Labeli');
    expect(m.endsWith('Jake')).toBe(true);
    expect(mensagemContato('João')).toMatch(/^Olá, João!/);
  });
});

describe('sugestões de interesse', () => {
  it('junta catálogo e usados sem repetir acento ou caixa', () => {
    expect(opcoesDeInteresse(['Unhas', 'Sobrancelha'], ['unhas', ' Cílios ', null])).toEqual(['Cílios', 'Sobrancelha', 'Unhas']);
  });
});
