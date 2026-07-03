const STORAGE_KEY = "inventory-qr-assets-v2";
const CONFIG_KEY = "inventory-qr-config-v1";

const sampleAssets = [
  {
    id: "a1f4d2",
    name: "ThinkPad T14",
    inventoryNumber: "INV-0001",
    category: "Notebook",
    status: "Ausgegeben",
    serialNumber: "PF4ABC12",
    warrantyUntil: "2028-03-12",
    deviceId: "KDG-4711",
    location: "Buero 2.14",
    owner: "Max Mustermann",
    purchaseDate: "2025-03-12",
    supportPhone: "+49 123 456789",
    supportEmail: "support@firma.de",
    publicInfo: "Bitte halten Sie diese Geraete-ID bei Rueckfragen bereit.",
    notes: "Dockingstation und Netzteil vorhanden.",
    lastScan: "",
  },
  {
    id: "b7e921",
    name: "HP LaserJet Pro",
    inventoryNumber: "INV-0002",
    category: "Drucker",
    status: "In Betrieb",
    serialNumber: "CNB9K44210",
    warrantyUntil: "2027-09-04",
    deviceId: "KDG-4712",
    location: "Flur Verwaltung",
    owner: "Office",
    purchaseDate: "2024-09-04",
    supportPhone: "+49 123 456789",
    supportEmail: "support@firma.de",
    publicInfo: "Bei Papierstau oder Tonerwechsel bitte die ID durchgeben.",
    notes: "Toner: 59A.",
    lastScan: "",
  },
];

const defaultConfig = {
  baseUrl: "",
  backupEnabled: true,
  backupIntervalHours: 24,
  backupKeepLast: 14,
  backupPath: "",
};

let assets = [];
let config = { ...defaultConfig };
let selectedId = null;
let serverMode = location.protocol === "http:" || location.protocol === "https:";
let authenticated = false;

const fields = {
  name: document.querySelector("#nameField"),
  inventoryNumber: document.querySelector("#inventoryField"),
  category: document.querySelector("#categoryField"),
  status: document.querySelector("#statusField"),
  serialNumber: document.querySelector("#serialField"),
  warrantyUntil: document.querySelector("#warrantyUntilField"),
  deviceId: document.querySelector("#deviceIdField"),
  location: document.querySelector("#locationField"),
  owner: document.querySelector("#ownerField"),
  purchaseDate: document.querySelector("#purchaseDateField"),
  supportPhone: document.querySelector("#supportPhoneField"),
  supportEmail: document.querySelector("#supportEmailField"),
  publicInfo: document.querySelector("#publicInfoField"),
  notes: document.querySelector("#notesField"),
};

const assetList = document.querySelector("#assetList");
const assetForm = document.querySelector("#assetForm");
const qrPreviewField = document.querySelector("#qrPreviewField");
const qrCanvas = document.querySelector("#qrCanvas");
const mobileView = document.querySelector("#mobileView");
const appView = document.querySelector("#appView");
const loginView = document.querySelector("#loginView");
const labelSheet = document.querySelector("#labelSheet");
const qrWarning = document.querySelector("#qrWarning");
const serverNotice = document.querySelector("#serverNotice");
const baseUrlField = document.querySelector("#baseUrlField");
const backupEnabledField = document.querySelector("#backupEnabledField");
const backupIntervalField = document.querySelector("#backupIntervalField");
const backupKeepField = document.querySelector("#backupKeepField");
const backupPathField = document.querySelector("#backupPathField");
const backupList = document.querySelector("#backupList");
const updateStatus = document.querySelector("#updateStatus");
const logoutBtn = document.querySelector("#logoutBtn");
const loginForm = document.querySelector("#loginForm");
const usernameField = document.querySelector("#usernameField");
const passwordField = document.querySelector("#passwordField");
const loginError = document.querySelector("#loginError");
const newPasswordField = document.querySelector("#newPasswordField");

