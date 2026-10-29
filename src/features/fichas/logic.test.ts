import { describe, expect, it } from 'vitest';
import {
  alertas, chaveDetalhe, cpfValido, ehMenor, idade, limparRespostas, linkDaFicha, mensagemLink, problemasDoModelo,
  textoResposta, tokenDoFragmento, validarResponsavel, validarRespostas,
} from './logic';
import { EXEMPLO_RESPOSTAS, EXEMPLO_SALAO } from './exemplos';
import { ANAMNESE, FOTODEPILACAO, MODELOS, TERMO } from './modelos';
import type { EsquemaFicha, Respostas } from './tipos';

const HOJE = new Date(2026, 9, 27);

const ESQUEMA: EsquemaFicha = {
  versao: 'teste-1', tipo: 'anamnese', titulo: 'Teste', campoNascimento: 'nasc',
  secoes: [{
    id: 's', titulo: 'S', campos: [
      { id: 'procedimento', tipo: 'texto', rotulo: 'Procedimento', obrigatorio: true, origem: 'salao' },
      { id: 'aviso', tipo: 'informativo', rotulo: 'Leia' },
      { id: 'nome', tipo: 'texto', rotulo: 'Nome', obrigatorio: true },
      { id: 'nasc', tipo: 'data', rotulo: 'Nascimento', obrigatorio: true },
      { id: 'cpf', tipo: 'cpf', rotulo: 'CPF' },
      { id: 'tel', tipo: 'telefone', rotulo: 'Telefone', obrigatorio: true },
      { id: 'gestante', tipo: 'sim_nao', rotulo: 'Gestante?', obrigatorio: true, alertaSe: 'sim', detalhe: { rotulo: 'Semanas?', obrigatorio: true } },
      { id: 'alergia', tipo: 'sim_nao', rotulo: 'Alergia?', obrigatorio: true },
      { id: 'alergia_qual', tipo: 'texto', rotulo: 'A quê?', obrigatorio: true, mostrarSe: { campo: 'alergia', igual: 'sim' } },
      { id: 'pele', tipo: 'escolha_unica', rotulo: 'Pele', obrigatorio: true, opcoes: [{ valor: 'i', rotulo: 'I' }, { valor: 'vi', rotulo: 'VI', alerta: true }] },
      { id: 'areas', tipo: 'escolha_multipla', rotulo: 'Áreas', opcoes: [{ valor: 'axilas', rotulo: 'Axilas' }, { valor: 'buco', rotulo: 'Buço' }] },
      { id: 'ok', tipo: 'aceite', rotulo: 'Autorizo', obrigatorio: true },
    ],
  }],
};

const BASE: Respostas = { nome: 'Ana Lima', nasc: '1990-05-10', cpf: '52998224725', tel: '11999990000', gestante: 'nao', alergia: 'nao', pele: 'i', ok: true };

