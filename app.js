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
    location: "Büro 2.14",
    owner: "Max Mustermann",
    purchaseDate: "2025-03-12",
    supportPhone: "+49 123 456789",
    supportEmail: "support@firma.de",
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
    location: "Flur Verwaltung",
    owner: "Office",
    purchaseDate: "2024-09-04",
    supportPhone: "+49 123 456789",
    supportEmail: "support@firma.de",
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
let users = [];
let customers = [];
let config = { ...defaultConfig };
let selectedId = null;
let selectedCustomerId = "all";
let selectedCustomerAdminId = null;
let editingCustomerAdminId = null;
let selectedUserAdminName = null;
let editingUserAdminName = null;
let currentView = "assets";
let currentUser = null;
let serverMode = location.protocol === "http:" || location.protocol === "https:";
let authenticated = false;

const fields = {
  name: document.querySelector("#nameField"),
  inventoryNumber: document.querySelector("#inventoryField"),
  customerId: document.querySelector("#assetCustomerField"),
  category: document.querySelector("#categoryField"),
  status: document.querySelector("#statusField"),
  serialNumber: document.querySelector("#serialField"),
  warrantyUntil: document.querySelector("#warrantyUntilField"),
  location: document.querySelector("#locationField"),
  owner: document.querySelector("#ownerField"),
  purchaseDate: document.querySelector("#purchaseDateField"),
  supportPhone: document.querySelector("#supportPhoneField"),
  supportEmail: document.querySelector("#supportEmailField"),
  notes: document.querySelector("#notesField"),
};

const assetList = document.querySelector("#assetList");
const deviceSidebarTools = document.querySelector("#deviceSidebarTools");
const topbar = document.querySelector(".topbar");
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
const customerSwitchField = document.querySelector("#customerSwitchField");
const customerAdminList = document.querySelector("#customerAdminList");
const userAdminList = document.querySelector("#userAdminList");
const trashList = document.querySelector("#trashList");
const sectionMap = {
  assets: document.querySelector("#assetsView"),
  customers: document.querySelector("#customersView"),
  users: document.querySelector("#usersView"),
  trash: document.querySelector("#trashView"),
  settings: document.querySelector("#settingsView"),
};

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
document.querySelector("#addCustomerBtn").addEventListener("click", addCustomer);
document.querySelector("#addUserBtn").addEventListener("click", addUser);
customerSwitchField.addEventListener("change", () => {
  selectedCustomerId = customerSwitchField.value;
  selectedId = visibleAssets()[0]?.id || null;
  render();
});
document.querySelectorAll(".menu-item").forEach((button) => {
  button.addEventListener("click", () => {
    currentView = button.dataset.view;
    render();
  });
});

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
        users = state.users || [];
        customers = normalizeCustomers(state.customers || []);
        config = normalizeConfig(state.config);
        currentUser = state.user || null;
        selectedCustomerId = selectedCustomerId === "all" ? "all" : selectedCustomerId;
        selectedId = visibleAssets()[0]?.id || null;
        authenticated = true;
        return true;
      }
    } catch {
      // Fall back to browser storage below.
    }
  }

  assets = normalizeAssets(readJson(STORAGE_KEY, sampleAssets));
  users = [{ username: "admin", role: "admin" }];
  customers = normalizeCustomers([{ id: "default", name: "Standardkunde", notes: "" }]);
  config = normalizeConfig(readJson(CONFIG_KEY, defaultConfig));
  currentUser = { username: "local", role: "admin" };
  selectedId = visibleAssets()[0]?.id || null;
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
  return entries.map((entry) => {
    const { deviceId, osAtDelivery, publicInfo, ...asset } = entry || {};
    return {
      id: normalizeAssetId(asset.id),
      name: "",
      inventoryNumber: "",
      category: "Notebook",
      status: "Auf Lager",
      serialNumber: "",
      warrantyUntil: "",
      location: "",
      owner: "",
      purchaseDate: "",
      supportPhone: "",
      supportEmail: "",
      notes: "",
      lastScan: "",
      customerId: asset.customerId || "default",
      deletedAt: asset.deletedAt || "",
      ...asset,
    };
  });
}

function normalizeCustomers(entries) {
  return (entries.length ? entries : [{ id: "default", name: "Standardkunde", notes: "" }]).map((customer) => ({
    id: customer.id || newId(),
    name: customer.name || "Kunde",
    notes: customer.notes || "",
  }));
}

async function saveAssets() {
  if (!canEditAssets()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  if (!serverMode) return;
  await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(assets),
  });
}

async function saveCustomers() {
  if (!canEditAssets()) return;
  if (!serverMode) return;
  await fetch("/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(customers),
  });
}

