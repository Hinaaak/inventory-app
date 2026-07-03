# Inventar QR

## Start

Windows:

```cmd
start-inventar-server.cmd
```

Linux/macOS:

```sh
sh start-inventar-server.sh
```

Danach im Browser öffnen:

```text
http://localhost:8123/
```

Beim ersten Start wird ein Admin-Zugang angelegt:

```text
Benutzer: admin
Passwort: data/initial-admin-password.txt
```

Nach der ersten Anmeldung das Passwort in der App unter **Erreichbarkeit und Backups** ändern und die Datei `data/initial-admin-password.txt` löschen.

Die Inventardaten liegen in SQLite:

```text
data/inventory.sqlite
```

## Linux als Dienst

Ubuntu 24.04 vorbereiten:

```sh
sudo apt update
sudo apt install -y git python3
```

Projekt holen und Dienst installieren:

```sh
git clone <repo-url> inventar-qr
cd inventar-qr
sh install-systemd.sh
```

Danach:

```sh
systemctl status inventar-qr
sudo systemctl restart inventar-qr
sudo systemctl stop inventar-qr
```

Der Dienst wird automatisch beim Neustart gestartet.

## Erreichbarkeit ohne öffentliche IP

Der QR-Code enthält eine URL zur Geräteseite. Diese URL muss vom Handy erreichbar sein.

Geeignete Varianten ohne öffentliche IP:

- Tailscale oder ein anderes VPN
- Cloudflare Tunnel
- interner Reverse Proxy im Firmennetz

Die erreichbare Adresse in der App unter **Erreichbarkeit und Backups** als **Oeffentliche Basisadresse** eintragen.

## Backups

Die Daten liegen in:

```text
data/assets.json
data/config.json
```

Automatische Backups liegen in:

```text
data/backups/
```

In der App können Backups manuell erstellt, heruntergeladen und über **Import** wieder eingespielt werden.

Das lokale Backup-Ziel kann in der App unter **Erreichbarkeit und Backups** gesetzt werden, z. B.:

```text
/var/backups/inventar-qr
```

Der Dienstbenutzer muss dort Schreibrechte haben.

## Updates

Empfohlener Betrieb ist ein GitHub-Checkout auf dem Server:

```sh
git clone <repo-url> inventar-qr
cd inventar-qr
sh install-systemd.sh
```

Updates:

```sh
sh update.sh
```

Oder in der App über **Update aus GitHub**. Die App-Funktion setzt voraus, dass das Projekt ein Git-Checkout ist und `git pull --ff-only` ohne interaktive Eingabe funktioniert.

## Zugriffskonzept

- Die QR-Geraeteseite ist ohne Login erreichbar.
- Inventarverwaltung, Backups, Einstellungen und Updates brauchen den Admin-Login.
- Fuer mehrere Benutzer/Rollen ist spaeter eine Erweiterung vorgesehen; aktuell gibt es einen Admin-Zugang.
