@echo off
cd /d "%~dp0"
echo ===================================================
echo   Actualizando GitHub y Render a v3.2...
echo ===================================================
echo.
echo 1. Agregando archivos...
git add -A
echo.
echo 2. Guardando version v3.2...
git commit -m "feat: release v3.2 VNDE engine with 0 token processing"
echo.
echo 3. Enviando a GitHub (Render se actualizara solo)...
git push --force-with-lease origin main
git push --force-with-lease origin master
echo.
echo ===================================================
echo   LISTO! Version 3.2 enviada a GitHub con exito.
echo   Render iniciara el despliegue en 1 minuto.
echo ===================================================
pause
