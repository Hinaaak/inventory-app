from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import base64
import hashlib
import hmac
import json
import secrets
import socket
import sqlite3
import subprocess
import threading
import time


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
ASSETS_FILE = DATA_DIR / "assets.json"
CONFIG_FILE = DATA_DIR / "config.json"
AUTH_FILE = DATA_DIR / "auth.json"
USERS_FILE = DATA_DIR / "users.json"
CUSTOMERS_FILE = DATA_DIR / "customers.json"
INITIAL_PASSWORD_FILE = DATA_DIR / "initial-admin-password.txt"
DB_FILE = DATA_DIR / "inventory.sqlite"
AUDIT_FILE = DATA_DIR / "audit.log"
PORT = 8123
SESSION_SECONDS = 12 * 60 * 60
LOGIN_WINDOW_SECONDS = 10 * 60
LOGIN_MAX_ATTEMPTS = 5
SAFE_STATIC_FILES = {
    "/",
    "/index.html",
    "/app.js",
    "/styles.css",
    "/vendor/qrcode.js",
}

DEFAULT_CONFIG = {
    "baseUrl": "",
    "backupEnabled": True,
    "backupIntervalHours": 24,
    "backupKeepLast": 14,
    "backupPath": "",
}

SESSIONS = {}
LOGIN_ATTEMPTS = {}


class InventoryHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        )
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/session":
            self.send_json({"authenticated": self.is_authenticated(), "user": self.current_user()})
            return

        if path.startswith("/api/public/assets/"):
            asset_id = path.rsplit("/", 1)[-1]
            asset = get_asset(asset_id)
            if not asset or asset.get("deletedAt"):
                self.send_error(404)
                return
            self.send_json(public_asset(asset))
            return

        if path == "/api/state":
            if not self.require_auth():
                return
            user = self.current_user()
            self.send_json(
                {
                    "assets": load_assets(),
                    "config": public_config(load_config(), user),
                    "users": load_users_public() if is_admin(user) else [],
                    "customers": load_customers(),
                    "user": user,
                }
            )
            return

        if path == "/api/users":
            if not self.require_role("admin"):
                return
            self.send_json(load_users_public())
            return

        if path == "/api/customers":
            if not self.require_auth():
                return
            self.send_json(load_customers())
            return

        if path == "/api/backups":
            if not self.require_role("admin"):
                return
            self.send_json(list_backups())
            return

        if path == "/api/backups/download":
            if not self.require_role("admin"):
                return
            self.download_backup(parsed.query)
            return

        if path.startswith("/api/"):
            self.send_error(404)
            return

        if not self.is_allowed_static_path(path):
            self.send_error(404)
            return

        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/login":
            payload = self.read_json_body()
            username = payload.get("username") if isinstance(payload, dict) else ""
            if login_is_limited(self.client_ip(), username):
                self.send_json({"ok": False, "message": "Zu viele Loginversuche. Bitte später erneut versuchen."}, status=429)
                return
            if not isinstance(payload, dict) or not verify_login(payload.get("username"), payload.get("password")):
                record_failed_login(self.client_ip(), username)
                self.send_json({"ok": False, "message": "Login fehlgeschlagen."}, status=401)
                return
            clear_failed_logins(self.client_ip(), username)
            token = create_session(payload.get("username"))
            self.send_json({"ok": True}, headers=[("Set-Cookie", session_cookie(token, self.is_secure_request()))])
            return

        if self.path == "/api/logout":
            token = self.session_token()
            if token:
                SESSIONS.pop(token, None)
            self.send_json({"ok": True}, headers=[("Set-Cookie", expired_session_cookie(self.is_secure_request()))])
            return

        if not self.require_auth():
            return

        if self.path == "/api/users":
            if not self.require_role("admin"):
                return
            payload = self.read_json_body()
            if not isinstance(payload, list):
                self.send_error(400, "Expected user list")
                return
            try:
                save_users_from_public(payload)
            except ValueError as exc:
                self.send_json({"ok": False, "message": str(exc)}, status=400)
                return
            self.send_json({"ok": True})
            return

        if self.path == "/api/customers":
            if not self.require_role("admin", "technician"):
                return
            payload = self.read_json_body()
            if not isinstance(payload, list):
                self.send_error(400, "Expected customer list")
                return
            save_customers(payload)
            self.send_json({"ok": True})
            return

        if self.path == "/api/assets":
            if not self.require_role("admin", "technician"):
                return
            payload = self.read_json_body()
            if not isinstance(payload, list):
                self.send_error(400, "Expected asset list")
                return
            save_assets(payload)
            self.send_json({"ok": True})
            return

        if self.path == "/api/config":
            if not self.require_role("admin"):
                return
            payload = self.read_json_body()
            if not isinstance(payload, dict):
                self.send_error(400, "Expected config object")
                return
            write_json(CONFIG_FILE, normalize_config(payload))
            self.send_json({"ok": True})
            return

        if self.path == "/api/password":
            payload = self.read_json_body()
            password = payload.get("password") if isinstance(payload, dict) else ""
            if not isinstance(password, str) or len(password) < 10:
                self.send_json({"ok": False, "message": "Passwort muss mindestens 10 Zeichen haben."}, status=400)
                return
            users = load_users()
            current = self.current_user() or {"username": "admin"}
            updated = []
            for user in users:
                if user.get("username") == current["username"]:
                    updated.append(make_auth_record(current["username"], password, user.get("role", "admin")))
                else:
                    updated.append(user)
            write_json(USERS_FILE, updated)
            if current["username"] == "admin":
                write_json(AUTH_FILE, make_auth_record("admin", password, "admin"))
            INITIAL_PASSWORD_FILE.unlink(missing_ok=True)
            self.send_json({"ok": True})
            return

        if self.path == "/api/backups/create":
            if not self.require_role("admin"):
                return
            backup = create_backup("manual")
            self.send_json({"ok": True, "backup": backup.name})
            return

        if self.path == "/api/backups/import":
            if not self.require_role("admin"):
                return
            payload = self.read_json_body()
            if not isinstance(payload, dict) or not isinstance(payload.get("assets"), list):
                self.send_error(400, "Expected backup object")
                return
            create_backup("before-import")
            save_assets(payload["assets"])
            write_json(CONFIG_FILE, normalize_config(payload.get("config", load_config())))
            self.send_json({"ok": True})
            return

        if self.path == "/api/update":
            if not self.require_role("admin"):
                return
            self.send_json(run_update(self.current_user()))
            return

        self.send_error(404)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        try:
            return json.loads(body.decode("utf-8"))
        except Exception:
            return None

    def send_json(self, payload, status=200, headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for key, value in headers or []:
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def require_auth(self):
        if self.is_authenticated():
            return True
        self.send_json({"ok": False, "message": "Nicht angemeldet."}, status=401)
        return False

    def require_role(self, *roles):
        if not self.require_auth():
            return False
        user = self.current_user()
        if user and user.get("role") in roles:
            return True
        self.send_json({"ok": False, "message": "Keine Berechtigung."}, status=403)
        return False

    def is_authenticated(self):
        token = self.session_token()
        if not token:
            return False
        session = SESSIONS.get(token)
        if not session:
            return False
        if session["expires"] < time.time():
            SESSIONS.pop(token, None)
            return False
        session["expires"] = time.time() + SESSION_SECONDS
        return True

    def current_user(self):
        token = self.session_token()
        session = SESSIONS.get(token) if token else None
        if not session:
            return None
        return {"username": session["username"], "role": session.get("role", "admin")}

    def session_token(self):
        header = self.headers.get("Cookie")
        if not header:
            return ""
        jar = cookies.SimpleCookie()
        jar.load(header)
        morsel = jar.get("inventar_session")
        return morsel.value if morsel else ""

    def client_ip(self):
        forwarded = self.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",", 1)[0].strip()
        return self.client_address[0] if self.client_address else ""

    def is_secure_request(self):
        proto = self.headers.get("X-Forwarded-Proto", "")
        return proto.lower() == "https"

    def is_allowed_static_path(self, path):
        return path in SAFE_STATIC_FILES

    def download_backup(self, query):
        params = parse_qs(query)
        name = params.get("file", [""])[0]
        backup_dir = get_backup_dir()
        path = (backup_dir / name).resolve()
        if not str(path).startswith(str(backup_dir.resolve())) or not path.exists():
            self.send_error(404)
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def ensure_data():
    DATA_DIR.mkdir(exist_ok=True)
    init_db()
    get_backup_dir().mkdir(parents=True, exist_ok=True)
    if not CONFIG_FILE.exists():
        config = dict(DEFAULT_CONFIG)
        config["baseUrl"] = f"http://{local_ip()}:{PORT}/"
        write_json(CONFIG_FILE, config)
    ensure_auth()
    ensure_customers()
    migrate_assets_json()
    migrate_asset_ids()


