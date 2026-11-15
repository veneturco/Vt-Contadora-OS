@echo off
cd /d "%~dp0"
title VeneTurco Fiscal OS Auto-Sync

:loop
for /f %%i in ('git status --porcelain 2^>nul') do (
    git add -A
    git commit -m "auto: v3.2 continuous sync"
    git push --force-with-lease origin main
    git push --force-with-lease origin master
    timeout /t 10 /nobreak > nul
    goto loop
)
timeout /t 15 /nobreak > nul
goto loop
