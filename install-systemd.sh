#!/usr/bin/env sh
set -eu

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="${1:-inventar-qr}"
PYTHON_BIN="$(command -v python3 || command -v python)"
USER_NAME="$(id -un)"

if [ "$(id -u)" -eq 0 ]; then
  echo "Bitte nicht direkt als root starten. Nutze: sudo sh install-systemd.sh"
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl wurde nicht gefunden."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Hinweis: git ist nicht installiert. Die Update-Funktion braucht git."
fi

UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

sudo tee "$UNIT_FILE" >/dev/null <<EOF
[Unit]
Description=Inventar QR
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${APP_DIR}
ExecStart=${PYTHON_BIN} ${APP_DIR}/server.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo "Dienst installiert und gestartet: ${SERVICE_NAME}"
echo "Status: systemctl status ${SERVICE_NAME}"
