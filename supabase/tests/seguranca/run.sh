#!/usr/bin/env bash
# Testes de segurança do banco (AUZ-04, AUZ-09, LOG-05, LOG-06) num Postgres local descartável.
# Aplica TODAS as migrações em ordem sobre um stub do Supabase. Não toca no Supabase real.
# Uso: PGHOST=/caminho/do/socket PGPORT=5432 PGUSER=postgres bash supabase/tests/seguranca/run.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DB="${SEGURANCA_TEST_DB:-seguranca_test}"

# Banco novo com o stub e todas as migrações; cada arquivo de teste roda no seu.
rodar() {
  local banco="$1" teste="$2"
  psql -qc "drop database if exists $banco" -c "create database $banco"
  psql -d "$banco" -q -v ON_ERROR_STOP=1 -f "$DIR/../kanban/00_supabase_stub.sql"
  psql -d "$banco" -q -v ON_ERROR_STOP=1 -f "$DIR/00_tabelas_stub.sql"
  for m in "$DIR"/../../migrations/*.sql; do
    psql -d "$banco" -q -v ON_ERROR_STOP=1 -f "$m"
  done
  psql -d "$banco" -q -At -v ON_ERROR_STOP=1 -f "$DIR/$teste"
}

rodar "$DB" seguranca.test.sql
rodar "${DB}_gestao" gestao.test.sql
rodar "${DB}_pacotes" pacotes.test.sql
rodar "${DB}_kanban_pessoal" kanban_pessoal.test.sql
rodar "${DB}_kanban_visao" kanban_visao_grupos.test.sql
echo "Testes de segurança do banco: OK"