async function saveUsers() {
  if (!isAdmin()) return;
  if (!serverMode) return;
  await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(users),
  });
}

async function saveConfig() {
  if (!isAdmin()) return;
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
  topbar.hidden = false;
  appView.hidden = false;
  mobileView.hidden = true;
  loginView.hidden = true;
  logoutBtn.hidden = !authenticated;
  render();
}

function showLogin() {
  topbar.hidden = false;
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
  currentUser = null;
  showLogin();
}

function render() {
  renderNotice();
  renderNavigation();
  renderCustomers();
  renderStats();
  renderList();
  renderForm();
  renderSettings();
  renderQr();
  renderAdminLists();
  loadBackupList();
}

function renderNavigation() {
  if (!viewAllowed(currentView)) currentView = "assets";
  Object.entries(sectionMap).forEach(([key, section]) => {
    section.hidden = key !== currentView;
  });
  deviceSidebarTools.hidden = currentView !== "assets";
  document.querySelectorAll(".menu-item").forEach((button) => {
    const allowed = viewAllowed(button.dataset.view);
    button.hidden = !allowed;
    button.classList.toggle("active", allowed && button.dataset.view === currentView);
  });
  document.querySelector("#exportBtn").hidden = !canEditAssets();
  document.querySelector(".import-button").hidden = !canEditAssets();
  document.querySelector("#printLabelsBtn").hidden = !authenticated;
}

function renderNotice() {
  serverNotice.textContent = serverMode
    ? `Serverbetrieb aktiv. QR-Basis: ${publicBaseUrl()}`
    : "Dateimodus aktiv. Für echte Handy-Scans bitte über den Server öffnen.";
  serverNotice.className = serverMode ? "notice ok" : "notice warn";
}

function renderStats() {
  const activeAssets = visibleAssets();
  document.querySelector("#assetCount").textContent = activeAssets.length;
  document.querySelector("#openCount").textContent = activeAssets.filter((asset) => asset.status !== "Ausgemustert").length;
  document.querySelector("#serviceCount").textContent = activeAssets.filter((asset) => asset.status === "Service").length;
}

