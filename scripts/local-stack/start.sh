#!/bin/sh
# Démarre la pile de test locale (PostgreSQL déjà lancé ; PGHOST/PGPORT définis).
# Recrée la base « planora_dev », applique l'environnement Supabase simulé et les migrations,
# puis lance PostgREST et la passerelle. Usage : PGHOST=… PGPORT=… sh scripts/local-stack/start.sh
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PSQL="psql -U postgres -v ON_ERROR_STOP=1 -q"
SECRET="${JWT_SECRET:-planora-local-dev-secret-at-least-32-characters!!}"
$PSQL -c "drop database if exists planora_dev with (force)" >/dev/null
$PSQL -c "create database planora_dev" >/dev/null
$PSQL -d planora_dev -f "$ROOT/supabase/tests/shim_supabase.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -d planora_dev -f "$f" >/dev/null; done
[ -n "$PLATFORM_ADMIN" ] && $PSQL -d planora_dev -c "insert into public.platform_admins (email) values ('$PLATFORM_ADMIN') on conflict do nothing" >/dev/null
cat > /tmp/planora-postgrest.conf <<CONF
db-uri = "postgres://postgres@/planora_dev?host=$PGHOST&port=$PGPORT"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = 54331
server-host = "127.0.0.1"
CONF
POSTGREST="${POSTGREST_BIN:-/opt/postgrest/postgrest}"
"$POSTGREST" /tmp/planora-postgrest.conf > /tmp/planora-postgrest.log 2>&1 &
sleep 1
PGDATABASE=planora_dev node "$ROOT/scripts/local-stack/gateway.mjs" > /tmp/planora-gateway.log 2>&1 &
sleep 1
echo "Pile locale prête : http://localhost:54320 (journal : /tmp/planora-gateway.log)"
