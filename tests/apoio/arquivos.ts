import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function listar(dir: string, filtro: (f: string) => boolean): string[] {
  const saida: string[] = [];
  const andar = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
        andar(p);
      } else if (filtro(p)) saida.push(p);
    }
  };
  andar(path.join(RAIZ, dir));
  return saida;
}

export const ler = (p: string) => fs.readFileSync(path.isAbsolute(p) ? p : path.join(RAIZ, p), 'utf8');
export const rel = (p: string) => path.relative(RAIZ, p).split(path.sep).join('/');
/** Código do app que vai para o navegador (sem os testes). */
export const fontes = () => listar('src', (f) => /\.(ts|tsx|js)$/.test(f) && !/\.test\.tsx?$/.test(f));
export const migracoes = () => listar('supabase/migrations', (f) => f.endsWith('.sql')).sort();
