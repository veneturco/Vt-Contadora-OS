@echo off
chcp 65001 > nul
echo ===================================================
echo   VeneTurco Fiscal OS v3.2 - Actualizador a GitHub
echo ===================================================
echo.

echo 1. Comprobando estado de Git...
git status
echo.

echo 2. Agregando archivos modificados del motor VNDE v3.2...
git add .
echo.

echo 3. Creando commit de actualizacion...
git commit -m "feat: release v3.2 VNDE engine with 0 token processing and SENIAT 2026 presets"
echo.

echo 4. Enviando cambios de la version 3.2 a GitHub...
git push --force-with-lease origin main
git push --force-with-lease origin master
echo.

echo ===================================================
echo  ¡Listo! GitHub actualizado a v3.2.
echo  Render detectara los cambios y desplegara en 1 min.
echo ===================================================
pause
