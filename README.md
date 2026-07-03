# Inventar QR

Inventar QR ist eine kleine Web-App zur Geräteinventarisierung mit QR-Codes. QR-Codes führen auf eine mobil nutzbare Geräteseite, während Inventar, Kunden, Benutzer, Backups und Einstellungen im geschützten Adminbereich verwaltet werden.

## Dokumentation

- [Installation auf Ubuntu 24.04](INSTALL_UBUNTU_24_04.md)
- [Changelog](CHANGELOG.md)

## Lokaler Start

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

Beim ersten Start wird ein Admin-Zugang angelegt. Das initiale Passwort steht in:

```text
data/initial-admin-password.txt
```

Nach der ersten Anmeldung sollte das Passwort in den Einstellungen geändert und die Datei gelöscht werden.

## Daten

Die Inventardaten liegen in SQLite:

```text
data/inventory.sqlite
```

Weitere Konfigurationen liegen unter:

```text
data/config.json
data/users.json
data/customers.json
```

## Linux als Dienst

Für Ubuntu 24.04 ist die vollständige Anleitung hier:

[Installation auf Ubuntu 24.04](INSTALL_UBUNTU_24_04.md)

Kurzform:

```sh
sudo apt update
sudo apt install -y git python3
git clone https://github.com/Hinaaak/inventory-app.git inventory-app
cd inventory-app
sh install-systemd.sh inventory-app
```

Danach:

```sh
systemctl status inventory-app
sudo systemctl restart inventory-app
sudo systemctl stop inventory-app
```

## Reverse-Proxy

Die App läuft intern auf Port `8123`. Für echte QR-Codes sollte sie per HTTPS über einen Reverse-Proxy erreichbar sein.

In der App unter `Einstellungen` muss die öffentliche Basisadresse eingetragen werden, z. B.:

```text
https://inventory.example.de/
```

## Backups

Backups können in der App erstellt und importiert werden. Das lokale Backup-Ziel kann unter `Einstellungen` gesetzt werden, z. B.:

```text
/var/backups/inventory-app
```

Der Dienstbenutzer muss dort Schreibrechte haben.

## Updates

Updates auf dem Server:

```sh
sh update.sh inventory-app
```

Oder über die App mit `Update aus GitHub`, wenn das Projekt auf dem Server ein Git-Checkout ist und `git pull --ff-only` ohne interaktive Eingabe funktioniert.

## Zugriffskonzept

- Die QR-Geräteseite ist ohne Login erreichbar.
- Inventarverwaltung, Kunden, Benutzer, Backups, Einstellungen und Updates brauchen den Login.
- Benutzer können Rollen wie Admin, Techniker oder Nur-Lesen erhalten.