document.querySelector("#newAssetBtn").addEventListener("click", createAsset);
document.querySelector("#deleteBtn").addEventListener("click", deleteSelectedAsset);
document.querySelector("#searchInput").addEventListener("input", renderList);
document.querySelector("#exportBtn").addEventListener("click", exportBackup);
document.querySelector("#importInput").addEventListener("change", importBackup);
document.querySelector("#printLabelsBtn").addEventListener("click", printLabels);
document.querySelector("#copyLinkBtn").addEventListener("click", copyCurrentQrText);
document.querySelector("#saveSettingsBtn").addEventListener("click", saveSettings);
document.querySelector("#createBackupBtn").addEventListener("click", createBackupNow);
document.querySelector("#updateBtn").addEventListener("click", runUpdate);
document.querySelector("#changePasswordBtn").addEventListener("click", changePassword);
logoutBtn.addEventListener("click", logout);

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await login();
});

assetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const asset = getSelectedAsset();
  if (!asset) return;
  Object.entries(fields).forEach(([key, field]) => {
    asset[key] = field.value.trim();
  });
  saveAssets();
  render();
});

window.addEventListener("hashchange", route);
initialize();

async function initialize() {
  route();
}

async function loadState() {
  if (serverMode) {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (response.status === 401) {
        authenticated = false;
        return false;
      }
      if (response.ok) {
        const state = await response.json();
        assets = normalizeAssets(state.assets?.length ? state.assets : sampleAssets);
        config = normalizeConfig(state.config);
        selectedId = assets[0]?.id || null;
        authenticated = true;
        return true;
      }
    } catch {
      // Fall back to browser storage below.
    }
  }

  assets = normalizeAssets(readJson(STORAGE_KEY, sampleAssets));
  config = normalizeConfig(readJson(CONFIG_KEY, defaultConfig));
  selectedId = assets[0]?.id || null;
  authenticated = !serverMode;
  return true;
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeConfig(value) {
  const normalized = { ...defaultConfig, ...(value || {}) };
  if (!normalized.baseUrl) normalized.baseUrl = defaultBaseUrl();
  normalized.backupIntervalHours = Math.max(1, Number(normalized.backupIntervalHours) || 24);
  normalized.backupKeepLast = Math.max(1, Number(normalized.backupKeepLast) || 14);
  normalized.backupEnabled = Boolean(normalized.backupEnabled);
  normalized.backupPath = String(normalized.backupPath || "").trim();
  return normalized;
}

function normalizeAssets(entries) {
  return entries.map((asset) => ({
    id: asset.id || newId(),
    name: "",
    inventoryNumber: "",
    category: "Notebook",
    status: "Auf Lager",
    serialNumber: "",
    warrantyUntil: "",
    deviceId: asset.deviceId || asset.osAtDelivery || "",
    location: "",
    owner: "",
    purchaseDate: "",
    supportPhone: "",
    supportEmail: "",
    publicInfo: "",
    notes: "",
    lastScan: "",
    ...asset,
  }));
}

async function saveAssets() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  if (!serverMode) return;
  await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(assets),
  });
}

async function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  if (!serverMode) return;
  await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

async function route() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const mobileId = params.get("asset");
  if (mobileId) {
    await renderMobile(mobileId);
    return;
  }
  const loaded = await loadState();
  if (!loaded) {
    showLogin();
    return;
  }
  appView.hidden = false;
  mobileView.hidden = true;
  loginView.hidden = true;
  logoutBtn.hidden = !authenticated;
  render();
}

function showLogin() {
  appView.hidden = true;
  mobileView.hidden = true;
  loginView.hidden = false;
  logoutBtn.hidden = true;
  serverNotice.textContent = "Bitte anmelden, um Inventar und Einstellungen zu verwalten.";
  serverNotice.className = "notice warn";
  passwordField.focus();
}

async function login() {
  loginError.textContent = "";
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: usernameField.value.trim(), password: passwordField.value }),
  });
  if (!response.ok) {
    loginError.textContent = "Login fehlgeschlagen.";
    return;
  }
  passwordField.value = "";
  authenticated = true;
  await route();
}

async function logout() {
  if (serverMode) await fetch("/api/logout", { method: "POST" });
  authenticated = false;
  showLogin();
}

