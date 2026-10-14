@echo off
setlocal
cd /d "%~dp0"
echo Assemblage de PLANORA-BTP-local.zip...
@CHECKS@
copy /b @PARTS@ "PLANORA-BTP-local.zip" > nul
echo Extraction dans le dossier PLANORA-BTP...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath 'PLANORA-BTP-local.zip' -DestinationPath '.' -Force"
if errorlevel 1 (
  echo Extraction automatique impossible : ouvrez PLANORA-BTP-local.zip et choisissez Extraire tout.
  pause
  exit /b 1
)
echo.
echo Termine. Ouvrez le dossier PLANORA-BTP puis double-cliquez sur DEMARRER-PLANORA.bat
explorer "PLANORA-BTP"
pause
exit /b 0

:manque
echo Il manque une partie : placez les @N@ fichiers recus dans le meme dossier.
pause
exit /b 1
