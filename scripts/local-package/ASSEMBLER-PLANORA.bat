@echo off
setlocal
cd /d "%~dp0"
echo Assemblage de PLANORA-BTP-local.zip...
if not exist "PLANORA-BTP-local.zip.part0" (
  echo Fichier PLANORA-BTP-local.zip.part0 introuvable : placez les 3 fichiers dans le meme dossier.
  pause
  exit /b 1
)
if not exist "PLANORA-BTP-local.zip.part1" (
  echo Fichier PLANORA-BTP-local.zip.part1 introuvable : placez les 3 fichiers dans le meme dossier.
  pause
  exit /b 1
)
copy /b "PLANORA-BTP-local.zip.part0" + "PLANORA-BTP-local.zip.part1" "PLANORA-BTP-local.zip" > nul
echo Extraction dans le dossier PLANORA-BTP...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath 'PLANORA-BTP-local.zip' -DestinationPath '.' -Force"
if errorlevel 1 (
  echo Extraction automatique impossible : ouvrez PLANORA-BTP-local.zip et choisissez « Extraire tout ».
  pause
  exit /b 1
)
echo.
echo Termine. Ouvrez le dossier PLANORA-BTP puis double-cliquez sur DEMARRER-PLANORA.bat
explorer "PLANORA-BTP"
pause
