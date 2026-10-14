@echo off
setlocal
title PLANORA BTP - demarrage
cd /d "%~dp0"
set "ROOT=%~dp0"
set "PGBIN=%ROOT%runtime\pgsql\bin"
set "DATA=%ROOT%donnees"
set "PGDATA=%DATA%\base"
set "NODE=%ROOT%runtime\node\node.exe"

echo.
echo  ==============================================
echo     PLANORA BTP - version de test locale
echo  ==============================================
echo.

if not exist "%DATA%" mkdir "%DATA%"
if not exist "%DATA%\fichiers" mkdir "%DATA%\fichiers"

set "ADMIN="
if not exist "%PGDATA%\PG_VERSION" (
  echo Premier lancement : creation de la base de donnees, patientez...
  "%PGBIN%\initdb.exe" -D "%PGDATA%" -U postgres -A trust -E UTF8 --locale=C > "%DATA%\initdb.log" 2>&1
  if errorlevel 1 (
    echo ECHEC de la creation de la base. Details : donnees\initdb.log
    pause
    exit /b 1
  )
  echo.
  echo Adresse e-mail de l'administrateur de la plateforme PLANORA
  set /p "ADMIN=(laissez vide si vous ne voulez pas l'espace administration) : "
)

"%PGBIN%\pg_ctl.exe" -D "%PGDATA%" status > nul 2>&1
if errorlevel 1 (
  echo Demarrage de la base de donnees...
  "%PGBIN%\pg_ctl.exe" -D "%PGDATA%" -o "-p 54329 -c listen_addresses=127.0.0.1" -l "%DATA%\postgres.log" -w -t 60 start > nul
  if errorlevel 1 (
    echo ECHEC du demarrage de la base. Details : donnees\postgres.log
    pause
    exit /b 1
  )
)

"%NODE%" "%ROOT%app\installer.mjs" "%ROOT%app\sql" "%DATA%" "%ADMIN%"
if errorlevel 1 (
  pause
  exit /b 1
)

call "%ROOT%app\arreter-services.bat" > nul 2>&1

echo Demarrage des services...
start "PLANORA-POSTGREST" /min "%ROOT%runtime\postgrest\postgrest.exe" "%DATA%\postgrest.conf"

set /p JWT_SECRET=<"%DATA%\secret.txt"
set "GATEWAY_PORT=54320"
set "POSTGREST_URL=http://127.0.0.1:54331"
set "PGHOST=127.0.0.1"
set "PGPORT=54329"
set "PGDATABASE=planora"
set "FILES_DIR=%DATA%\fichiers"
set "STATIC_DIR=%ROOT%app\site"
set "AUTO_CONFIRM=1"
set "DEV_ROUTES=0"
set "LISTEN_HOST=127.0.0.1"
set "PID_FILE=%DATA%\serveur.pid"
start "PLANORA-SERVEUR" /min cmd /c ""%NODE%" "%ROOT%app\serveur.mjs" > "%DATA%\serveur.log" 2>&1"

timeout /t 4 /nobreak > nul
start "" "http://localhost:54320/"

echo.
echo  PLANORA BTP est lance : http://localhost:54320/
echo  (la page s'ouvre dans votre navigateur)
echo.
echo  Pour arreter : double-cliquez sur ARRETER-PLANORA.bat
echo  Vos donnees restent dans le dossier "donnees".
echo.
pause
