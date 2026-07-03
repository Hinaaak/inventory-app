# Installation auf Ubuntu 24.04

Diese Anleitung beschreibt eine produktionsnahe Installation auf Ubuntu 24.04 mit systemd-Dienst und Reverse-Proxy.

## Voraussetzungen

- Ubuntu Server 24.04
- Ein normaler Benutzer mit `sudo`-Rechten
- Zugriff auf das GitHub-Repository
- Eine DNS-Adresse, die auf den Reverse-Proxy zeigt, z. B. `inventory.example.de`
- Reverse-Proxy mit HTTPS, z. B. Nginx, Apache, Caddy, Traefik oder ein vorhandener Firmen-Proxy

Die App selbst läuft intern auf Port `8123`. Von außen sollte später nur der Reverse-Proxy per HTTPS erreichbar sein.

## 1. System vorbereiten

```sh
sudo apt update
sudo apt upgrade -y
sudo apt install -y git python3 openssh-client
```

Optional, aber empfohlen:

```sh
sudo timedatectl set-timezone Europe/Berlin
```

## 2. Benutzer für die App anlegen

Die App sollte nicht als `root` laufen.

```sh
sudo adduser --system --group --home /opt/inventory-app inventory-app
sudo chown -R inventory-app:inventory-app /opt/inventory-app
```

Danach in den Benutzer wechseln:

```sh
sudo -iu inventory-app
```

## 3. Repository klonen

### Variante A: Öffentliches Repository oder HTTPS

```sh
git clone https://github.com/Hinaaak/inventory-app.git /opt/inventory-app/app
cd /opt/inventory-app/app
```

### Variante B: Privates Repository per SSH

Falls das Repository privat ist, muss auf dem Server ein SSH-Key für den Benutzer `inventory-app` hinterlegt und bei GitHub als Deploy Key oder Benutzer-Key eingetragen werden.

SSH-Key erzeugen:

```sh
ssh-keygen -t ed25519 -C "inventory-app-server" -f ~/.ssh/inventory_app_github
cat ~/.ssh/inventory_app_github.pub
```

Den ausgegebenen öffentlichen Schlüssel in GitHub eintragen:

- Repository öffnen
- `Settings`
- `Deploy keys`
- `Add deploy key`
- Key einfügen
- Für Updates reicht normalerweise Lesen. Schreibrecht ist nicht nötig.

SSH-Zugriff testen:

```sh
ssh -T git@github.com
```

Repository klonen:

```sh
GIT_SSH_COMMAND="ssh -i ~/.ssh/inventory_app_github -o IdentitiesOnly=yes" \
git clone git@github.com:Hinaaak/inventory-app.git /opt/inventory-app/app

cd /opt/inventory-app/app
```

## 4. Dienst installieren

Wichtig: Das Installationsskript nicht direkt als `root` starten. Es nutzt intern `sudo`, damit der Dienst mit dem aktuellen Benutzer läuft.

Wenn du noch als `inventory-app` angemeldet bist:

```sh
cd /opt/inventory-app/app
sh install-systemd.sh inventory-app
```

Falls `sudo` für den Systembenutzer nicht erlaubt ist, führe die Installation mit deinem normalen Admin-Benutzer aus und setze den Besitz danach korrekt:

```sh
sudo chown -R inventory-app:inventory-app /opt/inventory-app
cd /opt/inventory-app/app
sudo tee /etc/systemd/system/inventory-app.service >/dev/null <<'EOF'
[Unit]
Description=Inventory App
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=inventory-app
WorkingDirectory=/opt/inventory-app/app
ExecStart=/usr/bin/python3 /opt/inventory-app/app/server.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable inventory-app
sudo systemctl restart inventory-app
```

Status prüfen:

```sh
systemctl status inventory-app
```

Logs anzeigen:

```sh
journalctl -u inventory-app -f
```

## 5. Erste Anmeldung

Beim ersten Start erzeugt die App ein initiales Admin-Passwort.

Anzeigen:

```sh
sudo cat /opt/inventory-app/app/data/initial-admin-password.txt
```

Dann im Browser öffnen:

```text
http://SERVER-IP:8123/
```

Nach der ersten Anmeldung:

1. Passwort in der App ändern.
2. Datei mit dem initialen Passwort löschen:

```sh
sudo rm /opt/inventory-app/app/data/initial-admin-password.txt
```

## 6. Reverse-Proxy und HTTPS

Die App muss für QR-Codes eine öffentliche Basisadresse kennen, z. B.:

```text
https://inventory.example.de/
```

Diese Adresse wird in der App unter `Einstellungen` als `Öffentliche Basisadresse` eingetragen.

### Beispiel: Nginx

Nginx installieren:

```sh
sudo apt install -y nginx
```

Site anlegen:

```sh
sudo tee /etc/nginx/sites-available/inventory-app >/dev/null <<'EOF'
server {
    listen 80;
    server_name inventory.example.de;

    location / {
        proxy_pass http://127.0.0.1:8123;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/inventory-app /etc/nginx/sites-enabled/inventory-app
sudo nginx -t
sudo systemctl reload nginx
```

HTTPS mit Let's Encrypt:

```sh
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d inventory.example.de
```

Wenn in der Firma bereits ein Reverse-Proxy existiert, muss dort nur auf `http://SERVER-IP:8123` weitergeleitet werden.

## 7. Backup-Ziel einrichten

Standardmäßig liegen Daten und Backups im App-Verzeichnis unter `data/`.

Empfohlenes lokales Backup-Ziel:

```sh
sudo mkdir -p /var/backups/inventory-app
sudo chown inventory-app:inventory-app /var/backups/inventory-app
sudo chmod 750 /var/backups/inventory-app
```

Danach in der App unter `Einstellungen` eintragen:

```text
/var/backups/inventory-app
```

Die wichtigsten Daten liegen hier:

```text
/opt/inventory-app/app/data/inventory.sqlite
/opt/inventory-app/app/data/config.json
/opt/inventory-app/app/data/users.json
/opt/inventory-app/app/data/customers.json
```

## 8. Updates

Update per SSH auf dem Server:

```sh
sudo -iu inventory-app
cd /opt/inventory-app/app
sh update.sh inventory-app
```

Oder direkt:

```sh
cd /opt/inventory-app/app
git pull --ff-only
sudo systemctl restart inventory-app
```

Die Update-Funktion in der App nutzt ebenfalls `git pull --ff-only`. Dafür muss das Repository auf dem Server ohne interaktive Eingabe pullen können.

## 9. Nützliche Befehle

Dienst starten:

```sh
sudo systemctl start inventory-app
```

Dienst stoppen:

```sh
sudo systemctl stop inventory-app
```

Dienst neu starten:

```sh
sudo systemctl restart inventory-app
```

Autostart prüfen:

```sh
systemctl is-enabled inventory-app
```

Port prüfen:

```sh
ss -tulpn | grep 8123
```

## 10. Fehlerbehebung

### `Permission denied (publickey)` beim Klonen

Der Server hat keinen passenden GitHub-SSH-Key oder GitHub kennt den öffentlichen Schlüssel noch nicht.

Prüfen:

```sh
ssh -T git@github.com
```

Bei privatem Repository muss der öffentliche Key in GitHub hinterlegt sein.

### Installationsskript darf nicht als root laufen

Das ist absichtlich so. Entweder als normaler Benutzer mit `sudo` ausführen oder die manuelle systemd-Datei aus Abschnitt 4 nutzen.

### QR-Code öffnet falsche Adresse

In der App unter `Einstellungen` die `Öffentliche Basisadresse` prüfen. Sie muss exakt die HTTPS-Adresse enthalten, unter der Handys die App erreichen.

Beispiel:

```text
https://inventory.example.de/
```

### Nach Update keine Änderung sichtbar

Dienst neu starten:

```sh
sudo systemctl restart inventory-app
```

Browser-Cache neu laden:

```text
Strg + F5
```
