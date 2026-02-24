import { getServers, saveServers, getCustomSites, saveCustomSites } from "../../common/storage";
import { DEFAULT_SITES } from "../../common/sites";
import type {
  PlexServerConfig,
  ParrotOptions,
  TestConnectionResponse,
  TestAllServersResponse,
  BuildIndexResponse,
  StatusResponse,
  ValidateTmdbKeyResponse,
  ValidateTvdbKeyResponse,
  ValidateOmdbKeyResponse,
  OptionsResponse,
  ClearCacheResponse,
  StorageUsageResponse,
} from "../../common/types";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

// --- Server elements ---
const serverListEl = $<HTMLDivElement>("serverList");
const addServerLabel = $<HTMLDivElement>("addServerLabel");
const serverUrlInput = $<HTMLInputElement>("serverUrl");
const tokenInput = $<HTMLInputElement>("token");
const saveServerBtn = $<HTMLButtonElement>("saveServerBtn");
const cancelEditBtn = $<HTMLButtonElement>("cancelEditBtn");
const plexFeedback = $<HTMLDivElement>("plexFeedback");
const testAllBtn = $<HTMLButtonElement>("testAllBtn");
const refreshBtn = $<HTMLButtonElement>("refreshBtn");
const clearCacheBtn = $<HTMLButtonElement>("clearCacheBtn");
const libraryItemCountEl = $<HTMLSpanElement>("libraryItemCount");
const libraryLastSyncEl = $<HTMLSpanElement>("libraryLastSync");
const storageUsageEl = $<HTMLSpanElement>("storageUsage");
const autoRefreshInput = $<HTMLInputElement>("autoRefresh");
const autoRefreshDaysInput = $<HTMLInputElement>("autoRefreshDays");
const autoRefreshDaysRow = $<HTMLDivElement>("autoRefreshDaysRow");

// --- TMDB elements ---
const tmdbApiKeyInput = $<HTMLInputElement>("tmdbApiKey");
const validateTmdbBtn = $<HTMLButtonElement>("validateTmdbBtn");
const tmdbFeedback = $<HTMLDivElement>("tmdbFeedback");

// --- TVDB elements ---
const tvdbApiKeyInput = $<HTMLInputElement>("tvdbApiKey");
const validateTvdbBtn = $<HTMLButtonElement>("validateTvdbBtn");
const tvdbFeedback = $<HTMLDivElement>("tvdbFeedback");

// --- OMDb elements ---
const omdbApiKeyInput = $<HTMLInputElement>("omdbApiKey");
const validateOmdbBtn = $<HTMLButtonElement>("validateOmdbBtn");
const omdbFeedback = $<HTMLDivElement>("omdbFeedback");

// --- Options elements ---
const excludeFutureInput = $<HTMLInputElement>("excludeFuture");
const excludeSpecialsInput = $<HTMLInputElement>("excludeSpecials");
const minCollectionSizeInput = $<HTMLInputElement>("minCollectionSize");
const minOwnedInput = $<HTMLInputElement>("minOwned");
const showCompletePanelsInput = $<HTMLInputElement>("showCompletePanels");
const debugLoggingInput = $<HTMLInputElement>("debugLogging");
const saveOptionsBtn = $<HTMLButtonElement>("saveOptionsBtn");
const optionsFeedback = $<HTMLDivElement>("optionsFeedback");

// --- Sites elements ---
const sitesBody = $<HTMLTableSectionElement>("sitesBody");
const addSiteBtn = $<HTMLButtonElement>("addSiteBtn");
const resetSitesBtn = $<HTMLButtonElement>("resetSitesBtn");
const addSiteForm = $<HTMLDivElement>("addSiteForm");
const newSiteNameInput = $<HTMLInputElement>("newSiteName");
const newSiteMediaTypeSelect = $<HTMLSelectElement>("newSiteMediaType");
const newSiteUrlInput = $<HTMLInputElement>("newSiteUrl");
const newSiteSelectorInput = $<HTMLInputElement>("newSiteSelector");
const confirmAddSiteBtn = $<HTMLButtonElement>("confirmAddSiteBtn");
const cancelAddSiteBtn = $<HTMLButtonElement>("cancelAddSiteBtn");
const sitesFeedback = $<HTMLDivElement>("sitesFeedback");

// --- State ---
let servers: PlexServerConfig[] = [];
let editingServerId: string | null = null; // null = adding new, string = editing existing
const serverStatuses = new Map<string, boolean>(); // serverId → connected

// --- Helpers ---