function renderList() {
  const query = document.querySelector("#searchInput").value.trim().toLowerCase();
  const listAssets = visibleAssets().filter((asset) => Object.values(asset).join(" ").toLowerCase().includes(query));

  assetList.innerHTML = "";
  if (!listAssets.length) {
    assetList.innerHTML = '<p class="empty">Keine Geräte gefunden.</p>';
    return;
  }

  listAssets.forEach((asset) => {
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

function visibleAssets() {
  return assets.filter((asset) => !asset.deletedAt && (selectedCustomerId === "all" || asset.customerId === selectedCustomerId));
}

function deletedAssets() {
  return assets.filter((asset) => Boolean(asset.deletedAt));
}

function renderCustomers() {
  const options = ['<option value="all">Alle Kunden</option>']
    .concat(customers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`))
    .join("");
  customerSwitchField.innerHTML = options;
  customerSwitchField.value = selectedCustomerId;
  fields.customerId.innerHTML = customers
    .map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`)
    .join("");
}

function renderForm() {
  const asset = getSelectedAsset();
  const hasAsset = Boolean(asset);
  const editable = hasAsset && canEditAssets();
  assetForm.querySelectorAll("input, select, textarea, button").forEach((control) => {
    if (control.id !== "qrPreviewField" && control.id !== "copyLinkBtn") control.disabled = !editable;
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
  qrWarning.textContent = serverMode ? "" : "Dieser Link funktioniert auf Handys erst, wenn die App über den Server erreichbar ist.";
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
  topbar.hidden = true;
  appView.hidden = true;
  loginView.hidden = true;
  logoutBtn.hidden = true;
  mobileView.hidden = false;

  if (!asset) {
    mobileView.innerHTML = `
      <article class="mobile-card">
        <h1>Gerät nicht gefunden</h1>
        <p>Der QR-Code verweist auf keinen gespeicherten Eintrag.</p>
      </article>
    `;
    return;
  }

  mobileView.innerHTML = `
    <article class="mobile-card">
      <h1>${escapeHtml(asset.name || "Ohne Bezeichnung")}</h1>
      <p class="asset-number">${escapeHtml(asset.inventoryNumber || "Keine Inventarnummer")}</p>
      <span class="status ${statusClass(asset.status)}">${escapeHtml(asset.status || "Unbekannt")}</span>
      <div class="mobile-actions">
        ${contactLink("tel", asset.supportPhone, "Anrufen")}
        ${contactLink("mailto", asset.supportEmail, "E-Mail")}
      </div>
      <div class="info-grid">
        ${infoRow("Gerätename", asset.name)}
        ${infoRow("Seriennummer", asset.serialNumber)}
        ${infoRow("Garantie bis", formatDate(asset.warrantyUntil))}
        ${infoRow("Standort", asset.location)}
        ${infoRow("Kategorie", asset.category)}
        ${infoRow("Support", supportText(asset))}
        ${infoRow("Letzter Scan", formatDateTime(asset.lastScan))}
      </div>
    </article>
  `;

}

function createAsset() {
  if (!canEditAssets()) return;
  const nextNumber = String(assets.length + 1).padStart(4, "0");
  const asset = normalizeAssets([
    {
      id: newId(),
      name: "Neues Gerät",
      inventoryNumber: `INV-${nextNumber}`,
      customerId: selectedCustomerId === "all" ? customers[0]?.id || "default" : selectedCustomerId,
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
  if (!canEditAssets()) return;
  const asset = getSelectedAsset();
  if (!asset) return;
  if (!confirm(`"${asset.name}" in den Papierkorb verschieben?`)) return;
  asset.deletedAt = new Date().toISOString();
  selectedId = visibleAssets()[0]?.id || null;
  saveAssets();
  render();
}

function printLabels() {
  labelSheet.innerHTML = "";
  const asset = getSelectedAsset();
  if (!asset) return;
  [asset].forEach((entry) => {
    const label = document.createElement("article");
    label.className = "print-label";
    const canvas = document.createElement("canvas");
    const text = document.createElement("div");
    text.innerHTML = `
      <strong>${escapeHtml(entry.name || "Ohne Bezeichnung")}</strong>
      <span>${escapeHtml(entry.inventoryNumber || "-")}</span>
      <span>${escapeHtml(entry.serialNumber || "")}</span>
    `;
    label.append(canvas, text);
    labelSheet.appendChild(label);
    drawQr(canvas, assetUrl(entry.id), 6);
  });
  window.print();
}

function renderAdminLists() {
  if (!isAdmin() && currentView === "users") return;
  if (!canEditAssets() && currentView === "customers") return;
  if (!selectedCustomerAdminId || !customers.some((customer) => customer.id === selectedCustomerAdminId)) {
    selectedCustomerAdminId = customers[0]?.id || null;
  }
  if (!selectedUserAdminName || !users.some((user) => user.username === selectedUserAdminName)) {
    selectedUserAdminName = users[0]?.username || null;
  }

  const editingCustomer = customers.find((customer) => customer.id === editingCustomerAdminId);
  customerAdminList.innerHTML = `
    <div class="user-table customer-table">
        ${customers
          .map(
            (customer) => `
              <button type="button" class="user-row customer-row customer-open" data-customer-id="${escapeHtml(customer.id)}">
                <strong>${escapeHtml(customer.name)}</strong>
                <span>${escapeHtml(customer.notes || "Keine Notiz")}</span>
                <span class="count-pill">${customerAssetCount(customer.id)} Geräte</span>
                <div class="user-actions">
                  <button type="button" class="icon-action edit-customer" title="Kunden bearbeiten" aria-label="Kunden bearbeiten">✎</button>
                  <button type="button" class="icon-action danger-icon delete-customer" title="Kunden löschen" aria-label="Kunden löschen">⌫</button>
                </div>
              </button>`
          )
          .join("")}
    </div>
    ${
      editingCustomer
        ? `<div class="modal-backdrop">
            <form class="modal-card customer-edit-form" data-customer-id="${escapeHtml(editingCustomer.id)}">
              <div class="modal-head">
                <div>
                  <p class="kicker">Kunde</p>
                  <h3>Kunde bearbeiten</h3>
                </div>
                <button type="button" class="icon-action close-customer-modal" title="Schließen" aria-label="Schließen">×</button>
              </div>
              <label>
                Kundenname
                <input class="customer-name" value="${escapeHtml(editingCustomer.name)}" />
              </label>
              <label>
                Notiz
                <textarea class="customer-notes" rows="4" placeholder="Interne Kundeninfos">${escapeHtml(editingCustomer.notes)}</textarea>
              </label>
              <div class="form-actions">
                <button type="button" class="secondary close-customer-modal">Abbrechen</button>
                <button type="submit" class="primary">Speichern</button>
              </div>
            </form>
          </div>`
        : ""
    }`;
  customerAdminList.querySelectorAll(".edit-customer").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      editingCustomerAdminId = button.closest(".customer-row").dataset.customerId;
      renderAdminLists();
    });
  });
  customerAdminList.querySelectorAll(".customer-open").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCustomerId = button.dataset.customerId;
      selectedId = visibleAssets()[0]?.id || null;
      currentView = "assets";
      render();
    });
  });
  customerAdminList.querySelector(".customer-edit-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const customer = customers.find((entry) => entry.id === event.currentTarget.dataset.customerId);
    customer.name = event.currentTarget.querySelector(".customer-name").value.trim();
    customer.notes = event.currentTarget.querySelector(".customer-notes").value.trim();
    editingCustomerAdminId = null;
    await saveCustomers();
    render();
  });
  customerAdminList.querySelectorAll(".delete-customer").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const id = event.currentTarget.closest(".customer-row").dataset.customerId;
      const customer = customers.find((entry) => entry.id === id);
      if (!customer) return;
      const count = customerAssetCount(id);
      if (count > 0) {
        alert(`Dieser Kunde hat noch ${count} Geräte und kann deshalb nicht gelöscht werden.`);
        return;
      }
      if (customers.length === 1) {
        alert("Der letzte Kunde kann nicht gelöscht werden.");
        return;
      }
      if (!confirm(`Kunde "${customer.name}" löschen?`)) return;
      customers = customers.filter((entry) => entry.id !== id);
      if (selectedCustomerId === id) selectedCustomerId = "all";
      if (selectedCustomerAdminId === id) selectedCustomerAdminId = customers[0]?.id || null;
      if (editingCustomerAdminId === id) editingCustomerAdminId = null;
      await saveCustomers();
      render();
    });
  });
  customerAdminList.querySelectorAll(".close-customer-modal").forEach((button) => {
    button.addEventListener("click", () => {
      editingCustomerAdminId = null;
      renderAdminLists();
    });
  });

  const editingUser = users.find((user) => user.username === editingUserAdminName);
  userAdminList.innerHTML = `
    <div class="user-table">
        ${users
          .map(
            (user) => `
              <div class="user-row" data-username="${escapeHtml(user.username)}">
                <strong>${escapeHtml(user.username)}</strong>
                <span>${escapeHtml(roleLabel(user.role))}</span>
                <div class="user-actions">
                  <button type="button" class="icon-action edit-user" title="Benutzer bearbeiten" aria-label="Benutzer bearbeiten">✎</button>
                  <button type="button" class="icon-action danger-icon delete-user" title="Benutzer löschen" aria-label="Benutzer löschen">⌫</button>
                </div>
              </div>`
          )
          .join("")}
    </div>
    ${
      editingUser
        ? `<div class="modal-backdrop">
            <form class="modal-card user-edit-form" data-username="${escapeHtml(editingUser.username)}">
              <div class="modal-head">
                <div>
                  <p class="kicker">Benutzer</p>
                  <h3>Benutzer bearbeiten</h3>
                </div>
                <button type="button" class="icon-action close-user-modal" title="Schließen" aria-label="Schließen">×</button>
              </div>
              <label>
                Benutzername
                <input class="user-name" value="${escapeHtml(editingUser.username)}" />
              </label>
              <label>
                Rolle
                <select class="user-role">
                  <option value="admin" ${editingUser.role === "admin" ? "selected" : ""}>Admin</option>
                  <option value="technician" ${editingUser.role === "technician" ? "selected" : ""}>Techniker</option>
                  <option value="readonly" ${editingUser.role === "readonly" ? "selected" : ""}>Nur Lesen</option>
                </select>
              </label>
              <label>
                Passwort ändern
                <input class="user-password" type="password" placeholder="Leer lassen, wenn es gleich bleiben soll" />
              </label>
              <div class="form-actions">
                <button type="button" class="secondary close-user-modal">Abbrechen</button>
                <button type="submit" class="primary">Speichern</button>
              </div>
            </form>
          </div>`
        : ""
    }`;
  userAdminList.querySelectorAll(".edit-user").forEach((button) => {
    button.addEventListener("click", () => {
      editingUserAdminName = button.closest(".user-row").dataset.username;
      renderAdminLists();
    });
  });
  userAdminList.querySelector(".user-edit-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = users.find((entry) => entry.username === event.currentTarget.dataset.username);
    const nextUsername = event.currentTarget.querySelector(".user-name").value.trim();
    if (!nextUsername) return;
    user.username = nextUsername;
    user.role = event.currentTarget.querySelector(".user-role").value;
    const password = event.currentTarget.querySelector(".user-password").value;
    if (password) user.password = password;
    selectedUserAdminName = nextUsername;
    editingUserAdminName = null;
    await saveUsers();
    users.forEach((entry) => delete entry.password);
    render();
  });
  userAdminList.querySelectorAll(".delete-user").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const username = event.currentTarget.closest(".user-row").dataset.username;
      const user = users.find((entry) => entry.username === username);
      if (!user) return;
      if (user.role === "admin" && users.filter((entry) => entry.role === "admin").length === 1) {
        alert("Der letzte Admin kann nicht gelöscht werden.");
        return;
      }
      if (!confirm(`Benutzer "${username}" löschen?`)) return;
      users = users.filter((entry) => entry.username !== username);
      selectedUserAdminName = users[0]?.username || null;
      if (editingUserAdminName === username) editingUserAdminName = null;
      await saveUsers();
      render();
    });
  });
  userAdminList.querySelectorAll(".close-user-modal").forEach((button) => {
    button.addEventListener("click", () => {
      editingUserAdminName = null;
      renderAdminLists();
    });
  });

  trashList.innerHTML = deletedAssets().length
    ? deletedAssets()
        .map(
          (asset) => `
            <div class="admin-row" data-asset-id="${escapeHtml(asset.id)}">
              <strong>${escapeHtml(asset.name || "Ohne Bezeichnung")}</strong>
              <span>${escapeHtml(asset.inventoryNumber || "")}</span>
              <span>${escapeHtml(formatDateTime(asset.deletedAt))}</span>
              <button type="button" class="secondary restore-asset">Wiederherstellen</button>
              <button type="button" class="danger purge-asset">Endgültig löschen</button>
            </div>`
        )
        .join("")
    : '<p class="empty">Der Papierkorb ist leer.</p>';
  trashList.querySelectorAll(".restore-asset").forEach((button) => {
    button.addEventListener("click", async () => {
      const asset = assets.find((entry) => entry.id === button.closest(".admin-row").dataset.assetId);
      asset.deletedAt = "";
      await saveAssets();
      render();
    });
  });
  trashList.querySelectorAll(".purge-asset").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.closest(".admin-row").dataset.assetId;
      if (!confirm("Eintrag endgültig löschen?")) return;
      assets = assets.filter((entry) => entry.id !== id);
      await saveAssets();
      render();
    });
  });
}

