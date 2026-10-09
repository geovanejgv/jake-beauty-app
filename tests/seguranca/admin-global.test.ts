import { describe, expect, it } from 'vitest';
import { ler } from '../apoio/arquivos';

/** Provas estáticas da administração global (docs/especificacoes/administracao-global.md, seção 8). */
const sql = ler('supabase/migrations/20261017120000_estabelecimentos_admin_global.sql');
const funcao = (nome: string) => {
  const i = sql.indexOf(`function public.${nome}(`);
  expect(i, nome).toBeGreaterThan(-1);
  const corpo = sql.slice(i);
  return corpo.slice(0, corpo.indexOf('$$;', corpo.indexOf('as $$')) + 3);
};
const edge = ler('supabase/functions/admin-usuarios/index.ts');

describe('SG-01: tabela de administradores globais sem política', () => {
  it('RLS ligado e nenhuma create policy', () => {
    expect(sql).toMatch(/alter table public\.administradores_globais enable row level security/);
    expect(sql).not.toMatch(/create policy[^;]*on public\.administradores_globais/i);
  });
});

describe('SG-02 e SG-04: painel confere admin global com MFA no banco', () => {
  it('eh_admin_global exige aal2 e as duas funções do painel conferem', () => {
    expect(funcao('eh_admin_global')).toMatch(/'aal'.*'aal2'/s);
    expect(funcao('admin_global_estabelecimentos')).toMatch(/if not public\.eh_admin_global\(\)/);
    expect(funcao('admin_global_atualizar_estabelecimento')).toMatch(/if not public\.eh_admin_global\(\)/);
    expect(funcao('admin_global_atualizar_estabelecimento')).toMatch(/nao_desativa_o_proprio/);
  });
  it('a versão "cadastrado" não é usada para dados', () => {
    for (const f of ['admin_global_estabelecimentos', 'admin_global_atualizar_estabelecimento']) {
      expect(funcao(f)).not.toMatch(/eh_admin_global_cadastrado/);
    }
  });
});

describe('SG-03: painel só com cadastro e contagens', () => {
  it('admin_global_estabelecimentos só toca estabelecimentos, users e clients', () => {
    const tabelas = new Set([...funcao('admin_global_estabelecimentos').matchAll(/public\.(\w+)/g)].map((m) => m[1]));
    for (const t of tabelas) expect(['admin_global_estabelecimentos', 'eh_admin_global', 'estabelecimentos', 'users', 'clients']).toContain(t);
  });
});

describe('SG-05: sessão só em estabelecimento ativo', () => {
  it('funções de sessão fazem join com estabelecimento ativo', () => {
    for (const f of ['estabelecimento_atual', 'usuario_ativo', 'usuario_admin', 'usuario_atual_id']) {
      expect(funcao(f), f).toMatch(/join public\.estabelecimentos e on e\.id = u\.estabelecimento_id and e\.status = 'ativo'/);
    }
  });
  it('toda tabela ganha política restritiva e gatilho de guarda', () => {
    expect(sql).toMatch(/as restrictive for all to authenticated/);
    expect(sql).toMatch(/create trigger a0_estabelecimento_guarda before insert or update or delete/);
  });
});

describe('SG-06, SG-07 e SG-14: limites, trava da demonstração e funções internas', () => {
  it('gatilhos de limite e mensagens limite_plano_*', () => {
    expect(sql).toMatch(/raise exception 'limite_plano_profissional'/);
    expect(sql).toMatch(/raise exception 'limite_plano_cliente'/);
    expect(sql).toMatch(/raise exception 'plano_sem_compartilhamento'/);
  });
  it('funções internas sem execução pela API', () => {
    expect(sql).toMatch(/revoke execute on function public\.plano_liberado\(\) from public, anon, authenticated/);
    expect(sql).toMatch(/revoke execute on function public\.plano_trava_demonstracao\(\) from public, anon, authenticated/);
    expect(sql).toMatch(/revoke execute on function public\.estabelecimento_guarda\(\) from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\.estabelecimento_criar\([^)]*\) from public, anon, authenticated/);
  });
  it('trava da demonstração só nos módulos pagos, nunca nas tabelas das telas liberadas', () => {
    const depois = sql.slice(sql.indexOf('function public.plano_trava_demonstracao()'));
    const lista = depois.slice(depois.indexOf('foreach t in array array['));
    const bloco = lista.slice(0, lista.indexOf('] loop'));
    for (const paga of ['kanban_quadros', 'internal_tasks', 'expenses', 'fechamentos', 'pacotes']) expect(bloco).toContain(`'${paga}'`);
    for (const liberada of ['appointments', 'clients', 'users', 'servicos', 'configuracoes_comissao', 'taxas_pagamento', 'commissions', 'transactions']) {
      expect(bloco).not.toContain(`'${liberada}'`);
    }
  });
});

describe('SG-09 e SG-10: criação pela Edge Function', () => {
  const bloco = edge.slice(edge.indexOf("if (acao === 'criar_estabelecimento')"), edge.indexOf('// ------------------------------------------------------------ equipe'));
  it('confere admin global (com MFA) antes de usar a chave de serviço', () => {
    expect(bloco.indexOf('await exigirAdminGlobal()')).toBeGreaterThan(-1);
    expect(bloco.indexOf('await exigirAdminGlobal()')).toBeLessThan(bloco.indexOf('admin.auth.admin.inviteUserByEmail'));
  });
  it('campos fechados, sem senha', () => {
    expect(bloco).toMatch(/soCampos\(corpo, \['acao', 'nome', 'plano', 'admin_nome', 'admin_email', 'max_profissionais', 'max_clientes'\]\)/);
    expect(bloco).not.toMatch(/password|senha_temporaria/);
  });
  it('reenviar convite: admin global com MFA antes da chave de serviço, campos fechados, sem senha', () => {
    const reenvio = edge.slice(edge.indexOf("if (acao === 'reenviar_convite')"), edge.indexOf("if (acao === 'criar_estabelecimento')"));
    expect(reenvio.indexOf('await exigirAdminGlobal()')).toBeGreaterThan(-1);
    expect(reenvio.indexOf('await exigirAdminGlobal()')).toBeLessThan(reenvio.indexOf('admin.from('));
    expect(reenvio).toMatch(/soCampos\(corpo, \['acao', 'estabelecimento_id'\]\)/);
    expect(reenvio).toMatch(/email_confirmed_at \|\| conta\.user\.last_sign_in_at/);
    expect(reenvio).not.toMatch(/password|senha_temporaria/);
    expect(edge).toMatch(/const \{ data: global \} = await comoUsuario\.rpc\('eh_admin_global'\)/);
  });
  it('ações de equipe conferem o estabelecimento antes da chave de serviço', () => {
    expect(edge).toMatch(/\.eq\('id', userId\)\.eq\('estabelecimento_id', meuEstabelecimento\)/);
  });
});