def init_db():
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS assets (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def migrate_assets_json():
    if not ASSETS_FILE.exists():
        return
    if load_assets():
        return
    payload = read_json(ASSETS_FILE, [])
    if isinstance(payload, list) and payload:
        save_assets(payload)


def migrate_asset_ids():
    assets = load_assets()
    if not assets:
        return
    changed = False
    for asset in assets:
        asset_id = str(asset.get("id") or "")
        if len(asset_id) < 24:
            asset["id"] = secrets.token_urlsafe(24)
            changed = True
    if changed:
        save_assets(assets)


def load_assets():
    with sqlite3.connect(DB_FILE) as conn:
        rows = conn.execute("SELECT payload FROM assets ORDER BY updated_at DESC").fetchall()
    assets = []
    for (payload,) in rows:
        try:
            assets.append(json.loads(payload))
        except Exception:
            continue
    return assets


def get_asset(asset_id):
    with sqlite3.connect(DB_FILE) as conn:
        row = conn.execute("SELECT payload FROM assets WHERE id = ?", (asset_id,)).fetchone()
    if not row:
        return None
    try:
        return json.loads(row[0])
    except Exception:
        return None


def save_assets(assets):
    now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    normalized = [asset for asset in (normalize_asset(asset) for asset in assets) if not is_expired_deleted(asset)]
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute("DELETE FROM assets")
        conn.executemany(
            "INSERT INTO assets (id, payload, updated_at) VALUES (?, ?, ?)",
            [(asset["id"], json.dumps(asset, ensure_ascii=False), now) for asset in normalized],
        )
        conn.commit()
    write_json(ASSETS_FILE, normalized)


def is_expired_deleted(asset):
    deleted_at = asset.get("deletedAt")
    if not deleted_at:
        return False
    try:
        deleted_ts = time.mktime(time.strptime(deleted_at[:19], "%Y-%m-%dT%H:%M:%S"))
        return time.time() - deleted_ts > 7 * 24 * 60 * 60
    except Exception:
        return False


def normalize_asset(asset):
    if not isinstance(asset, dict):
        asset = {}
    return {
        "id": normalize_asset_id(asset.get("id")),
        "name": asset.get("name") or "",
        "inventoryNumber": asset.get("inventoryNumber") or "",
        "category": asset.get("category") or "Notebook",
        "status": asset.get("status") or "Auf Lager",
        "serialNumber": asset.get("serialNumber") or "",
        "warrantyUntil": asset.get("warrantyUntil") or "",
        "location": asset.get("location") or "",
        "owner": asset.get("owner") or "",
        "purchaseDate": asset.get("purchaseDate") or "",
        "supportPhone": asset.get("supportPhone") or "",
        "supportEmail": asset.get("supportEmail") or "",
        "notes": asset.get("notes") or "",
        "lastScan": asset.get("lastScan") or "",
        "customerId": asset.get("customerId") or "",
        "deletedAt": asset.get("deletedAt") or "",
    }


def normalize_asset_id(value):
    value = str(value or "").strip()
    if len(value) >= 24:
        return value
    return secrets.token_urlsafe(24)


def public_asset(asset):
    return {
        "id": asset.get("id", ""),
        "name": asset.get("name", ""),
        "inventoryNumber": asset.get("inventoryNumber", ""),
        "serialNumber": asset.get("serialNumber", ""),
        "warrantyUntil": asset.get("warrantyUntil", ""),
        "location": asset.get("location", ""),
        "category": asset.get("category", ""),
        "status": asset.get("status", ""),
        "supportPhone": asset.get("supportPhone", ""),
        "supportEmail": asset.get("supportEmail", ""),
    }


def load_config():
    return normalize_config(read_json(CONFIG_FILE, DEFAULT_CONFIG))


def public_config(config, user=None):
    if is_admin(user):
        return config
    return {"baseUrl": config.get("baseUrl", "")}


def is_admin(user):
    return bool(user and user.get("role") == "admin")


def normalize_config(config):
    merged = dict(DEFAULT_CONFIG)
    if isinstance(config, dict):
        merged.update(config)
    merged["backupEnabled"] = bool(merged.get("backupEnabled"))
    merged["backupIntervalHours"] = max(1, int(merged.get("backupIntervalHours") or 24))
    merged["backupKeepLast"] = max(1, int(merged.get("backupKeepLast") or 14))
    merged["backupPath"] = str(merged.get("backupPath") or "")
    if not merged.get("baseUrl"):
        merged["baseUrl"] = f"http://{local_ip()}:{PORT}/"
    return merged


def get_backup_dir():
    config_path = ""
    if CONFIG_FILE.exists():
        try:
            config_path = str(read_json(CONFIG_FILE, {}).get("backupPath") or "")
        except Exception:
            config_path = ""
    if config_path:
        return Path(config_path).expanduser().resolve()
    return (DATA_DIR / "backups").resolve()


def read_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def ensure_auth():
    if USERS_FILE.exists():
        return
    legacy_auth = read_json(AUTH_FILE, {})
    if legacy_auth:
        legacy_auth.setdefault("role", "admin")
        write_json(USERS_FILE, [legacy_auth])
        return
    password = secrets.token_urlsafe(12)
    auth = make_auth_record("admin", password, "admin")
    write_json(AUTH_FILE, auth)
    write_json(USERS_FILE, [auth])
    INITIAL_PASSWORD_FILE.write_text(
        f"Benutzer: admin\nPasswort: {password}\n\nBitte nach dem ersten Login sicher ablegen und Datei löschen.\n",
        encoding="utf-8",
    )


def make_auth_record(username, password, role="technician"):
    salt = secrets.token_bytes(16)
    digest = hash_password(password, salt)
    return {
        "username": username,
        "role": role,
        "salt": base64.b64encode(salt).decode("ascii"),
        "passwordHash": base64.b64encode(digest).decode("ascii"),
    }


def hash_password(password, salt):
    return hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), salt, 200_000)


