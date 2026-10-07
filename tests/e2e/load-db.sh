#!/usr/bin/env bash
# Muat ulang database uji "sipar": tiruan Supabase + semua migration + seed + akun uji.
# Variabel: PGHOST (default /tmp), PGPORT (default 54329), PGUSER (default postgres).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
P="$HERE/../../supabase"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
PSQL="psql -v ON_ERROR_STOP=1 -q"
$PSQL -c "drop database if exists sipar with (force)" -c "create database sipar"
# Role bersifat global di cluster: buat sekali, lalu jalankan mock tanpa baris create role.
$PSQL -tAc "select 1 from pg_roles where rolname='anon'" | grep -q 1 || $PSQL -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role authenticator login noinherit; grant anon, authenticated to authenticator;"
# Alat backup memakai JWT service_role lewat PostgREST (seperti kunci service_role Supabase).
$PSQL -tAc "select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member where r.rolname = 'service_role' and u.rolname = 'authenticator'" | grep -q 1 || $PSQL -c "grant service_role to authenticator" >/dev/null
grep -v "^create role" "$P/tests/mock_supabase.sql" | $PSQL -d sipar -f - >/dev/null
for f in "$P"/migrations/*.sql; do $PSQL -d sipar -f "$f" >/dev/null 2>&1 || { echo "GAGAL: $f"; $PSQL -d sipar -f "$f" 2>&1 | grep ERROR; exit 1; }; done
$PSQL -d sipar -f "$P/seed.sql" >/dev/null
$PSQL -d sipar -f "$P/seed_test_users.sql" >/dev/null
$PSQL -d sipar -c "notify pgrst, 'reload schema'"   # PostgREST memuat ulang cache skema
rm -rf "$HERE/.storage"   # file tiruan Storage ikut dikosongkan
echo "database sipar dimuat ulang"