function render() {
  renderNotice();
  renderStats();
  renderList();
  renderForm();
  renderSettings();
  renderQr();
  loadBackupList();
}

function renderNotice() {
  serverNotice.textContent = serverMode
    ? `Serverbetrieb aktiv. QR-Basis: ${publicBaseUrl()}`
    : "Dateimodus aktiv. Fuer echte Handy-Scans bitte ueber den Server oeffnen.";
  serverNotice.className = serverMode ? "notice ok" : "notice warn";
}

function renderStats() {
  document.querySelector("#assetCount").textContent = assets.length;
  document.querySelector("#openCount").textContent = assets.filter((asset) => asset.status !== "Ausgemustert").length;
  document.querySelector("#serviceCount").textContent = assets.filter((asset) => asset.status === "Service").length;
}

function renderList() {
  const query = document.querySelector("#searchInput").value.trim().toLowerCase();
  const visibleAssets = assets.filter((asset) => Object.values(asset).join(" ").toLowerCase().includes(query));

  assetList.innerHTML = "";
  if (!visibleAssets.length) {
    assetList.innerHTML = '<p class="empty">Keine Geraete gefunden.</p>';
    return;
  }

  visibleAssets.forEach((asset) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `asset-item ${asset.id === selectedId ? "active" : ""}`;
    item.innerHTML = `
      <strong>${escapeHtml(asset.name || "Ohne Bezeichnung")}</strong>
      <span class="asset-meta">${escapeHtml(asset.inventoryNumber || "-")} - ${escapeHtml(asset.location || "Kein Standort")}</span>
      <span class="status ${statusClass(asset.status)}">${escapeHtml(asset.status || "Unbekannt")}</span>
    `;
    item.addEventListener("click", () => {
      selectedId = asset.id;
      render();
    });
    assetList.appendChild(item);
  });
}

function renderForm() {
  const asset = getSelectedAsset();
  const hasAsset = Boolean(asset);
  assetForm.querySelectorAll("input, select, textarea, button").forEach((control) => {
    if (control.id !== "qrPreviewField") control.disabled = !hasAsset;
  });

  document.querySelector("#formTitle").textContent = asset?.name || "Neuer Eintrag";
  Object.entries(fields).forEach(([key, field]) => {
    field.value = asset?.[key] || "";
  });
}

function renderSettings() {
  baseUrlField.value = config.baseUrl || defaultBaseUrl();
  backupEnabledField.checked = config.backupEnabled;
  backupIntervalField.value = config.backupIntervalHours;
  backupKeepField.value = config.backupKeepLast;
  backupPathField.value = config.backupPath;
}

function renderQr() {
  const asset = getSelectedAsset();
  const ctx = qrCanvas.getContext("2d");
  ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
  if (!asset) {
    qrPreviewField.value = "";
    qrWarning.textContent = "";
    return;
  }

  const payload = assetUrl(asset.id);
  qrPreviewField.value = payload;
  qrWarning.textContent = serverMode ? "" : "Dieser Link funktioniert auf Handys erst, wenn die App ueber den Server erreichbar ist.";
  drawQr(qrCanvas, payload, 8);
}

