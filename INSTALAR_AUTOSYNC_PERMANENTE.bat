@echo off
chcp 65001 > nul
title Instalador AutoSync Permanente VeneTurco Fiscal OS
color 0B
echo ====================================================================
echo   VeneTurco Fiscal OS - INSTALADOR DE SINCRONIZACIÓN PERMANENTE
echo ====================================================================
echo.
echo Configurando el inicio automatico en segundo plano...

set "SCRIPT_DIR=%~dp0"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_PATH=%SCRIPT_DIR%iniciar_vigilante_silencioso.vbs"

echo Creando acceso directo en la carpeta de Inicio de Windows...
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%STARTUP_FOLDER%\VeneTurco_AutoSync.lnk'); $s.TargetPath = '%VBS_PATH%'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Save()"

echo.
echo Iniciando el vigilante ahora mismo en segundo plano...
wscript.exe "%VBS_PATH%"

echo.
echo ====================================================================
echo  ¡INSTALACIÓN COMPLETADA CON ÉXITO!
echo ====================================================================
echo  A partir de ahora:
echo   - El vigilante corre de forma 100%% invisible en segundo plano.
echo   - Cada vez que enciendas tu PC, arrancará solo.
echo   - Cualquier cambio que la IA haga se subirá solo a GitHub y Render.
echo  Ya puedes cerrar esta ventana.
echo ====================================================================
pause
