import { describe, expect, it } from 'vitest';
import { ler } from '../apoio/arquivos';

/** Cabeçalhos de segurança servidos pela Vercel (vercel.json) para toda rota. */
const config = JSON.parse(ler('vercel.json')) as {
  installCommand?: string;
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const global = config.headers.find((h) => h.source === '/(.*)');
const cab = (nome: string) => global?.headers.find((h) => h.key.toLowerCase() === nome.toLowerCase())?.value ?? '';
const diretivas = Object.fromEntries(
  cab('Content-Security-Policy')
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .filter((d) => d[0])
    .map(([nome, ...valores]) => [nome, valores]),
);

describe('CAB-01: Content-Security-Policy', () => {
  it('scripts só do próprio site, sem unsafe-inline nem unsafe-eval', () => {
    expect(diretivas['script-src']).toEqual(["'self'"]);
    expect(cab('Content-Security-Policy')).not.toMatch(/script-src[^;]*unsafe/);
  });
  it('index.html não tem script inline (o tema vem de /tema.js)', () => {
    const html = ler('index.html');
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, atributos, corpo] of scripts) {
      expect(atributos).toMatch(/src=/);
      expect(corpo.trim()).toBe('');
    }
  });
  it('fecha object, base, form e frame', () => {
    expect(diretivas['default-src']).toEqual(["'self'"]);
    expect(diretivas['object-src']).toEqual(["'none'"]);
    expect(diretivas['base-uri']).toEqual(["'self'"]);
    expect(diretivas['form-action']).toEqual(["'self'"]);
    expect(diretivas['frame-ancestors']).toEqual(["'none'"]);
    expect(diretivas).toHaveProperty('upgrade-insecure-requests');
  });
  it('o navegador só fala com o próprio site e com o Supabase do projeto', () => {
    const conexoes = diretivas['connect-src'] as string[];
    expect(conexoes[0]).toBe("'self'");
    for (const c of conexoes.slice(1)) expect(c).toMatch(/^(https|wss):\/\/[a-z0-9]+\.supabase\.co$/);
    expect(conexoes).not.toContain('*');
  });
});

describe('CRI-02 e CAB-02: cabeçalhos fixos', () => {
  it('HSTS de pelo menos 1 ano', () => {
    const idade = Number(cab('Strict-Transport-Security').match(/max-age=(\d+)/)?.[1] ?? 0);
    expect(idade).toBeGreaterThanOrEqual(31536000);
  });
  it('nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy e COOP', () => {
    expect(cab('X-Content-Type-Options')).toBe('nosniff');
    expect(cab('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(cab('X-Frame-Options')).toBe('DENY');
    expect(cab('Permissions-Policy')).toMatch(/camera=\(\)/);
    expect(cab('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });
  it('CAB-03: nenhum Access-Control-Allow-Origin aberto', () => {
    const todos = config.headers.flatMap((h) => h.headers);
    expect(todos.filter((h) => /access-control-allow-origin/i.test(h.key))).toEqual([]);
  });
});

describe('DEP-02: instalação reproduzível', () => {
  it('Vercel instala com npm ci e o build não roda npm install', () => {
    expect(config.installCommand).toBe('npm ci');
    const pkg = JSON.parse(ler('package.json')) as { scripts: Record<string, string> };
    expect(Object.values(pkg.scripts).join(' ')).not.toMatch(/npm install/);
    expect(ler('package-lock.json').length).toBeGreaterThan(0);
  });
});
