import { afterEach, describe, expect, it, vi } from 'vitest';
import { validarEnv } from '../../src/lib/env';
import { mascarar, logger } from '../../src/lib/seguranca/logger';
import { ErroPublico, mensagemDeErro } from '../../src/lib/seguranca/erros';

afterEach(() => vi.restoreAllMocks());

describe('SEG-01: configuração validada', () => {
  it('sem variável obrigatória, falha listando só os nomes', () => {
    expect(() => validarEnv({})).toThrowError(/VITE_SUPABASE_URL: obrigatória[\s\S]*VITE_SUPABASE_PUBLISHABLE_KEY: obrigatória/);
  });
  it('URL sem https é recusada', () => {
    expect(() => validarEnv({ VITE_SUPABASE_URL: 'http://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnop' })).toThrowError(/https/);
  });
  it('AUZ-05: recusa a service role no lugar da chave pública, sem ecoar o valor', () => {
    const payload = btoa(JSON.stringify({ role: 'service_role' })).replace(/=+$/, '');
    const chave = `eyJhbGciOiJIUzI1NiJ9.${payload}.assinatura-ficticia`;
    let mensagem = '';
    try {
      validarEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: chave });
    } catch (e) {
      mensagem = (e as Error).message;
    }
    expect(mensagem).toMatch(/nunca a service role/);
    expect(mensagem).not.toContain(chave);
    expect(() => validarEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnopqrst' })).toThrow();
  });
  it('configuração válida passa', () => {
    expect(validarEnv({ VITE_SUPABASE_URL: ' https://x.supabase.co ', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnop' })).toEqual({
      VITE_SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnop',
    });
  });
});

describe('LOG-04: logger mascara dado sensível', () => {
  it('mascara chaves sensíveis em qualquer profundidade', () => {
    const saida = mascarar({
      password: 'x', senha: 'y', token: 'z', cookie: 'c', Authorization: 'a',
      cliente: { name: 'Ana', phone: '11999999999', email: 'a@b.com', nivel: { cpf: '123' } },
      itens: [{ access_token: 't' }],
    }) as Record<string, any>;
    expect(saida.password).toBe('[mascarado]');
    expect(saida.senha).toBe('[mascarado]');
    expect(saida.token).toBe('[mascarado]');
    expect(saida.cookie).toBe('[mascarado]');
    expect(saida.Authorization).toBe('[mascarado]');
    expect(saida.cliente.phone).toBe('[mascarado]');
    expect(saida.cliente.email).toBe('[mascarado]');
    expect(saida.cliente.nivel.cpf).toBe('[mascarado]');
    expect(saida.itens[0].access_token).toBe('[mascarado]');
  });
  it('mascara JWT, Bearer, chaves do Supabase e e-mail soltos no texto', () => {
    const t = mascarar('falhou eyJabc.def.ghi Bearer abc.def sb_publishable_xyz para ana@ex.com') as string;
    expect(t).toBe('falhou [jwt] Bearer [mascarado] [chave] para [email]');
  });
  it('a linha escrita no console já sai mascarada', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('erro', { senha: '123456', motivo: 'x' });
    const linha = String(espiao.mock.calls[0][0]);
    expect(linha).not.toContain('123456');
    expect(linha).toContain('[mascarado]');
  });
});

describe('LOG-01: erro na tela é genérico, com código de correlação', () => {
  it('erro do banco não vaza mensagem, tabela nem SQL', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {});
    const erro = { code: '23505', message: 'duplicate key value violates unique constraint "clients_pkey"', details: 'Key (id)=(1) already exists.' };
    const msg = mensagemDeErro(erro, 'Não foi possível salvar.');
    expect(msg).toMatch(/^Não foi possível salvar\. \(código [0-9A-F]{8}\)$/);
    expect(msg).not.toMatch(/clients|duplicate|Key/);
    // o detalhe vai para o log, com o mesmo código
    const codigo = msg.match(/código ([0-9A-F]{8})/)![1];
    expect(String(espiao.mock.calls[0][0])).toContain(codigo);
  });
  it('mensagens redigidas pelo app (P0001 e ErroPublico) passam', () => {
    expect(mensagemDeErro({ code: 'P0001', message: 'Este é o único quadro.' })).toBe('Este é o único quadro.');
    expect(mensagemDeErro(new ErroPublico('Tarefa inválida.'))).toBe('Tarefa inválida.');
  });
  it('erro comum (sem código) também vira genérico', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(mensagemDeErro(new Error('relation "public.x" does not exist'))).not.toContain('relation');
  });
  it('sessão, permissão e rede têm mensagens próprias', () => {
    expect(mensagemDeErro({ code: 'PGRST301', message: 'JWT expired' })).toBe('Sessão expirada. Entre novamente.');
    expect(mensagemDeErro({ code: '42501', message: 'new row violates row-level security policy for table "users"' })).toBe('Você não tem permissão para esta ação.');
    expect(mensagemDeErro(new TypeError('Failed to fetch'))).toBe('Sem conexão. Verifique a internet e tente de novo.');
  });
});
