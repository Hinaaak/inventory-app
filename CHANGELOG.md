# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

## Unreleased

### Geändert

- Mobilansicht für QR-Codes auf reine Geräteinformationen reduziert.
- Kopfzeile mit Drucken, Export und Import in der Mobilansicht ausgeblendet.
- README überarbeitet und Installationsanleitung für Ubuntu 24.04 ergänzt.
- Security-Härtung begonnen: interne Dateien vor Webzugriff geschützt, Security-Header ergänzt, Rollen serverseitig geprüft, Login-Rate-Limit eingebaut und QR-IDs auf lange Tokens umgestellt.
- Update-Funktion auf Admins beschränkt und Update-Ergebnisse in `data/audit.log` protokolliert.

## 2026-07-03

### Hinzugefügt

- Benutzerverwaltung mit Rollen für Admin, Techniker und Nur-Lesen.
- Kundenverwaltung mit Kundenwechsel für Geräte.
- Papierkorb für gelöschte Geräte mit Wiederherstellen und endgültigem Löschen.
- Einstellungen für öffentliche Basisadresse, Backups, Passwortänderung und GitHub-Update.
- Systemd-Installationsskripte für Linux-Server.
- Lokale Backup-Erstellung und Backup-Import.

### Geändert

- Kunden, Benutzer, Papierkorb und Einstellungen in eigene Menübereiche getrennt.
- Kunden- und Benutzerbearbeitung als Detailansicht umgesetzt.
- Gerätebereich in der Seitenleiste nur noch im Menüpunkt Geräte sichtbar.
- QR-Druck auf das aktuell ausgewählte Gerät beschränkt.
- Öffentliche QR-Seite auf die wichtigsten Geräteinformationen reduziert.
- Oberfläche auf echte Umlaute umgestellt.

### Entfernt

- Geräte-ID aus Formular, QR-Ansicht, Drucklabel und öffentlicher Serverantwort entfernt.
- Öffentlicher Hinweistext auf der QR-Seite durch interne Notizen im Adminbereich ersetzt.
- Hinweis auf VPN, Tailscale oder Tunnel aus dem QR-Bereich entfernt.
- Button zum Bestätigen eines Scans entfernt.

### Behoben

- Login-Ansicht verdeckt die App nicht mehr fehlerhaft.
- App bleibt nach erfolgreicher Anmeldung nicht mehr hinter der Login-Maske sichtbar.
