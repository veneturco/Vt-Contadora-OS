@echo off
chcp 65001 > nul
title VeneTurco Fiscal OS - Auto-Sync GitHub & Render
color 0A
echo ====================================================================
echo   VeneTurco Fiscal OS - VIGILANTE AUTOMATICO GITHUB ^& RENDER
echo ====================================================================
echo.
echo Este vigilante monitorea tu carpeta de Google Drive cada 15 segundos.
echo Cuando la IA o tu guarden cualquier mejora o archivo, automaticamente:
echo   1. Hara git add y git commit.
echo   2. Hara git push a GitHub.
echo   3. Render detectara el push y actualizara tu web en vivo.
echo.
echo Dejalo minimizado en tu barra de tareas para automatizacion 100%%.
echo ====================================================================
echo.

:loop
git status --porcelain > nul 2>&1
for /f %%i in ('git status --porcelain 2^>nul') do (
    echo [%TIME%] Cambios detectados. Verificando pruebas unitarias antes de subir...
    call npm test
    if errorlevel 1 (
        echo [%TIME%] ALERTA: Las pruebas fallaron. Se cancela el push automatico para proteger produccion.
        goto wait
    )
    echo [%TIME%] Pruebas exitosas. Sincronizando con GitHub...
    git add .
    git commit -m "auto: mejora continua VeneTurco Fiscal OS [%DATE% %TIME%]"
    git push origin main
    git push origin master
    echo [%TIME%] ¡Cambios subidos a GitHub exitosamente! Render se esta actualizando.
    echo.
    goto wait
)

:wait
timeout /t 15 /nobreak > nul
goto loop
