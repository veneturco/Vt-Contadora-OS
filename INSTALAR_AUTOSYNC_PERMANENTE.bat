@echo off
cd /d "%~dp0"
echo ===================================================
echo   VeneTurco Fiscal OS - Instalador AutoSync
echo ===================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_PATH=%SCRIPT_DIR%iniciar_vigilante_silencioso.vbs"

echo 1. Creando acceso directo en el Inicio de Windows...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%STARTUP_FOLDER%\VeneTurco_AutoSync.lnk'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_PATH%\"'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Save()"

echo.
echo 2. Subiendo cambios a GitHub de una vez...
git add -A
git commit -m "feat: release v3.2 VNDE engine with 0 token processing"
git push --force-with-lease origin main
git push --force-with-lease origin master

echo.
echo 3. Iniciando vigilante en segundo plano...
wscript.exe "%VBS_PATH%"

echo.
echo ===================================================
echo   INSTALACION COMPLETADA CON EXITO
echo   Render se actualizara en 1 minuto.
echo ===================================================
pause
