import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { fontes, ler, migracoes, rel, RAIZ } from '../apoio/arquivos';

/** Buscas estáticas que provam requisitos de "busca sem resultado" (docs/seguranca/requisitos.md). */
const ocorrencias = (regex: RegExp, ignorar: string[] = []) =>
  fontes()
    .filter((f) => !ignorar.includes(rel(f)))
    .flatMap((f) =>
      ler(f)
        .split('\n')
        .map((linha, i) => ({ arquivo: `${rel(f)}:${i + 1}`, linha }))
        .filter(({ linha }) => regex.test(linha) && !/^\s*(\*|\/\/)/.test(linha)),
    )
    .map((o) => o.arquivo);

describe('SEG-01: configuração', () => {
  it('só src/lib/env.ts lê variáveis de ambiente (PROD/DEV/MODE são constantes de build)', () => {
    expect(ocorrencias(/import\.meta\.env(?!\.(PROD|DEV|MODE)\b)/, ['src/lib/env.ts'])).toEqual([]);
    expect(ocorrencias(/process\.env/)).toEqual([]);
  });
  it('sem URL nem chave do Supabase escritas no código', () => {
    expect(ocorrencias(/sb_(publishable|secret)_[A-Za-z0-9_-]{10,}|eyJhbGci|[a-z0-9]{20}\.supabase\.co/)).toEqual([]);
  });
  it('o build valida as variáveis (vite.config.ts chama validarEnv)', () => {
    expect(ler('vite.config.ts')).toMatch(/validarEnv\(loadEnv\(/);
  });
});

describe('SEG-02: .env fora do repositório', () => {
  it('git ignora .env, .env.local e .env.*.local', () => {
    const saida = execSync('git check-ignore .env .env.local .env.production.local', { cwd: RAIZ }).toString();
    expect(saida).toContain('.env\n');
    expect(saida).toContain('.env.local');
    expect(saida).toContain('.env.production.local');
  });
  it('só .env.example está versionado', () => {
    const versionados = execSync('git ls-files', { cwd: RAIZ }).toString().split('\n').filter((f) => /(^|\/)\.env/.test(f));
    expect(versionados.filter((f) => f !== '.env.example')).toEqual([]);
  });
});

describe('SEG-03: variáveis públicas', () => {
  const exemplo = ler('.env.example');
  const variaveis = [...exemplo.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]);

  it('.env.example marca cada variável como pública ou privada', () => {
    expect(variaveis.length).toBeGreaterThan(0);
    const linhas = exemplo.split('\n');
    for (const v of variaveis) {
      const i = linhas.findIndex((l) => l.startsWith(`${v}=`));
      const comentarioAnterior = linhas.slice(Math.max(0, i - 4), i).join('\n');
      expect(comentarioAnterior, v).toMatch(/\[(PÚBLICA|PRIVADA)\]/);
    }
  });
  it('nenhuma variável pública tem nome de segredo', () => {
    const publicas = variaveis.filter((v) => /^(NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_|EXPO_PUBLIC_)/.test(v));
    expect(publicas.filter((v) => /SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN/.test(v))).toEqual([]);
  });
  it('o app (SPA) não tem variável privada: tudo com VITE_ vai para o navegador', () => {
    expect(variaveis.filter((v) => !v.startsWith('VITE_'))).toEqual([]);
  });
});

describe('AUZ-05: chave administrativa nunca no navegador', () => {
  it('service role só aparece em env.ts (onde é recusada)', () => {
    expect(ocorrencias(/service_role|SERVICE_ROLE|sb_secret/i, ['src/lib/env.ts'])).toEqual([]);
  });
});

describe('SES-02: armazenamento do navegador', () => {
  it('localStorage só guarda preferências de tela (tema e escopo de finanças)', () => {
    const usos = ocorrencias(/localStorage|sessionStorage/);
    expect(usos.every((u) => /^src\/(hooks\/useTheme\.ts|pages\/Financeiro\.tsx):/.test(u))).toBe(true);
    expect(ocorrencias(/(local|session)Storage.*(token|session|auth)/i)).toEqual([]);
  });
});

describe('SES-06 e AUT-01: sem autenticação própria', () => {
  it('sem jwt.decode / jwtDecode / bcrypt / argon2 / jwt.sign / createHash', () => {
    expect(ocorrencias(/jwt\.decode|jwtDecode|bcrypt|argon2|jwt\.sign|createHash\(/)).toEqual([]);
  });
});

describe('VAL-03, LLM-07: sem SQL montado nem execução dinâmica', () => {
  it('sem eval, new Function ou SQL em template string com interpolação', () => {
    expect(ocorrencias(/\beval\(|new Function\(/)).toEqual([]);
    expect(ocorrencias(/`[^`]*\b(select .* from|insert into|delete from)\b[^`]*\$\{/i)).toEqual([]);
  });
  it('filtros do PostgREST (.or/.filter) não recebem texto digitado', () => {
    expect(ocorrencias(/\.(or|filter)\(`[^`]*\$\{/)).toEqual([]);
  });
});

describe('VAL-04: HTML bruto', () => {
  it('sem dangerouslySetInnerHTML nem innerHTML', () => {
    expect(ocorrencias(/dangerouslySetInnerHTML|\.innerHTML\s*=/)).toEqual([]);
  });
});

describe('CRI-01, CRI-05, CRI-06: criptografia', () => {
  it('verificação de certificado nunca desligada', () => {
    expect(ocorrencias(/rejectUnauthorized:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/)).toEqual([]);
  });
  it('sem MD5, SHA-1, createCipher ou ECB', () => {
    expect(ocorrencias(/\bmd5\b|\bsha1\b|createCipher\(|-ecb\b/i)).toEqual([]);
  });
  it('sem Math.random', () => {
    expect(ocorrencias(/Math\.random/)).toEqual([]);
  });
});

describe('LOG-01 e LOG-04: erros e logs', () => {
  it('console.* só dentro do logger', () => {
    expect(ocorrencias(/console\.(log|info|warn|error|debug)/, ['src/lib/seguranca/logger.ts'])).toEqual([]);
  });
  it('mensagem crua do banco nunca vai para a tela', () => {
    expect(ocorrencias(/\$\{[^}]*\.message\}/)).toEqual([]);
    expect(ocorrencias(/(alert|setErro|setError|onAviso|setAviso)\([^)]*\.message\b/)).toEqual([]);
  });
});

describe('LOG-02: sem source maps públicos', () => {
  it('vite.config desliga source maps', () => {
    expect(ler('vite.config.ts')).toMatch(/sourcemap:\s*false/);
  });
  it('se houver build, não há .map em dist', () => {
    const dist = `${RAIZ}/dist`;
    if (!fs.existsSync(dist)) return;
    const mapas = execSync(`find "${dist}" -name "*.map"`).toString().trim();
    expect(mapas).toBe('');
  });
});

describe('AUT-08: sem contas embutidas', () => {
  it('código e migrações sem senha literal', () => {
    expect(ocorrencias(/(senha|password)\s*[:=]\s*["'][^"']{4,}["']/i)).toEqual([]);
    const sql = migracoes().map((f) => ler(f)).join('\n');
    expect(sql).not.toMatch(/encrypted_password|crypt\(\s*'/i);
  });
});

describe('AUZ-04: RLS nasce com a tabela', () => {
  it('toda tabela criada nas migrações tem RLS ligado', () => {
    const sql = migracoes().map((f) => ler(f)).join('\n').toLowerCase();
    const tabelas = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map((m) => m[1]);
    expect(tabelas.length).toBeGreaterThan(0);
    for (const t of tabelas) {
      expect(sql, t).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
    }
  });
  it('toda função security definer fixa o search_path', () => {
    for (const f of migracoes()) {
      const blocos = ler(f).split(/create or replace function/i).slice(1);
      for (const b of blocos) {
        const cabecalho = b.split('$$')[0];
        if (/security definer/i.test(cabecalho)) expect(cabecalho, `${rel(f)}: ${cabecalho.split('(')[0].trim()}`).toMatch(/set search_path/i);
      }
    }
  });
});
