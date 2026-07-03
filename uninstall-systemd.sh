#!/usr/bin/env sh
set -eu

SERVICE_NAME="${1:-inventar-qr}"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
sudo systemctl disable "$SERVICE_NAME" 2>/dev/null || true
sudo rm -f "$UNIT_FILE"
sudo systemctl daemon-reload

echo "Dienst entfernt: ${SERVICE_NAME}"