function gatherOptions(): ParrotOptions {
  return {
    tmdbApiKey: tmdbApiKeyInput.value.trim(),
    tvdbApiKey: tvdbApiKeyInput.value.trim(),
    omdbApiKey: omdbApiKeyInput.value.trim(),
    excludeFuture: excludeFutureInput.checked,
    excludeSpecials: excludeSpecialsInput.checked,
    minCollectionSize: Math.max(2, parseInt(minCollectionSizeInput.value) || 2),
    minOwned: Math.max(1, parseInt(minOwnedInput.value) || 1),
    showCompletePanels: showCompletePanelsInput.checked,
    debugLogging: debugLoggingInput.checked,
    autoRefresh: autoRefreshInput.checked,
    autoRefreshDays: Math.max(1, Math.min(30, parseInt(autoRefreshDaysInput.value) || 7)),
  };
}

async function saveAllOptions(): Promise<void> {
  await browser.runtime.sendMessage({
    type: "SAVE_OPTIONS",
    options: gatherOptions(),
  });
}

function showFeedback(el: HTMLDivElement, message: string, type: "success" | "error" | "info") {
  el.textContent = message;
  el.className = `feedback ${type}`;
  el.hidden = false;
}

function hideFeedback(el: HTMLDivElement) {
  el.hidden = true;
}

function setButtonLoading(btn: HTMLButtonElement, loading: boolean) {
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.textContent ?? "";
    btn.textContent = "...";
  } else {
    btn.textContent = btn.dataset.originalText ?? btn.textContent;
  }
}

