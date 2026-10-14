#!/bin/sh
# Assemble le paquet de test local Windows de PLANORA BTP (fichiers à envoyer :
# ASSEMBLER-PLANORA.bat + PLANORA-BTP-local.zip.part0, .part1…).
# Usage : sh scripts/local-package/build.sh <dossier_de_travail>
# Télécharge : PostgreSQL 16 (paquet npm @embedded-postgres/windows-x64), PostgREST 12.2.3,
# Node.js 22.22.0 et le runtime Visual C++ (paquet PyPI msvc-runtime).
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
W="${1:?dossier de travail}"
PKG="$W/PLANORA-BTP"
DL="$W/dl"
rm -rf "$PKG" "$W/sortie"; mkdir -p "$PKG/app/sql" "$PKG/runtime/pgsql" "$PKG/runtime/postgrest" "$PKG/runtime/node" "$DL" "$W/sortie"

cd "$DL"
[ -f pg.tgz ] || { npm pack @embedded-postgres/windows-x64@16.14.0-beta.17 >/dev/null && mv embedded-postgres-windows-x64-*.tgz pg.tgz; }
[ -f postgrest.zip ] || curl -sSL -o postgrest.zip https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-windows-x64.zip
[ -f node.zip ] || curl -sSL -o node.zip https://nodejs.org/dist/v22.22.0/node-v22.22.0-win-x64.zip
[ -f vc.whl ] || { pip download msvc-runtime==14.44.35112 --only-binary=:all: --platform win_amd64 --python-version 3.12 --no-deps -d . >/dev/null && mv msvc_runtime-*.whl vc.whl; }
rm -rf x && mkdir x && tar xzf pg.tgz -C x && unzip -q postgrest.zip -d x/postgrest && unzip -q node.zip -d x/node && unzip -q vc.whl -d x/vc

cp -r x/package/native/bin x/package/native/lib x/package/native/share "$PKG/runtime/pgsql/"
rm -f "$PKG"/runtime/pgsql/bin/wx*.dll
for d in vcruntime140.dll vcruntime140_1.dll msvcp140.dll; do cp "x/vc/msvc_runtime-14.44.35112.data/data/Scripts/$d" "$PKG/runtime/pgsql/bin/"; cp "x/vc/msvc_runtime-14.44.35112.data/data/Scripts/$d" "$PKG/runtime/postgrest/"; done
cp x/postgrest/*/*/postgrest.exe "$PKG/runtime/postgrest/"
cp x/node/*/node.exe "$PKG/runtime/node/"
cp x/package/LICENSE.md "$PKG/runtime/pgsql/LICENCE-embedded-postgres.md"
cp x/node/*/LICENSE "$PKG/runtime/node/LICENCE.txt"
cp x/vc/msvc_runtime-*.dist-info/licenses/LICENSE "$PKG/runtime/LICENCE-runtime-visual-cpp.txt"

cd "$ROOT"
VITE_SUPABASE_URL=http://localhost:54320 VITE_SUPABASE_PUBLISHABLE_KEY=cle-locale npx vite build --outDir "$PKG/app/site" --emptyOutDir >/dev/null
npx esbuild scripts/local-stack/gateway.mjs --bundle --platform=node --format=esm --target=node22 --external:pg-native --outfile="$PKG/app/serveur.mjs" \
  --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" --log-level=warning
npx esbuild scripts/local-package/installer.mjs --bundle --platform=node --format=esm --target=node22 --external:pg-native --outfile="$PKG/app/installer.mjs" \
  --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" --log-level=warning
cp supabase/tests/shim_supabase.sql "$PKG/app/sql/0000_environnement_local.sql"
cp supabase/migrations/*.sql "$PKG/app/sql/"
for f in DEMARRER-PLANORA.bat ARRETER-PLANORA.bat LISEZ-MOI.txt; do sed 's/$/\r/' "scripts/local-package/$f" > "$PKG/$f"; done
sed 's/$/\r/' scripts/local-package/arreter-services.bat > "$PKG/app/arreter-services.bat"

cd "$W"
rm -f PLANORA-BTP-local.zip && zip -q -r -9 PLANORA-BTP-local.zip PLANORA-BTP
# Parties de 28 Mo au plus (limite d'envoi de 30 Mo par fichier).
split -b 28m -d -a 1 PLANORA-BTP-local.zip "sortie/PLANORA-BTP-local.zip.part"
N=$(ls sortie/PLANORA-BTP-local.zip.part* | wc -l)
PARTS=""; CHECKS=""
i=0
while [ $i -lt $N ]; do
  PARTS="$PARTS${PARTS:++}\"PLANORA-BTP-local.zip.part$i\""
  CHECKS="${CHECKS}if not exist \"PLANORA-BTP-local.zip.part$i\" goto manque\n"
  i=$((i + 1))
done
sed -e "s|@PARTS@|$PARTS|" -e "s|@CHECKS@|$CHECKS|" -e "s|@N@|$((N + 1))|g" "$ROOT/scripts/local-package/ASSEMBLER-PLANORA.bat" | sed 's/$/\r/' > sortie/ASSEMBLER-PLANORA.bat
ls -la sortie
