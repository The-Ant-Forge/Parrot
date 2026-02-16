import { getConfig, saveConfig, getCustomSites, saveCustomSites } from "../../common/storage";
import { DEFAULT_SITES } from "../../common/sites";
import type {
  PlexConfig,
  ParrotOptions,
  TestConnectionResponse,
  BuildIndexResponse,
  StatusResponse,
  ValidateTmdbKeyResponse,
  ValidateTvdbKeyResponse,
  OptionsResponse,
  ClearCacheResponse,
  StorageUsageResponse,
} from "../../common/types";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

// --- Plex elements ---
const serverUrlInput = $<HTMLInputElement>("serverUrl");
const tokenInput = $<HTMLInputElement>("token");
const testBtn = $<HTMLButtonElement>("testBtn");
const saveBtn = $<HTMLButtonElement>("saveBtn");
const plexFeedback = $<HTMLDivElement>("plexFeedback");
const plexStatus = $<HTMLDivElement>("plexStatus");
const itemCountEl = $<HTMLSpanElement>("itemCount");
const lastSyncEl = $<HTMLSpanElement>("lastSync");

// --- TMDB elements ---
const tmdbApiKeyInput = $<HTMLInputElement>("tmdbApiKey");
const validateTmdbBtn = $<HTMLButtonElement>("validateTmdbBtn");
const tmdbFeedback = $<HTMLDivElement>("tmdbFeedback");

// --- TVDB elements ---
const tvdbApiKeyInput = $<HTMLInputElement>("tvdbApiKey");
const validateTvdbBtn = $<HTMLButtonElement>("validateTvdbBtn");
const tvdbFeedback = $<HTMLDivElement>("tvdbFeedback");

// --- Options elements ---
const excludeFutureInput = $<HTMLInputElement>("excludeFuture");
const excludeSpecialsInput = $<HTMLInputElement>("excludeSpecials");
const minCollectionSizeInput = $<HTMLInputElement>("minCollectionSize");
const minOwnedInput = $<HTMLInputElement>("minOwned");
const showCompletePanelsInput = $<HTMLInputElement>("showCompletePanels");
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

// --- Cache elements ---
const cacheItemCountEl = $<HTMLSpanElement>("cacheItemCount");
const cacheLastSyncEl = $<HTMLSpanElement>("cacheLastSync");
const storageUsageEl = $<HTMLSpanElement>("storageUsage");
const autoRefreshInput = $<HTMLInputElement>("autoRefresh");
const autoRefreshDaysInput = $<HTMLInputElement>("autoRefreshDays");
const autoRefreshDaysRow = $<HTMLDivElement>("autoRefreshDaysRow");
const refreshBtn = $<HTMLButtonElement>("refreshBtn");
const clearCacheBtn = $<HTMLButtonElement>("clearCacheBtn");
const cacheFeedback = $<HTMLDivElement>("cacheFeedback");

// --- Helpers ---

