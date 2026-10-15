-- =============================================================================
-- Kanban: arquivar um quadro dentro de um grupo (lista "Concluídos" do grupo).
--
-- APLICADA em produção em 2026-10-15 (migração kanban_arquivar_quadro), testada antes em
-- supabase/tests/seguranca/run.sh e supabase/tests/kanban/run.sh (autorização de 2026-10-09,
-- regra 8 de .claude/rules/seguranca.md). Conferido: coluna criada e as 5 políticas intactas.
--
-- O arquivamento é da organização pessoal da tela inicial, como o grupo: fica no
-- vínculo kanban_quadro_grupo da própria pessoa e não muda o quadro para mais ninguém.
-- Só acrescenta uma coluna anulável: sem exclusão de dados e sem mudar políticas.
-- As políticas por operação de kanban_quadro_grupo (migração 20261016120000) e a
-- política restritiva de estabelecimento (20261017120000) continuam valendo:
-- só a própria pessoa lê e altera os seus vínculos (AUZ-04, AUZ-07).
-- =============================================================================

begin;

alter table public.kanban_quadro_grupo
  add column if not exists arquivado_em timestamptz;

comment on column public.kanban_quadro_grupo.arquivado_em is
  'Quando a pessoa arquivou o quadro neste grupo (vai para "Concluídos"); nulo = ativo.';

commit;
