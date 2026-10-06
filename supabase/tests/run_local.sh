#!/usr/bin/env bash
# Drops & recreates a local test DB (default pia_dev) and runs stub -> all migrations -> seeds -> smoke -> RLS tests.
# Override with PGHOST/PGPORT/PGUSER/PGDATABASE. Touches only $PGDATABASE (roles are created if missing).
set -euo pipefail
export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}"
DB="${PGDATABASE:-pia_dev}"
unset PGDATABASE
cd "$(dirname "$0")/../.."
psql -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists \"$DB\" with (force)" -c "create database \"$DB\""
files=(supabase/tests/000_supabase_stub.sql)
for f in $(ls supabase/migrations/*.sql | sort); do files+=("$f"); done
# seed files in the order given by [db.seed] sql_paths in supabase/config.toml
while IFS= read -r f; do files+=("supabase/${f#./}"); done < <(
  grep -E '^sql_paths' supabase/config.toml | grep -oE '"[^"]+"' | tr -d '"')
files+=(supabase/tests/001_smoke.sql supabase/tests/002_rls.sql)
for f in "${files[@]}"; do
  echo "== $f"; psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
echo "ALL PASS"
