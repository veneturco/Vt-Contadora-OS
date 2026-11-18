#!/bin/bash
# VeneTurco Fiscal OS - Git & Cloud Auto-Sync Daemon
# Detecta cambios en la carpeta sincronizada con Google Drive y los empuja a GitHub de inmediato.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR" || exit 1

echo "[AUTO-SYNC] Vigilante de cambios iniciado en $REPO_DIR..."

while true; do
  STATUS=$(git status --porcelain)
  if [ -n "$STATUS" ]; then
    echo "[AUTO-SYNC] Cambios detectados a las $(date):"
    git status -s
    git add .
    git commit -m "auto: sincronización continua VeneTurco Fiscal OS [$(date '+%Y-%m-%d %H:%M:%S')]"
    git push origin main
    git push origin master
    echo "[AUTO-SYNC] ¡Despliegue a GitHub completado! Render actualizará en automático."
  fi
  sleep 10
done