describe('validarRespostas (mesmas regras do banco)', () => {
  it('aceita resposta completa', () => {
    expect(validarRespostas(ESQUEMA, BASE, 'cliente', HOJE)).toBeNull();
  });
  it('obrigatório, aceite e detalhe', () => {
    const { nome: _n, ...semNome } = BASE;
    expect(validarRespostas(ESQUEMA, semNome, 'cliente', HOJE)?.mensagem).toBe('Preencha: Nome');
    expect(validarRespostas(ESQUEMA, { ...BASE, ok: false }, 'cliente', HOJE)?.mensagem).toBe('Confirme: Autorizo');
    expect(validarRespostas(ESQUEMA, { ...BASE, gestante: 'sim' }, 'cliente', HOJE)?.mensagem).toBe('Preencha: Semanas?');
    expect(validarRespostas(ESQUEMA, { ...BASE, gestante: 'sim', [chaveDetalhe('gestante')]: '12' }, 'cliente', HOJE)).toBeNull();
    expect(validarRespostas(ESQUEMA, { ...BASE, [chaveDetalhe('gestante')]: '12' }, 'cliente', HOJE)?.mensagem).toBe('Campo não esperado: Gestante?');
  });
  it('campo condicional', () => {
    expect(validarRespostas(ESQUEMA, { ...BASE, alergia: 'sim' }, 'cliente', HOJE)?.mensagem).toBe('Preencha: A quê?');
    expect(validarRespostas(ESQUEMA, { ...BASE, alergia: 'sim', alergia_qual: 'Látex' }, 'cliente', HOJE)).toBeNull();
    expect(validarRespostas(ESQUEMA, { ...BASE, alergia_qual: 'Látex' }, 'cliente', HOJE)?.mensagem).toBe('Campo não esperado: A quê?');
  });
  it('formatos e opções', () => {
    expect(validarRespostas(ESQUEMA, { ...BASE, cpf: '12345678900' }, 'cliente', HOJE)?.mensagem).toBe('CPF inválido.');
    expect(validarRespostas(ESQUEMA, { ...BASE, tel: '(11) 9999' }, 'cliente', HOJE)?.mensagem).toBe('Telefone inválido: Telefone');
    expect(validarRespostas(ESQUEMA, { ...BASE, nasc: '2026-02-30' }, 'cliente', HOJE)?.mensagem).toBe('Data inválida: Nascimento');
    expect(validarRespostas(ESQUEMA, { ...BASE, nasc: '2027-01-01' }, 'cliente', HOJE)?.mensagem).toBe('Data inválida: Nascimento');
    expect(validarRespostas(ESQUEMA, { ...BASE, pele: 'vii' }, 'cliente', HOJE)?.mensagem).toBe('Opção inválida: Pele');
    expect(validarRespostas(ESQUEMA, { ...BASE, areas: ['axilas', 'axilas'] }, 'cliente', HOJE)?.mensagem).toBe('Opção inválida: Áreas');
  });
  it('campo fora da ficha e campo do salão vindo da cliente', () => {
    expect(validarRespostas(ESQUEMA, { ...BASE, admin: true }, 'cliente', HOJE)?.mensagem).toBe('Campo não previsto na ficha.');
    expect(validarRespostas(ESQUEMA, { ...BASE, procedimento: 'Grátis' }, 'cliente', HOJE)?.mensagem).toBe('Campo não previsto na ficha.');
    expect(validarRespostas(ESQUEMA, {}, 'salao', HOJE)?.mensagem).toBe('Preencha: Procedimento');
    expect(validarRespostas(ESQUEMA, { procedimento: 'Limpeza' }, 'salao', HOJE)).toBeNull();
  });
});

describe('limparRespostas', () => {
  it('tira escondidos, vazios e detalhes sem "sim"; normaliza CPF e telefone', () => {
    const r = limparRespostas(ESQUEMA, {
      ...BASE, cpf: '529.982.247-25', tel: '(11) 99999-0000', nome: '  Ana Lima ', alergia_qual: 'Látex',
      [chaveDetalhe('gestante')]: '12', areas: [], procedimento: 'X',
    }, 'cliente');
    expect(r).toEqual({ ...BASE, nome: 'Ana Lima' });
    expect(validarRespostas(ESQUEMA, r, 'cliente', HOJE)).toBeNull();
  });
});

describe('menor de idade', () => {
  it('idade completa e responsável', () => {
    expect(idade('2008-12-18', HOJE)).toBe(17);
    expect(idade('2008-10-27', HOJE)).toBe(18);
    expect(ehMenor(ESQUEMA, { nasc: '2008-12-18' }, HOJE)).toBe(true);
    expect(ehMenor(ESQUEMA, { nasc: '2008-10-27' }, HOJE)).toBe(false);
    expect(validarResponsavel({ nome: 'Mãe Teste', cpf: '529.982.247-25', parentesco: 'Mãe' })).toBeNull();
    expect(validarResponsavel({ nome: 'Mãe Teste', cpf: '111.111.111-11', parentesco: 'Mãe' })).toBe('CPF do responsável inválido.');
  });
});