function addCustomer() {
  if (!canEditAssets()) return;
  const customer = { id: newId(), name: "Neuer Kunde", notes: "" };
  customers.push(customer);
  selectedCustomerAdminId = customer.id;
  editingCustomerAdminId = customer.id;
  saveCustomers();
  render();
}

function addUser() {
  if (!isAdmin()) return;
  const user = { username: `user${users.length + 1}`, role: "technician", password: "BitteAendern123" };
  users.push(user);
  selectedUserAdminName = user.username;
  editingUserAdminName = user.username;
  saveUsers();
  users.forEach((entry) => delete entry.password);
  render();
}

function exportBackup() {
  if (!canEditAssets()) return;
  downloadBackup({
    version: 1,
    exportedAt: new Date().toISOString(),
    assets,
    config,
  });
}

function importBackup(event) {
  if (!canEditAssets()) return;
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const payload = JSON.parse(reader.result);
      if (!Array.isArray(payload.assets)) throw new Error("Ungültiges Backup");
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
  if (!isAdmin()) return;
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
  if (!isAdmin()) return;
  if (!serverMode) {
    updateStatus.textContent = "Updates funktionieren nur im Serverbetrieb.";
    return;
  }
  updateStatus.textContent = "Update läuft...";
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
    updateStatus.textContent = "Passwort konnte nicht geändert werden.";
    return;
  }
  newPasswordField.value = "";
  updateStatus.textContent = "Passwort geändert.";
}

async function createBackupNow() {
  if (!isAdmin()) return;
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
  if (!isAdmin()) {
    backupList.innerHTML = "";
    return;
  }
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
  if (crypto.randomUUID) return crypto.randomUUID();
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("");
}

function normalizeAssetId(value) {
  const id = String(value || "").trim();
  return id.length >= 24 ? id : newId();
}

function currentRole() {
  return currentUser?.role || "readonly";
}

function isAdmin() {
  return currentRole() === "admin";
}

function canEditAssets() {
  return currentRole() === "admin" || currentRole() === "technician";
}

function viewAllowed(view) {
  if (view === "users" || view === "settings") return isAdmin();
  if (view === "customers" || view === "trash") return canEditAssets();
  return true;
}

function statusClass(status) {
  if (status === "Service") return "service";
  if (status === "Ausgemustert") return "retired";
  return "ok";
}

function roleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "readonly") return "Nur Lesen";
  return "Techniker";
}

function customerAssetCount(customerId) {
  return assets.filter((asset) => !asset.deletedAt && asset.customerId === customerId).length;
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