async function renderMobile(id) {
  let asset = assets.find((entry) => entry.id === id);
  if (serverMode) {
    try {
      const response = await fetch(`/api/public/assets/${encodeURIComponent(id)}`, { cache: "no-store" });
      asset = response.ok ? await response.json() : null;
    } catch {
      asset = null;
    }
  }
  appView.hidden = true;
  loginView.hidden = true;
  logoutBtn.hidden = true;
  mobileView.hidden = false;

  if (!asset) {
    mobileView.innerHTML = `
      <article class="mobile-card">
        <p class="kicker">Inventar</p>
        <h1>Geraet nicht gefunden</h1>
        <p>Der QR-Code verweist auf keinen gespeicherten Eintrag.</p>
      </article>
    `;
    return;
  }

  mobileView.innerHTML = `
    <article class="mobile-card">
      <p class="kicker">Geraeteinformation</p>
      <h1>${escapeHtml(asset.name || "Ohne Bezeichnung")}</h1>
      <p class="asset-number">${escapeHtml(asset.inventoryNumber || "Keine Inventarnummer")}</p>
      <span class="status ${statusClass(asset.status)}">${escapeHtml(asset.status || "Unbekannt")}</span>
      <p class="public-note">${escapeHtml(asset.publicInfo || defaultPublicInfo(asset))}</p>
      <div class="mobile-actions">
        ${contactLink("tel", asset.supportPhone, "Anrufen")}
        ${contactLink("mailto", asset.supportEmail, "E-Mail")}
        <button type="button" id="confirmScanBtn" class="primary">Scan bestaetigen</button>
      </div>
      <div class="info-grid">
        ${infoRow("Geraetename", asset.name)}
        ${infoRow("Seriennummer", asset.serialNumber)}
        ${infoRow("Garantie bis", formatDate(asset.warrantyUntil))}
        ${infoRow("ID", asset.deviceId || asset.inventoryNumber)}
        ${infoRow("Standort", asset.location)}
        ${infoRow("Kategorie", asset.category)}
        ${infoRow("Support", supportText(asset))}
        ${infoRow("Letzter Scan", formatDateTime(asset.lastScan))}
      </div>
    </article>
  `;

  document.querySelector("#confirmScanBtn").addEventListener("click", async () => {
    if (!authenticated) {
      alert("Scan wurde lokal angezeigt. Eine Erfassung ist nur nach Anmeldung moeglich.");
      return;
    }
    const internalAsset = assets.find((entry) => entry.id === asset.id);
    if (!internalAsset) return;
    internalAsset.lastScan = new Date().toISOString();
    await saveAssets();
    await renderMobile(asset.id);
  });
}

function createAsset() {
  const nextNumber = String(assets.length + 1).padStart(4, "0");
  const asset = normalizeAssets([
    {
      id: newId(),
      name: "Neues Geraet",
      inventoryNumber: `INV-${nextNumber}`,
      deviceId: `ID-${nextNumber}`,
    },
  ])[0];
  assets.unshift(asset);
  selectedId = asset.id;
  saveAssets();
  render();
  fields.name.focus();
  fields.name.select();
}

function deleteSelectedAsset() {
  const asset = getSelectedAsset();
  if (!asset) return;
  if (!confirm(`"${asset.name}" wirklich loeschen?`)) return;
  assets = assets.filter((entry) => entry.id !== asset.id);
  selectedId = assets[0]?.id || null;
  saveAssets();
  render();
}

function printLabels() {
  labelSheet.innerHTML = "";
  assets.forEach((asset) => {
    const label = document.createElement("article");
    label.className = "print-label";
    const canvas = document.createElement("canvas");
    const text = document.createElement("div");
    text.innerHTML = `
      <strong>${escapeHtml(asset.name || "Ohne Bezeichnung")}</strong>
      <span>${escapeHtml(asset.inventoryNumber || "-")}</span>
      <span>${escapeHtml(asset.deviceId || "")}</span>
    `;
    label.append(canvas, text);
    labelSheet.appendChild(label);
    drawQr(canvas, assetUrl(asset.id), 6);
  });
  window.print();
}

