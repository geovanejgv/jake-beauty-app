#!/usr/bin/env bash
# Roda os testes do Kanban num Postgres local descartável (não toca no Supabase).
# Uso: PGHOST=/caminho/do/socket PGPORT=5432 PGUSER=postgres bash supabase/tests/kanban/run.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DB="${KANBAN_TEST_DB:-kanban_test}"
psql -qc "drop database if exists $DB" -c "create database $DB"
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$DIR/00_supabase_stub.sql"
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$DIR/../../migrations/20261004120000_kanban.sql"
psql -d "$DB" -q -At -v ON_ERROR_STOP=1 -f "$DIR/kanban.test.sql"