function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diffMin = Math.floor((now - ts) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showLibraryInfo(count: number, lastRefresh: number | null) {
  libraryItemCountEl.textContent = count > 0 ? `${count} items` : "empty";
  libraryLastSyncEl.textContent = lastRefresh ? formatTimestamp(lastRefresh) : "never";
}

async function updateStorageUsage() {
  const result: StorageUsageResponse = await browser.runtime.sendMessage({
    type: "GET_STORAGE_USAGE",
  });
  let text = formatBytes(result.bytesUsed);
  if (result.quota) {
    text += ` / ${formatBytes(result.quota)}`;
  }
  storageUsageEl.textContent = text;
}

// --- Server list rendering ---

function renderServerList() {
  serverListEl.innerHTML = "";
  for (const server of servers) {
    const row = document.createElement("div");
    row.className = "server-row";

    const dot = document.createElement("span");
    dot.className = "status-dot";
    if (serverStatuses.has(server.id)) {
      dot.classList.add(serverStatuses.get(server.id) ? "connected" : "failed");
    }
    row.appendChild(dot);

    const name = document.createElement("span");
    name.className = "server-name";
    name.textContent = server.name;
    if (server.libraryCount || server.itemCount) {
      const info = document.createElement("span");
      info.className = "server-info";
      const parts: string[] = [];
      if (server.libraryCount) parts.push(`${server.libraryCount} libraries`);
      if (server.itemCount) parts.push(`${server.itemCount} items`);
      info.textContent = `\u2014 ${parts.join(", ")}`;
      name.appendChild(info);
    }
    row.appendChild(name);

    const actions = document.createElement("span");
    actions.className = "server-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "server-action-btn edit-btn";
    editBtn.textContent = "\u270E"; // pencil
    editBtn.title = "Edit";
    editBtn.addEventListener("click", () => startEditServer(server));
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "server-action-btn delete-btn";
    deleteBtn.textContent = "\u00D7"; // ×
    deleteBtn.title = "Delete";
    deleteBtn.addEventListener("click", () => deleteServer(server.id));
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    serverListEl.appendChild(row);
  }
}

function startEditServer(server: PlexServerConfig) {
  editingServerId = server.id;
  addServerLabel.textContent = `Edit Server: ${server.name}`;
  serverUrlInput.value = server.serverUrl;
  tokenInput.value = server.token;
  cancelEditBtn.hidden = false;
  hideFeedback(plexFeedback);
  serverUrlInput.focus();
}

function resetServerForm() {
  editingServerId = null;
  addServerLabel.textContent = "Add Server";
  serverUrlInput.value = "";
  tokenInput.value = "";
  cancelEditBtn.hidden = true;
  hideFeedback(plexFeedback);
}

async function deleteServer(serverId: string) {
  servers = servers.filter((s) => s.id !== serverId);
  serverStatuses.delete(serverId);
  await saveServers(servers);
  renderServerList();

  if (editingServerId === serverId) {
    resetServerForm();
  }

  // Rebuild index without the deleted server
  if (servers.length > 0) {
    showFeedback(plexFeedback, "Rebuilding library...", "info");
    const result: BuildIndexResponse = await browser.runtime.sendMessage({
      type: "BUILD_INDEX",
    });
    if (result.success) {
      showFeedback(plexFeedback, `Library updated — ${result.itemCount} items`, "success");
      showLibraryInfo(result.itemCount ?? 0, Date.now());
    } else {
      showFeedback(plexFeedback, result.error ?? "Rebuild failed", "error");
    }
  } else {
    showFeedback(plexFeedback, "All servers removed", "info");
    showLibraryInfo(0, null);
  }
  updateStorageUsage();
}

// --- Server save handler ---

saveServerBtn.addEventListener("click", async () => {
  const serverUrl = serverUrlInput.value.trim();
  const token = tokenInput.value.trim();

  if (!serverUrl || !token) {
    showFeedback(plexFeedback, "Enter both server URL and token", "error");
    return;
  }

  hideFeedback(plexFeedback);
  setButtonLoading(saveServerBtn, true);

  // Test connection to get machineIdentifier + friendlyName
  const testResult: TestConnectionResponse = await browser.runtime.sendMessage({
    type: "TEST_CONNECTION",
    config: { serverUrl, token },
  });

  if (!testResult.success) {
    setButtonLoading(saveServerBtn, false);
    showFeedback(plexFeedback, testResult.error ?? "Connection failed", "error");
    return;
  }

  const serverId = testResult.machineIdentifier ?? `server-${Date.now()}`;
  const serverName = testResult.friendlyName ?? new URL(serverUrl).hostname;

  const newServer: PlexServerConfig = {
    id: serverId,
    name: serverName,
    serverUrl,
    token,
    libraryCount: testResult.libraryCount,
  };

  if (editingServerId) {
    // Update existing server
    const idx = servers.findIndex((s) => s.id === editingServerId);
    if (idx >= 0) {
      servers[idx] = newServer;
    } else {
      servers.push(newServer);
    }
  } else {
    // Check for duplicate machineIdentifier
    const existingIdx = servers.findIndex((s) => s.id === serverId);
    if (existingIdx >= 0) {
      servers[existingIdx] = newServer;
    } else {
      servers.push(newServer);
    }
  }

  await saveServers(servers);
  serverStatuses.set(serverId, true);
  renderServerList();
  resetServerForm();

  showFeedback(plexFeedback, "Syncing library...", "info");

  const result: BuildIndexResponse = await browser.runtime.sendMessage({
    type: "BUILD_INDEX",
  });

  setButtonLoading(saveServerBtn, false);

  if (result.success) {
    showFeedback(plexFeedback, `Synced ${result.itemCount} items`, "success");
    showLibraryInfo(result.itemCount ?? 0, Date.now());
    updateStorageUsage();
    // Re-read servers to pick up itemCount updated by background
    servers = await getServers();
    renderServerList();
  } else {
    showFeedback(plexFeedback, result.error ?? "Sync failed", "error");
  }
});

cancelEditBtn.addEventListener("click", () => {
  resetServerForm();
});

// --- Test All handler ---

testAllBtn.addEventListener("click", async () => {
  if (servers.length === 0) {
    showFeedback(plexFeedback, "No servers configured", "info");
    return;
  }

  hideFeedback(plexFeedback);
  setButtonLoading(testAllBtn, true);

  const result: TestAllServersResponse = await browser.runtime.sendMessage({
    type: "TEST_ALL_SERVERS",
  });

  setButtonLoading(testAllBtn, false);

  for (const r of result.results) {
    serverStatuses.set(r.serverId, r.success);
  }
  renderServerList();

  const passed = result.results.filter((r) => r.success).length;
  const total = result.results.length;
  if (passed === total) {
    showFeedback(plexFeedback, `All ${total} servers connected`, "success");
  } else {
    const failed = result.results
      .filter((r) => !r.success)
      .map((r) => r.name)
      .join(", ");
    showFeedback(plexFeedback, `${passed}/${total} connected. Failed: ${failed}`, "error");
  }
});

// --- Refresh / Clear handlers ---

refreshBtn.addEventListener("click", async () => {
  if (servers.length === 0) {
    showFeedback(plexFeedback, "No servers configured", "info");
    return;
  }

  hideFeedback(plexFeedback);
  setButtonLoading(refreshBtn, true);

  const result: BuildIndexResponse = await browser.runtime.sendMessage({
    type: "BUILD_INDEX",
  });

  setButtonLoading(refreshBtn, false);

  if (result.success) {
    showFeedback(plexFeedback, `Refreshed — ${result.itemCount} items`, "success");
    showLibraryInfo(result.itemCount ?? 0, Date.now());
    updateStorageUsage();
    servers = await getServers();
    renderServerList();
  } else {
    showFeedback(plexFeedback, result.error ?? "Refresh failed", "error");
  }
});

clearCacheBtn.addEventListener("click", async () => {
  hideFeedback(plexFeedback);
  setButtonLoading(clearCacheBtn, true);

  const result: ClearCacheResponse = await browser.runtime.sendMessage({
    type: "CLEAR_CACHE",
  });

  setButtonLoading(clearCacheBtn, false);

  if (result.success) {
    showFeedback(plexFeedback, "Library cache cleared", "success");
    showLibraryInfo(0, null);
    updateStorageUsage();
  }
});

// --- Auto-refresh handlers ---

autoRefreshInput.addEventListener("change", async () => {
  autoRefreshDaysRow.hidden = !autoRefreshInput.checked;
  await saveAllOptions();
});

autoRefreshDaysInput.addEventListener("change", async () => {
  await saveAllOptions();
});

// --- TMDB handlers ---

validateTmdbBtn.addEventListener("click", async () => {
  const apiKey = tmdbApiKeyInput.value.trim();
  if (!apiKey) {
    showFeedback(tmdbFeedback, "Enter a TMDB API key", "error");
    return;
  }

  hideFeedback(tmdbFeedback);
  setButtonLoading(validateTmdbBtn, true);

  const result: ValidateTmdbKeyResponse = await browser.runtime.sendMessage({
    type: "VALIDATE_TMDB_KEY",
    apiKey,
  });

  setButtonLoading(validateTmdbBtn, false);

  if (result.valid) {
    showFeedback(tmdbFeedback, "Valid — saved", "success");
    await saveAllOptions();
  } else {
    showFeedback(tmdbFeedback, result.error ?? "Invalid key", "error");
  }
});

// --- TVDB handlers ---

validateTvdbBtn.addEventListener("click", async () => {
  const apiKey = tvdbApiKeyInput.value.trim();
  if (!apiKey) {
    showFeedback(tvdbFeedback, "Enter a TVDB API key", "error");
    return;
  }

  hideFeedback(tvdbFeedback);
  setButtonLoading(validateTvdbBtn, true);

  const result: ValidateTvdbKeyResponse = await browser.runtime.sendMessage({
    type: "VALIDATE_TVDB_KEY",
    apiKey,
  });

  setButtonLoading(validateTvdbBtn, false);

  if (result.valid) {
    showFeedback(tvdbFeedback, "Valid — saved", "success");
    await saveAllOptions();
  } else {
    showFeedback(tvdbFeedback, result.error ?? "Invalid key", "error");
  }
});

// --- OMDb handlers ---

validateOmdbBtn.addEventListener("click", async () => {
  const apiKey = omdbApiKeyInput.value.trim();
  if (!apiKey) {
    showFeedback(omdbFeedback, "Enter an OMDb API key", "error");
    return;
  }

  hideFeedback(omdbFeedback);
  setButtonLoading(validateOmdbBtn, true);

  const result: ValidateOmdbKeyResponse = await browser.runtime.sendMessage({
    type: "VALIDATE_OMDB_KEY",
    apiKey,
  });

  setButtonLoading(validateOmdbBtn, false);

  if (result.valid) {
    showFeedback(omdbFeedback, "Valid — saved", "success");
    await saveAllOptions();
  } else {
    showFeedback(omdbFeedback, result.error ?? "Invalid key", "error");
  }
});

// --- Options handlers ---

saveOptionsBtn.addEventListener("click", async () => {
  hideFeedback(optionsFeedback);
  setButtonLoading(saveOptionsBtn, true);

  await saveAllOptions();

  setButtonLoading(saveOptionsBtn, false);
  showFeedback(optionsFeedback, "Options saved", "success");
});

// --- Sites table ---

import type { SiteDefinition } from "../../common/types";

let customSites: SiteDefinition[] = [];

function renderSiteRow(site: SiteDefinition) {
  const tr = document.createElement("tr");

  const nameTd = document.createElement("td");
  nameTd.textContent = site.name;
  tr.appendChild(nameTd);

  const typeTd = document.createElement("td");
  const typeTag = document.createElement("span");
  typeTag.className = `media-type-tag ${site.mediaType}`;
  typeTag.textContent = site.mediaType;
  typeTd.appendChild(typeTag);
  tr.appendChild(typeTd);

  const urlTd = document.createElement("td");
  urlTd.className = "url-pattern";
  urlTd.textContent = site.urlPattern;
  tr.appendChild(urlTd);

  const actionTd = document.createElement("td");
  if (!site.isBuiltin) {
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "\u00D7";
    removeBtn.title = "Remove";
    removeBtn.addEventListener("click", async () => {
      customSites = customSites.filter((s) => s.id !== site.id);
      await saveCustomSites(customSites);
      renderSitesTable();
      showFeedback(sitesFeedback, "Site removed", "info");
    });
    actionTd.appendChild(removeBtn);
  }
  tr.appendChild(actionTd);

  sitesBody.appendChild(tr);
}

function renderSitesTable() {
  sitesBody.innerHTML = "";
  for (const site of DEFAULT_SITES) renderSiteRow(site);
  for (const site of customSites) renderSiteRow(site);
}

// --- Custom sites handlers ---

addSiteBtn.addEventListener("click", () => {
  addSiteForm.hidden = false;
  newSiteNameInput.value = "";
  newSiteUrlInput.value = "";
  newSiteSelectorInput.value = "h1";
  newSiteMediaTypeSelect.value = "auto";
  hideFeedback(sitesFeedback);
  newSiteNameInput.focus();
});

cancelAddSiteBtn.addEventListener("click", () => {
  addSiteForm.hidden = true;
});

confirmAddSiteBtn.addEventListener("click", async () => {
  const name = newSiteNameInput.value.trim();
  const urlPattern = newSiteUrlInput.value.trim();
  const badgeSelector = newSiteSelectorInput.value.trim() || "h1";
  const mediaType = newSiteMediaTypeSelect.value as "movie" | "show" | "auto";

  if (!name || !urlPattern) {
    showFeedback(sitesFeedback, "Name and URL pattern are required", "error");
    return;
  }

  const newSite: SiteDefinition = {
    id: `custom-${Date.now()}`,
    name,
    urlPattern,
    mediaType,
    badgeSelector,
    isBuiltin: false,
    enabled: true,
  };

  customSites.push(newSite);
  await saveCustomSites(customSites);
  addSiteForm.hidden = true;
  renderSitesTable();
  showFeedback(sitesFeedback, `Added "${name}"`, "success");
});

resetSitesBtn.addEventListener("click", async () => {
  customSites = [];
  await saveCustomSites([]);
  renderSitesTable();
  showFeedback(sitesFeedback, "Custom sites cleared", "info");
});

// --- Init: load saved servers, options, and status ---

(async () => {
  // Load servers
  servers = await getServers();
  renderServerList();

  // Load options
  const optionsResult: OptionsResponse = await browser.runtime.sendMessage({
    type: "GET_OPTIONS",
  });
  const options = optionsResult.options;
  tmdbApiKeyInput.value = options.tmdbApiKey;
  tvdbApiKeyInput.value = options.tvdbApiKey;
  omdbApiKeyInput.value = options.omdbApiKey;
  excludeFutureInput.checked = options.excludeFuture;
  excludeSpecialsInput.checked = options.excludeSpecials;
  minCollectionSizeInput.value = String(options.minCollectionSize);
  minOwnedInput.value = String(options.minOwned);
  showCompletePanelsInput.checked = options.showCompletePanels;
  debugLoggingInput.checked = options.debugLogging;
  autoRefreshInput.checked = options.autoRefresh;
  autoRefreshDaysInput.value = String(options.autoRefreshDays);
  autoRefreshDaysRow.hidden = !options.autoRefresh;

  // Load status
  const status: StatusResponse = await browser.runtime.sendMessage({
    type: "GET_STATUS",
  });
  showLibraryInfo(status.itemCount, status.lastRefresh);
  updateStorageUsage();

  // Load custom sites and render sites table
  customSites = await getCustomSites();
  renderSitesTable();

  // Show version in footer
  const manifest = browser.runtime.getManifest();
  const footer = document.getElementById("versionFooter");
  if (footer && manifest.version) {
    footer.textContent = `Parrot v${manifest.version}`;
  }

  // Test all servers on page load
  if (servers.length > 0) {
    const testResult: TestAllServersResponse = await browser.runtime.sendMessage({
      type: "TEST_ALL_SERVERS",
    });
    for (const r of testResult.results) {
      serverStatuses.set(r.serverId, r.success);
    }
    renderServerList();
  }
})();