function exportBackup() {
  downloadBackup({
    version: 1,
    exportedAt: new Date().toISOString(),
    assets,
    config,
  });
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const payload = JSON.parse(reader.result);
      if (!Array.isArray(payload.assets)) throw new Error("Ungueltiges Backup");
      assets = normalizeAssets(payload.assets);
      config = normalizeConfig(payload.config || config);
      selectedId = assets[0]?.id || null;
      await saveAssets();
      await saveConfig();
      if (serverMode) {
        await fetch("/api/backups/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assets, config }),
        });
      }
      render();
    } catch {
      alert("Die Backup-Datei konnte nicht importiert werden.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

async function copyCurrentQrText() {
  const asset = getSelectedAsset();
  if (!asset) return;
  await navigator.clipboard.writeText(assetUrl(asset.id));
}

async function saveSettings() {
  config = normalizeConfig({
    baseUrl: baseUrlField.value.trim(),
    backupEnabled: backupEnabledField.checked,
    backupIntervalHours: backupIntervalField.value,
    backupKeepLast: backupKeepField.value,
    backupPath: backupPathField.value.trim(),
  });
  await saveConfig();
  render();
}

async function runUpdate() {
  if (!serverMode) {
    updateStatus.textContent = "Updates funktionieren nur im Serverbetrieb.";
    return;
  }
  updateStatus.textContent = "Update laeuft...";
  try {
    const response = await fetch("/api/update", { method: "POST" });
    const result = await response.json();
    updateStatus.textContent = result.ok ? `Update abgeschlossen: ${result.message}` : `Update fehlgeschlagen: ${result.message}`;
  } catch {
    updateStatus.textContent = "Update konnte nicht gestartet werden.";
  }
}

async function changePassword() {
  const password = newPasswordField.value;
  if (password.length < 10) {
    updateStatus.textContent = "Das neue Passwort muss mindestens 10 Zeichen haben.";
    return;
  }
  const response = await fetch("/api/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    updateStatus.textContent = "Passwort konnte nicht geaendert werden.";
    return;
  }
  newPasswordField.value = "";
  updateStatus.textContent = "Passwort geaendert.";
}

async function createBackupNow() {
  if (!serverMode) {
    exportBackup();
    return;
  }
  const response = await fetch("/api/backups/create", { method: "POST" });
  if (!response.ok) {
    alert("Backup konnte nicht erstellt werden.");
    return;
  }
  await loadBackupList();
}

async function loadBackupList() {
  if (!serverMode) {
    backupList.innerHTML = '<p class="empty">Backups werden im Dateimodus als Download erstellt.</p>';
    return;
  }
  try {
    const response = await fetch("/api/backups", { cache: "no-store" });
    const backups = await response.json();
    backupList.innerHTML = backups.length
      ? backups
          .map(
            (backup) =>
              `<a class="backup-item" href="/api/backups/download?file=${encodeURIComponent(backup.name)}">${escapeHtml(
                backup.name
              )}<span>${escapeHtml(backup.size)} KB</span></a>`
          )
          .join("")
      : '<p class="empty">Noch keine Backups vorhanden.</p>';
  } catch {
    backupList.innerHTML = '<p class="empty">Backupliste nicht erreichbar.</p>';
  }
}

function downloadBackup(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `inventar-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function getSelectedAsset() {
  return assets.find((asset) => asset.id === selectedId) || null;
}

function assetUrl(id) {
  return `${publicBaseUrl()}#asset=${encodeURIComponent(id)}`;
}

function publicBaseUrl() {
  return (config.baseUrl || defaultBaseUrl()).replace(/#.*$/, "").replace(/\/$/, "/");
}

function defaultBaseUrl() {
  return location.href.replace(/#.*$/, "");
}

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function statusClass(status) {
  if (status === "Service") return "service";
  if (status === "Ausgemustert") return "retired";
  return "ok";
}

function infoRow(label, value) {
  return `
    <div class="info-row">
      <span>${escapeHtml(label)}</span>
      <span>${escapeHtml(value || "-")}</span>
    </div>
  `;
}

function contactLink(type, value, label) {
  if (!value) return "";
  const href = type === "mailto" ? `mailto:${value}` : `tel:${value.replaceAll(" ", "")}`;
  return `<a class="secondary action-link" href="${href}">${escapeHtml(label)}</a>`;
}

function supportText(asset) {
  return [asset.supportPhone, asset.supportEmail].filter(Boolean).join(" - ");
}

function defaultPublicInfo(asset) {
  return `Bitte nennen Sie bei Rueckfragen die ID ${asset.deviceId || asset.inventoryNumber || ""}.`.trim();
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE").format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  if (!value) return "Noch nicht erfasst";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function drawQr(canvas, text, scale) {
  if (typeof qrcode !== "function") throw new Error("QR-Code-Bibliothek wurde nicht geladen.");
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const moduleCount = qr.getModuleCount();
  const quiet = 4;
  const size = moduleCount + quiet * 2;
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  for (let y = 0; y < moduleCount; y++) {
    for (let x = 0; x < moduleCount; x++) {
      if (qr.isDark(y, x)) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    }
  }
}
