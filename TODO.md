# Todo

## Security vor Produktivbetrieb

- [x] Zugriff auf interne Verzeichnisse blockieren: `data/`, `.git/`, `.local-ssh/`, Backups und ähnliche Dateien dürfen nie per Browser abrufbar sein.
- [x] Session-Cookie im HTTPS-Betrieb mit `Secure` setzen.
- [x] Serverseitige Rollenprüfung einbauen: Admin, Techniker und Nur-Lesen dürfen nicht nur in der Oberfläche unterschieden werden.
- [x] Login-Rate-Limit ergänzen, damit Passwortversuche gebremst werden.
- [x] Öffentliche QR-Links auf lange, nicht erratbare Tokens umstellen.
- [x] Security-Header ergänzen, z. B. `X-Content-Type-Options`, `Referrer-Policy` und eine passende `Content-Security-Policy`.
- [ ] Backup-Ziel außerhalb des Webroots erzwingen oder zumindest warnen, wenn es innerhalb des App-Ordners liegt.
- [x] Update-Funktion nur für Admins erlauben und Ergebnis sauber protokollieren.
- [ ] Dienst auf Linux immer mit eingeschränktem Benutzer betreiben, nicht als `root`.
- [ ] Rechte auf `data/` und Backup-Verzeichnis dokumentieren und beim Installationsskript prüfen.

## Später prüfen

- [ ] Audit-Log für wichtige Aktionen: Login, Geräteänderung, Benutzeränderung, Backup, Restore, Update.
- [ ] Optional 2-Faktor-Login für Admins.
- [ ] Export/Import mit zusätzlicher Bestätigung und Rollenprüfung absichern.
- [ ] Öffentliche QR-Seite optional pro Kunde oder Gerät deaktivierbar machen.
