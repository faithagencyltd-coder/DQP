@echo off
setlocal
cd /d "%~dp0"
echo Arret de PLANORA BTP...
call "%~dp0app\arreter-services.bat" > nul 2>&1
"%~dp0runtime\pgsql\bin\pg_ctl.exe" -D "%~dp0donnees\base" -m fast -w stop > nul 2>&1
echo PLANORA BTP est arrete. Vos donnees sont conservees dans le dossier "donnees".
timeout /t 3 > nul
