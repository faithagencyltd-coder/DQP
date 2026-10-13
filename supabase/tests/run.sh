#!/bin/sh
# Applique les migrations sur une base PostgreSQL locale vierge puis lance les tests d'accès.
# Usage : PGHOST=… PGPORT=… sh supabase/tests/run.sh
set -e
cd "$(dirname "$0")"
PSQL="psql -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "drop database if exists planora_test" >/dev/null
$PSQL -c "create database planora_test" >/dev/null
$PSQL -d planora_test -f shim_supabase.sql >/dev/null
for f in ../migrations/*.sql; do $PSQL -d planora_test -f "$f" >/dev/null; done
$PSQL -d planora_test -f rls_test.sql
