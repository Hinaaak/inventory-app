#!/usr/bin/env sh
set -eu

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="${1:-inventar-qr}"

cd "$APP_DIR"

if [ ! -d .git ]; then
  echo "Dieses Verzeichnis ist kein Git-Checkout."
  exit 1
fi

git pull --ff-only

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^${SERVICE_NAME}.service"; then
  sudo systemctl restart "$SERVICE_NAME"
  echo "Dienst neu gestartet: ${SERVICE_NAME}"
else
  echo "Kein systemd-Dienst gefunden. Server bitte manuell neu starten."
fi
