import { describe, expect, it } from 'vitest';
import { fontes, ler, rel } from '../apoio/arquivos';

/**
 * Testes de aceitação do login pelo Google e do MFA (docs/especificacoes/login-google-mfa.md,
 * seção 6 da especificação adaptada à SPA). As regras de banco estão em
 * supabase/tests/seguranca/login_mfa.test.sql.
 */
const login = ler('src/pages/Login.tsx');
const callback = ler('src/pages/AuthCallback.tsx');
const app = ler('src/App.tsx');
const cliente = ler('src/lib/supabase.ts');
const edge = ler('supabase/functions/admin-usuarios/index.ts');
const sql = ler('supabase/migrations/20261018120000_login_google_mfa.sql');
const blocoEdge = (acao: string) => {
  const i = edge.indexOf(`if (acao === '${acao}')`);
  expect(i, acao).toBeGreaterThan(-1);
  const resto = edge.slice(i + 10);
  const fim = resto.search(/\n    if \(acao === /);
  return edge.slice(i, fim === -1 ? undefined : i + 10 + fim);
};

describe('L-01 e AUT-01: único jeito de entrar é o Google', () => {
  it('a tela de login só tem o botão do Google (sem e-mail e senha)', () => {
    expect(login).toMatch(/signInWithOAuth\(\{\s*provider: 'google'/);
    expect(login).toMatch(/Continuar com Google/);
    expect(login).not.toMatch(/type="password"|type="email"|signInWithPassword/);
  });
  it('nenhum código do portal usa senha, magic link ou cadastro aberto', () => {
    const proibido = /signInWithPassword|signUp\(|signInWithOtp|resetPasswordForEmail|updateUser\(\{\s*password|senha_temporaria|inviteUserByEmail/;
    const usos = fontes().filter((f) => proibido.test(ler(f))).map(rel);
    expect(usos).toEqual([]);
    expect(edge).not.toMatch(/password|inviteUserByEmail|senha_temporaria/);
  });
  it('PKCE: o retorno do Google traz só um código de uso único, nunca o token na URL', () => {
    expect(cliente).toMatch(/flowType: 'pkce'/);
    expect(login).toMatch(/redirectTo: `\$\{window\.location\.origin\}\/auth\/callback`/);
  });
});

describe('L-04: só entra quem foi cadastrado', () => {
  it('o retorno encerra a sessão nos casos negados, com mensagens sem-acesso e estabelecimento-inativo', () => {
    expect(app).toMatch(/path="\/auth\/callback" element=\{<AuthCallback \/>\}/);
    expect(callback).toMatch(/signOut\(\{ scope: 'local' \}\)/);
    expect(callback).toMatch(/sair\('sem-acesso', 'sem_perfil'\)/);
    expect(callback).toMatch(/sair\('estabelecimento-inativo', 'estabelecimento_inativo'\)/);
    expect(callback).toMatch(/registrarAuditoria\('login_negado'/);
  });
  it('perfil negado na área logada também encerra a sessão', () => {
    expect(app).toMatch(/if \(acesso === 'negado'\) return <SemAcesso \/>/);
    expect(app.slice(app.indexOf('function SemAcesso'))).toMatch(/signOut\(\{ scope: 'local' \}\)[\s\S]*erro=sem-acesso/);
  });
  it('todas as mensagens da tela de login existem', () => {
    const mensagens = login.slice(login.indexOf('MENSAGENS_LOGIN'), login.indexOf('};'));
    for (const c of ['sem-acesso', 'inatividade', 'falha', 'limite', 'estabelecimento-inativo']) expect(mensagens).toMatch(new RegExp(`^\\s+'?${c}'?:`, 'm'));
  });
});

describe('L-05: destino só interno', () => {
  it('o destino passa por caminhoInternoSeguro na ida e na volta', () => {
    expect(login).toMatch(/guardarDestino\(params\.get\('redirectTo'\)\)/);
    expect(callback).toMatch(/navigate\(retirarDestino\(\)/);
    expect(ler('src/lib/seguranca/redirecionamento.ts')).toMatch(/return caminhoInternoSeguro\(valor\)/);
  });
});

describe('M-06: autenticador ativo pede o código logo depois do login', () => {
  it('a área logada mostra a verificação enquanto o MFA está pendente', () => {
    expect(app).toMatch(/if \(acesso === 'mfa_pendente'\) return <Verificacao \/>/);
    expect(ler('src/contexts/AuthContext.tsx')).toMatch(/n\.proximo === 'aal2' && n\.atual !== 'aal2'/);
  });
  it('o banco não mostra nada antes do código (funções de sessão conferem mfa_pendente)', () => {
    for (const f of ['estabelecimento_atual', 'usuario_ativo', 'usuario_admin', 'usuario_atual_id']) {
      const corpo = sql.slice(sql.indexOf(`function public.${f}()`));
      expect(corpo.slice(0, corpo.indexOf('$$;', corpo.indexOf('as $$'))), f).toMatch(/not public\.mfa_pendente\(\)/);
    }
  });
});

describe('M-01, M-05 e M-08: ações administrativas com aal2', () => {
  it('a Edge Function confere aal2 antes das ações da equipe', () => {
    const equipe = edge.slice(edge.indexOf('// ------------------------------------------------------------ equipe'));
    expect(equipe.indexOf("rpc('sessao_aal2')")).toBeGreaterThan(-1);
    expect(equipe.indexOf("rpc('sessao_aal2')")).toBeLessThan(equipe.indexOf("if (acao === 'criar_acesso')"));
  });
  it('o banco exige aal2 para papel, status e acesso da equipe e para os logs', () => {
    expect(sql).toMatch(/create trigger users_b_exige_mfa\s+before insert or update on public\.users/);
    expect(sql).toMatch(/raise exception 'mfa_requerido'/);
    expect(sql).toMatch(/using \(public\.usuario_admin\(\) and public\.sessao_aal2\(\)\)/);
  });
  it('redefinir 2 etapas: recusa o próprio id, filtra pelo estabelecimento, remove os fatores e audita', () => {
    const b = blocoEdge('redefinir_mfa');
    expect(b).toMatch(/soCampos\(corpo, \['acao', 'user_id'\]\)/);
    expect(b).toMatch(/perfil\.auth_id === quem\.user\.id/);
    expect(b).toMatch(/await perfilDe\(/);
    expect(b).toMatch(/admin\.auth\.admin\.mfa\.deleteFactor/);
    expect(b).toMatch(/auditarEquipe\('mfa_removido'/);
  });
});

describe('M-04: ação crítica pede o código na hora', () => {
  it('excluir estabelecimento exige código confirmado há menos de 5 minutos', () => {
    expect(sql).toMatch(/and not public\.mfa_recente\(300\) then\s+raise exception 'mfa_codigo_requerido'/);
    expect(ler('src/pages/AdminGlobal.tsx')).toMatch(/await confirmarCodigo\(fator\.id, codigo\);[\s\S]*atualizarEstabelecimento/);
  });
});

describe('L-11: contas sem senha', () => {
  it('criar acesso aceita só acao, user_id e email e cria a conta sem senha', () => {
    const b = blocoEdge('criar_acesso');
    expect(b).toMatch(/soCampos\(corpo, \['acao', 'user_id', 'email'\]\)/);
    expect(b).toMatch(/admin\.auth\.admin\.createUser\(\{ email: mail, email_confirm: true \}\)/);
  });
  it('nova administradora (painel global) também sem senha', () => {
    expect(blocoEdge('criar_estabelecimento')).toMatch(/admin\.auth\.admin\.createUser\(\{ email: mail, email_confirm: true \}\)/);
  });
});

describe('L-08 e L-09: logout e inatividade', () => {
  it('logout revoga a sessão no servidor de autenticação', () => {
    expect(ler('src/contexts/AuthContext.tsx')).toMatch(/supabase\.auth\.signOut\(\{ scope: 'local' \}\)/);
  });
  it('administradora parada sai do portal com a mensagem de inatividade', () => {
    const layout = ler('src/layouts/MainLayout.tsx');
    expect(layout).toMatch(/useInatividadeAdmin\(perfil\?\.role === 'admin'/);
    expect(layout).toMatch(/erro=inatividade/);
  });
});

describe('A-01: auditoria do login e do MFA', () => {
  it('o banco aceita os eventos e a tela registra login, negado e falhas de código', () => {
    for (const ev of ['mfa_ativado', 'mfa_verificado', 'mfa_falhou', 'mfa_removido']) expect(sql).toContain(`'${ev}'`);
    const seg = ler('src/components/SegurancaMfa.tsx');
    for (const ev of ['mfa_ativado', 'mfa_verificado', 'mfa_falhou', 'mfa_removido']) expect(seg).toContain(`registrarAuditoria('${ev}'`);
    expect(callback).toMatch(/registrarAuditoria\('login'/);
  });
});
