import { describe, expect, it } from 'vitest';
import { corpoNovoEstabelecimento, dataLocal, fimDemoParaBanco, lerLimite, mensagemPainel, validarEdicao, validarNovoEstabelecimento, type NovoEstabelecimento } from './logic';

const novo: NovoEstabelecimento = { nome: 'Salão B', plano: 'demonstracao', admin_nome: 'Ana', admin_email: 'Ana@Ex.com ', max_profissionais: 2, max_clientes: null };

describe('administração global: novo estabelecimento', () => {
  it('valida nome, plano, limites e e-mail', () => {
    expect(validarNovoEstabelecimento(novo)).toBeNull();
    expect(validarNovoEstabelecimento({ ...novo, nome: ' x ' })).toMatch(/nome do estabelecimento/);
    expect(validarNovoEstabelecimento({ ...novo, admin_email: 'sem-arroba' })).toMatch(/e-mail/);
    expect(validarNovoEstabelecimento({ ...novo, max_profissionais: -1 })).toMatch(/profissionais/);
    expect(validarNovoEstabelecimento({ ...novo, max_clientes: 1.5 })).toMatch(/clientes/);
  });
  it('corpo sem campos extras (nada de senha) e e-mail normalizado', () => {
    const corpo = corpoNovoEstabelecimento(novo);
    expect(Object.keys(corpo).sort()).toEqual(['acao', 'admin_email', 'admin_nome', 'max_clientes', 'max_profissionais', 'nome', 'plano']);
    expect(corpo.admin_email).toBe('ana@ex.com');
    expect(JSON.stringify(corpo)).not.toMatch(/senha|password|estabelecimento_id/);
  });
});

describe('administração global: edição', () => {
  const base = { nome: 'Salão B', plano: 'basico' as const, status: 'ativo' as const, demo_expira_em: null, max_profissionais: 3, max_clientes: 300 };
  it('demonstração exige a data de fim', () => {
    expect(validarEdicao(base)).toBeNull();
    expect(validarEdicao({ ...base, plano: 'demonstracao' })).toMatch(/demonstração/);
    expect(validarEdicao({ ...base, plano: 'demonstracao', demo_expira_em: '2026-11-07' })).toBeNull();
  });
  it('fim da demonstração no fim do dia em Brasília', () => {
    expect(fimDemoParaBanco('2026-11-07')).toBe('2026-11-07T23:59:59-03:00');
    expect(fimDemoParaBanco(null)).toBeNull();
    expect(dataLocal('2026-11-08T02:59:59Z')).toBe('2026-11-07');
  });
  it('campo de limite vazio = ilimitado', () => {
    expect(lerLimite('')).toBeNull();
    expect(lerLimite(' 5 ')).toBe(5);
    expect(Number.isNaN(lerLimite('abc') as number)).toBe(true);
  });
  it('travas do painel com texto próprio', () => {
    expect(mensagemPainel('nao_desativa_o_proprio')).toMatch(/próprio/);
    expect(mensagemPainel('so_admin_global')).toMatch(/MFA/);
    expect(mensagemPainel('x')).toBeNull();
  });
});