def verify_login(username, password):
    return find_verified_user(username, password) is not None


def find_verified_user(username, password):
    users = load_users()
    if not password:
        return None
    for user in users:
        if username != user.get("username"):
            continue
        try:
            salt = base64.b64decode(user["salt"])
            expected = base64.b64decode(user["passwordHash"])
        except Exception:
            return None
        if hmac.compare_digest(hash_password(password, salt), expected):
            return user
    return None


def load_users():
    users = read_json(USERS_FILE, [])
    if users:
        return users
    auth = read_json(AUTH_FILE, {})
    if auth:
        auth.setdefault("role", "admin")
        return [auth]
    return []


def load_users_public():
    return [{"username": user.get("username", ""), "role": user.get("role", "technician")} for user in load_users()]


def save_users_from_public(public_users):
    existing = {user.get("username"): user for user in load_users()}
    saved = []
    for item in public_users:
        username = str(item.get("username") or "").strip()
        if not username:
            continue
        role = str(item.get("role") or "technician").strip()
        password = str(item.get("password") or "")
        if password:
            saved.append(make_auth_record(username, password, role))
        elif username in existing:
            user = dict(existing[username])
            user["role"] = role
            saved.append(user)
    if not any(user.get("role") == "admin" for user in saved):
        raise ValueError("At least one admin required")
    write_json(USERS_FILE, saved)


def ensure_customers():
    if CUSTOMERS_FILE.exists():
        return
    write_json(CUSTOMERS_FILE, [{"id": "default", "name": "Standardkunde", "notes": ""}])


def load_customers():
    return read_json(CUSTOMERS_FILE, [{"id": "default", "name": "Standardkunde", "notes": ""}])


def save_customers(customers):
    normalized = []
    for customer in customers:
        name = str(customer.get("name") or "").strip()
        if not name:
            continue
        normalized.append({"id": customer.get("id") or secrets.token_hex(4), "name": name, "notes": customer.get("notes") or ""})
    write_json(CUSTOMERS_FILE, normalized or [{"id": "default", "name": "Standardkunde", "notes": ""}])


def verify_legacy_login(username, password):
    auth = read_json(AUTH_FILE, {})
    if username != auth.get("username") or not password:
        return False
    try:
        salt = base64.b64decode(auth["salt"])
        expected = base64.b64decode(auth["passwordHash"])
    except Exception:
        return False
    return hmac.compare_digest(hash_password(password, salt), expected)


def create_session(username):
    user = next((entry for entry in load_users() if entry.get("username") == username), {})
    token = secrets.token_urlsafe(32)
    SESSIONS[token] = {"username": username, "role": user.get("role", "admin"), "expires": time.time() + SESSION_SECONDS}
    return token