function gatherOptions(): ParrotOptions {
  return {
    tmdbApiKey: tmdbApiKeyInput.value.trim(),
    tvdbApiKey: tvdbApiKeyInput.value.trim(),
    excludeFuture: excludeFutureInput.checked,
    excludeSpecials: excludeSpecialsInput.checked,
    minCollectionSize: Math.max(2, parseInt(minCollectionSizeInput.value) || 2),
    minOwned: Math.max(1, parseInt(minOwnedInput.value) || 1),
    showCompletePanels: showCompletePanelsInput.checked,
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

function getFormConfig(): PlexConfig {
  return {
    serverUrl: serverUrlInput.value.trim(),
    token: tokenInput.value.trim(),
  };
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

function showPlexStatus(count: number, lastRefresh: number | null) {
  plexStatus.hidden = false;
  itemCountEl.textContent = String(count);
  lastSyncEl.textContent = lastRefresh ? formatTimestamp(lastRefresh) : "never";
}

function showCacheStatus(count: number, lastRefresh: number | null) {
  cacheItemCountEl.textContent = count > 0 ? `${count} items` : "empty";
  cacheLastSyncEl.textContent = lastRefresh ? formatTimestamp(lastRefresh) : "never";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

// --- Plex handlers ---

testBtn.addEventListener("click", async () => {
  const config = getFormConfig();
  if (!config.serverUrl || !config.token) {
    showFeedback(plexFeedback, "Enter both server URL and token", "error");
    return;
  }

  hideFeedback(plexFeedback);
  setButtonLoading(testBtn, true);

  const result: TestConnectionResponse = await browser.runtime.sendMessage({
    type: "TEST_CONNECTION",
    config,
  });

  setButtonLoading(testBtn, false);

  if (result.success) {
    showFeedback(
      plexFeedback,
      `Connected! Found ${result.libraryCount} ${result.libraryCount === 1 ? "library" : "libraries"}`,
      "success",
    );
  } else {
    showFeedback(plexFeedback, result.error ?? "Connection failed", "error");
  }
});

saveBtn.addEventListener("click", async () => {
  const config = getFormConfig();
  if (!config.serverUrl || !config.token) {
    showFeedback(plexFeedback, "Enter both server URL and token", "error");
    return;
  }

  hideFeedback(plexFeedback);
  setButtonLoading(saveBtn, true);

  // Fetch machineIdentifier before saving
  const testResult: TestConnectionResponse = await browser.runtime.sendMessage({
    type: "TEST_CONNECTION",
    config,
  });
  if (testResult.machineIdentifier) {
    config.machineIdentifier = testResult.machineIdentifier;
  }

  await saveConfig(config);
  showFeedback(plexFeedback, "Syncing library...", "info");

  const result: BuildIndexResponse = await browser.runtime.sendMessage({
    type: "BUILD_INDEX",
  });

  setButtonLoading(saveBtn, false);

  if (result.success) {
    showFeedback(plexFeedback, `Synced ${result.itemCount} items`, "success");
    showPlexStatus(result.itemCount ?? 0, Date.now());
    showCacheStatus(result.itemCount ?? 0, Date.now());
    updateStorageUsage();
  } else {
    showFeedback(plexFeedback, result.error ?? "Sync failed", "error");
  }
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

// --- Options handlers ---

saveOptionsBtn.addEventListener("click", async () => {
  hideFeedback(optionsFeedback);
  setButtonLoading(saveOptionsBtn, true);

  await saveAllOptions();

  setButtonLoading(saveOptionsBtn, false);
  showFeedback(optionsFeedback, "Options saved", "success");
});

// --- Cache handlers ---

autoRefreshInput.addEventListener("change", async () => {
  autoRefreshDaysRow.hidden = !autoRefreshInput.checked;
  await saveAllOptions();
});

autoRefreshDaysInput.addEventListener("change", async () => {
  await saveAllOptions();
});

refreshBtn.addEventListener("click", async () => {
  hideFeedback(cacheFeedback);
  setButtonLoading(refreshBtn, true);

  const result: BuildIndexResponse = await browser.runtime.sendMessage({
    type: "BUILD_INDEX",
  });

  setButtonLoading(refreshBtn, false);

  if (result.success) {
    showFeedback(cacheFeedback, `Refreshed — ${result.itemCount} items`, "success");
    showCacheStatus(result.itemCount ?? 0, Date.now());
    showPlexStatus(result.itemCount ?? 0, Date.now());
    updateStorageUsage();
  } else {
    showFeedback(cacheFeedback, result.error ?? "Refresh failed", "error");
  }
});

clearCacheBtn.addEventListener("click", async () => {
  hideFeedback(cacheFeedback);
  setButtonLoading(clearCacheBtn, true);

  const result: ClearCacheResponse = await browser.runtime.sendMessage({
    type: "CLEAR_CACHE",
  });

  setButtonLoading(clearCacheBtn, false);

  if (result.success) {
    showFeedback(cacheFeedback, "Cache cleared", "success");
    showCacheStatus(0, null);
    showPlexStatus(0, null);
    updateStorageUsage();
  }
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

// --- Init: load saved config, options, and status ---

(async () => {
  // Load Plex config
  const config = await getConfig();
  if (config) {
    serverUrlInput.value = config.serverUrl;
    tokenInput.value = config.token;
  }

  // Load options
  const optionsResult: OptionsResponse = await browser.runtime.sendMessage({
    type: "GET_OPTIONS",
  });
  const options = optionsResult.options;
  tmdbApiKeyInput.value = options.tmdbApiKey;
  tvdbApiKeyInput.value = options.tvdbApiKey;
  excludeFutureInput.checked = options.excludeFuture;
  excludeSpecialsInput.checked = options.excludeSpecials;
  minCollectionSizeInput.value = String(options.minCollectionSize);
  minOwnedInput.value = String(options.minOwned);
  showCompletePanelsInput.checked = options.showCompletePanels;
  autoRefreshInput.checked = options.autoRefresh;
  autoRefreshDaysInput.value = String(options.autoRefreshDays);
  autoRefreshDaysRow.hidden = !options.autoRefresh;

  // Load status
  const status: StatusResponse = await browser.runtime.sendMessage({
    type: "GET_STATUS",
  });

  if (status.configured && status.lastRefresh) {
    showPlexStatus(status.itemCount, status.lastRefresh);
  }
  showCacheStatus(status.itemCount, status.lastRefresh);
  updateStorageUsage();

  // Load custom sites and render sites table
  customSites = await getCustomSites();
  renderSitesTable();
})();