describe('leitura e alertas', () => {
  it('texto das respostas', () => {
    const campos = ESQUEMA.secoes[0].campos;
    const c = (id: string) => campos.find((x) => x.id === id)!;
    expect(textoResposta(c('cpf'), BASE)).toBe('529.982.247-25');
    expect(textoResposta(c('tel'), BASE)).toBe('(11) 99999-0000');
    expect(textoResposta(c('nasc'), BASE)).toBe('10/05/1990');
    expect(textoResposta(c('gestante'), { gestante: 'sim', [chaveDetalhe('gestante')]: '12 semanas' })).toBe('Sim (12 semanas)');
  });
  it('alertas para a profissional', () => {
    expect(alertas(ESQUEMA, BASE)).toEqual([]);
    expect(alertas(ESQUEMA, { ...BASE, gestante: 'sim', pele: 'vi' }).map((a) => a.id)).toEqual(['gestante', 'pele']);
  });
});

describe('modelos dos documentos', () => {
  it.each(Object.values(MODELOS))('$tipo sem problema de estrutura', (m) => {
    expect(problemasDoModelo(m)).toEqual([]);
  });
  it('fotodepilação pede fototipo, cor do pelo e isotretinoína; termo não isenta o salão', () => {
    const ids = FOTODEPILACAO.secoes.flatMap((s) => s.campos.map((c) => c.id));
    expect(ids).toEqual(expect.arrayContaining(['fototipo', 'cor_pelo', 'isotretinoina', 'fotossensibilizante', 'tatuagem_area', 'consentimento_dados_saude']));
    const textoTermo = JSON.stringify(TERMO).toLowerCase();
    expect(textoTermo).not.toContain('isenta');
    expect(textoTermo).not.toContain('sem responsabilidade');
    expect(ANAMNESE.secoes.flatMap((s) => s.campos).some((c) => c.id === 'alergia')).toBe(true);
  });
  it('termo: procedimento, valor e pagamento vêm do salão', () => {
    const salao = TERMO.secoes.flatMap((s) => s.campos).filter((c) => c.origem === 'salao').map((c) => c.id);
    expect(salao).toEqual(expect.arrayContaining(['procedimento', 'valor', 'forma_pagamento']));
  });
});

describe('link da cliente', () => {
  it('token no fragmento e mensagem', () => {
    const t = 'a'.repeat(64);
    expect(linkDaFicha('https://app.exemplo.com', t)).toBe(`https://app.exemplo.com/ficha#${t}`);
    expect(tokenDoFragmento(`#${t}`)).toBe(t);
    expect(tokenDoFragmento('#abc')).toBeNull();
    expect(mensagemLink('Ana Lima', 'Studio', 'Ficha de Anamnese', 'L')).toContain('Olá, Ana!');
  });
});

describe('exemplos fictícios', () => {
  it.each(Object.values(MODELOS))('$tipo: exemplo passa na validação', (m) => {
    expect(validarRespostas(m, EXEMPLO_RESPOSTAS[m.tipo], 'cliente', HOJE)).toBeNull();
    expect(validarRespostas(m, EXEMPLO_SALAO[m.tipo], 'salao', HOJE)).toBeNull();
  });
});

describe('validade da anamnese', () => {
  it('vigente, vence em breve e vencida', async () => {
    const { validadeDaFicha } = await import('./logic');
    const hoje = new Date('2026-10-29T12:00:00Z');
    expect(validadeDaFicha('2026-01-10T12:00:00Z', 12, hoje).situacao).toBe('vigente');
    expect(validadeDaFicha('2025-11-10T12:00:00Z', 12, hoje)).toMatchObject({ situacao: 'vence_em_breve', dias: 12 });
    expect(validadeDaFicha('2025-10-01T12:00:00Z', undefined, hoje).situacao).toBe('vencida');
    expect(validadeDaFicha('2026-01-10T12:00:00Z', 6, hoje).situacao).toBe('vencida');
  });
});
