import { describe, expect, it } from 'vitest';
import { ler } from '../apoio/arquivos';
import { ETAPAS_LEAD, ORIGENS_LEAD } from '../../src/features/leads/logic';
import { TIPOS_BACKUP } from '../../src/features/backup/logic';

const leads = ler('supabase/migrations/20261023120000_leads.sql');
const backup = ler('supabase/migrations/20261024120000_backup_planilhas.sql');
const semComentarios = (sql: string) => sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

describe('migração dos leads', () => {
  it('etapas e origens da tela iguais às restrições do banco', () => {
    for (const e of ETAPAS_LEAD) expect(leads).toContain(`'${e}'`);
    for (const o of ORIGENS_LEAD) expect(leads).toContain(`'${o}'`);
  });
  it('RLS ligada, política por operação, guarda do estabelecimento e auditoria (AUZ-04, LOG-05)', () => {
    expect(leads).toMatch(/alter table public\.leads enable row level security/);
    for (const op of ['select', 'insert', 'update', 'delete']) expect(leads).toMatch(new RegExp(`"leads: ${op}" on public\\.leads for ${op}`));
    expect(leads).toMatch(/as restrictive for all/);
    expect(leads).toMatch(/execute function public\.estabelecimento_guarda\(\)/);
    expect(leads).toMatch(/execute function public\.auditar_alteracao_generica\(\)/);
    expect(leads).toMatch(/revoke all on public\.leads from anon/);
    expect(leads).not.toMatch(/using \(true\)/);
  });
  it('só cria: sem apagar ou alterar dados existentes', () => {
    expect(semComentarios(leads)).not.toMatch(/\b(drop|delete from|truncate|update public)\b/i);
  });
});

describe('migração do backup', () => {
  it('tipos da tela iguais aos aceitos pelo banco', () => {
    for (const t of TIPOS_BACKUP) expect(backup).toContain(`'${t}'`);
  });
  it('registro exige administradora e segundo fator; funções fechadas para anon', () => {
    expect(backup).toMatch(/usuario_admin\(\)[\s\S]*sessao_aal2\(\)/);
    expect(backup).toMatch(/set search_path = public, pg_temp/);
    expect(backup).toMatch(/revoke all on function public\.registrar_backup\(text, integer\) from public, anon/);
    expect(backup).toMatch(/revoke all on function public\.ultimos_backups\(\) from public, anon/);
  });
  it('só recria a restrição de ações da auditoria (sem apagar dados)', () => {
    expect(semComentarios(backup)).not.toMatch(/\b(delete from|truncate|update public|drop table)\b/i);
  });
});