def session_cookie(token, secure=False):
    flags = f"inventar_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_SECONDS}"
    if secure:
        flags += "; Secure"
    return flags


def expired_session_cookie(secure=False):
    flags = "inventar_session=; Path=/; Max-Age=0; SameSite=Lax"
    if secure:
        flags += "; Secure"
    return flags


def login_key(ip, username):
    return f"{ip}:{str(username or '').strip().lower()}"


def current_login_attempts(ip, username):
    key = login_key(ip, username)
    cutoff = time.time() - LOGIN_WINDOW_SECONDS
    attempts = [stamp for stamp in LOGIN_ATTEMPTS.get(key, []) if stamp >= cutoff]
    LOGIN_ATTEMPTS[key] = attempts
    return attempts


def login_is_limited(ip, username):
    return len(current_login_attempts(ip, username)) >= LOGIN_MAX_ATTEMPTS


def record_failed_login(ip, username):
    attempts = current_login_attempts(ip, username)
    attempts.append(time.time())
    LOGIN_ATTEMPTS[login_key(ip, username)] = attempts


def clear_failed_logins(ip, username):
    LOGIN_ATTEMPTS.pop(login_key(ip, username), None)


def create_backup(reason):
    ensure_data()
    payload = {
        "version": 2,
        "reason": reason,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "assets": load_assets(),
        "config": load_config(),
    }
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup_dir = get_backup_dir()
    backup_dir.mkdir(parents=True, exist_ok=True)
    path = backup_dir / f"inventar-{reason}-{stamp}.json"
    write_json(path, payload)
    prune_backups(load_config()["backupKeepLast"])
    return path


def list_backups():
    ensure_data()
    backups = []
    for path in sorted(get_backup_dir().glob("*.json"), reverse=True):
        backups.append({"name": path.name, "size": max(1, round(path.stat().st_size / 1024))})
    return backups


def prune_backups(keep_last):
    backups = sorted(get_backup_dir().glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    for path in backups[keep_last:]:
        path.unlink(missing_ok=True)


def run_update(user=None):
    if not (ROOT / ".git").exists():
        result = {"ok": False, "message": "Dieses Verzeichnis ist kein Git-Checkout."}
        write_audit("update", user, result)
        return result
    try:
        result = subprocess.run(
            ["git", "pull", "--ff-only"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=120,
            check=False,
        )
    except FileNotFoundError:
        result = {"ok": False, "message": "Git ist auf diesem System nicht installiert."}
        write_audit("update", user, result)
        return result
    except subprocess.TimeoutExpired:
        result = {"ok": False, "message": "Update hat zu lange gedauert."}
        write_audit("update", user, result)
        return result

    payload = {
        "ok": result.returncode == 0,
        "message": (result.stdout + result.stderr).strip() or "Keine Ausgabe.",
    }
    write_audit("update", user, payload)
    return payload


def write_audit(action, user=None, payload=None):
    entry = {
        "time": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "action": action,
        "user": (user or {}).get("username", ""),
        "role": (user or {}).get("role", ""),
        "payload": payload or {},
    }
    AUDIT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with AUDIT_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def backup_worker():
    last_backup = 0
    while True:
        time.sleep(60)
        config = load_config()
        if not config["backupEnabled"]:
            continue
        interval = config["backupIntervalHours"] * 60 * 60
        if time.time() - last_backup >= interval:
            create_backup("auto")
            last_backup = time.time()


def local_ip():
    try:
        for result in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = result[4][0]
            if not ip.startswith("127."):
                return ip
    except Exception:
        pass
    return "127.0.0.1"


if __name__ == "__main__":
    ensure_data()
    ip = local_ip()

    threading.Thread(target=backup_worker, daemon=True).start()

    print("")
    print("Inventar QR läuft.")
    print(f"Auf diesem Server: http://localhost:{PORT}/")
    print(f"Im gleichen Netz: http://{ip}:{PORT}/")
    if INITIAL_PASSWORD_FILE.exists():
        print(f"Initiales Admin-Passwort: {INITIAL_PASSWORD_FILE}")
    print("")
    print("Ohne oeffentliche IP: nutze VPN, Tailscale oder Cloudflare Tunnel und trage diese Adresse als Basisadresse ein.")
    print("Fenster offen lassen. Zum Beenden Strg+C druecken.")
    print("")

    server = ThreadingHTTPServer(("0.0.0.0", PORT), InventoryHandler)
    server.serve_forever()
