import { describe, expect, it } from 'vitest';
import { fontes, ler, listar, rel } from '../apoio/arquivos';

/** Regras de isolamento da integração com IA (docs/especificacoes/integracao-ia.md). */
const edge = listar('supabase/functions/ia', (f) => f.endsWith('.ts')).map(rel);
const provedores = edge.filter((f) => f.startsWith('supabase/functions/ia/nucleo/provedores/'));
const todos = [...fontes().map(rel), ...edge];

describe('Isolamento dos provedores', () => {
  it('só os adaptadores conhecem o endereço da API de cada provedor', () => {
    const fora = todos.filter((f) => !provedores.includes(f) && /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com/.test(ler(f)));
    expect(fora).toEqual([]);
  });
  it('nenhum SDK de IA importado (DEP-01: sem dependência nova)', () => {
    const sdk = todos.filter((f) => /from ['"](@anthropic-ai\/|openai|@google\/genai|npm:)/.test(ler(f)));
    expect(sdk).toEqual([]);
  });
  it('no núcleo, só os adaptadores chamam fetch', () => {
    const nucleo = edge.filter((f) => f.includes('/nucleo/') && !provedores.includes(f));
    expect(nucleo.filter((f) => /\bfetch\(/.test(ler(f)))).toEqual([]);
  });
  it('a tela só importa da Edge Function o catálogo e os tipos (sem segredo)', () => {
    const imports = fontes().flatMap((f) => [...ler(f).matchAll(/from ['"]([^'"]*supabase\/functions[^'"]*)['"]/g)].map((m) => `${rel(f)} -> ${m[1]}`));
    expect(imports.length).toBeGreaterThan(0);
    for (const i of imports) expect(i).toMatch(/supabase\/functions\/ia\/nucleo\/(catalogo|tipos)\.ts$/);
    expect(ler('supabase/functions/ia/nucleo/catalogo.ts')).not.toMatch(/Deno|fetch\(|IA_ENCRYPTION_KEY/);
  });
  it('o segredo de cifra só é lido no ponto de entrada da função', () => {
    expect(edge.filter((f) => /IA_ENCRYPTION_KEY['"]\)/.test(ler(f)))).toEqual(['supabase/functions/ia/index.ts']);
    expect(edge.filter((f) => /Deno\.env/.test(ler(f)))).toEqual(['supabase/functions/ia/index.ts']);
  });
  it('a tela chama a função "ia" só por supabase.functions.invoke', () => {
    expect(ler('src/features/ia/api.ts')).toMatch(/functions\.invoke\('ia'/);
  });
});

describe('Edge Function "ia": guardas', () => {
  const index = ler('supabase/functions/ia/index.ts');
  it('confere sessão e perfil ativo antes de qualquer ação (AUZ-01, AUZ-06)', () => {
    const guarda = index.indexOf("rpc('usuario_atual_id')");
    expect(index.indexOf('auth.getUser()')).toBeGreaterThan(-1);
    expect(guarda).toBeGreaterThan(index.indexOf('auth.getUser()'));
    for (const acao of ["acao === 'validar_chave'", "acao === 'salvar_configuracao'", "acao === 'gerar'"]) {
      expect(index.indexOf(acao), acao).toBeGreaterThan(guarda);
    }
  });
  it('CORS com lista explícita, sem "*" (CAB-03)', () => {
    expect(index).toMatch(/function origemPermitida/);
    expect(index).not.toMatch(/Access-Control-Allow-Origin'\]\s*=\s*'\*'/);
  });
  it('corpo limitado e objetos fechados (RAT-05, VAL-02)', () => {
    expect(index).toMatch(/MAX_CORPO = 20_000/);
    expect(index.match(/objeto\(corpoJson, \[/g)?.length).toBe(3);
  });
  it('estabelecimento e perfil nunca vêm do corpo (AUZ-03)', () => {
    expect(index).not.toMatch(/corpoJson[^;]*(estabelecimento_id|user_id|usuarioId)/);
  });
  it('log sem conteúdo nem chave (IAD-08, LOG-04)', () => {
    expect(index).toMatch(/SENSIVEL = \/chave\|key\|token/);
    expect(edge.filter((f) => /console\.(log|warn|error)\([^)]*(prompt|conteudo|apiKey|chave)/.test(ler(f)))).toEqual([]);
  });
});
