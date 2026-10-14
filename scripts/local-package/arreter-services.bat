@echo off
rem Arrete le serveur et PostgREST de ce dossier (la base reste lancee).
if exist "%~dp0..\donnees\serveur.pid" (
  for /f %%p in ('type "%~dp0..\donnees\serveur.pid"') do taskkill /PID %%p /T /F > nul 2>&1
  del "%~dp0..\donnees\serveur.pid" > nul 2>&1
)
taskkill /FI "WINDOWTITLE eq PLANORA-SERVEUR*" /T /F > nul 2>&1
taskkill /FI "WINDOWTITLE eq PLANORA-POSTGREST*" /T /F > nul 2>&1
taskkill /IM postgrest.exe /F > nul 2>&1
exit /b 0
