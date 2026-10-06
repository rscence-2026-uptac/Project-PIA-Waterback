#!/usr/bin/env bash
# Drops & recreates a local test DB (default pia_dev) and runs stub -> migration -> smoke -> RLS tests.
# Override with PGHOST/PGPORT/PGUSER/PGDATABASE. Touches only $PGDATABASE (roles are created if missing).
set -euo pipefail
export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}"
DB="${PGDATABASE:-pia_dev}"
unset PGDATABASE
cd "$(dirname "$0")/../.."
psql -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists \"$DB\" with (force)" -c "create database \"$DB\""
for f in supabase/tests/000_supabase_stub.sql supabase/migrations/20261006000001_init.sql \
         supabase/tests/001_smoke.sql supabase/tests/002_rls.sql; do
  echo "== $f"; psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
echo "ALL PASS"
