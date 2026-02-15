import { getConfig, saveConfig } from "../../common/storage";
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
const saveOptionsBtn = $<HTMLButtonElement>("saveOptionsBtn");
const optionsFeedback = $<HTMLDivElement>("optionsFeedback");

// --- Cache elements ---
const cacheItemCountEl = $<HTMLSpanElement>("cacheItemCount");
const cacheLastSyncEl = $<HTMLSpanElement>("cacheLastSync");
const refreshBtn = $<HTMLButtonElement>("refreshBtn");
const clearCacheBtn = $<HTMLButtonElement>("clearCacheBtn");
const cacheFeedback = $<HTMLDivElement>("cacheFeedback");

// --- Helpers ---

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
    showFeedback(tmdbFeedback, "Valid", "success");
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
    showFeedback(tvdbFeedback, "Valid", "success");
  } else {
    showFeedback(tvdbFeedback, result.error ?? "Invalid key", "error");
  }
});

// --- Options handlers ---

saveOptionsBtn.addEventListener("click", async () => {
  const options: ParrotOptions = {
    tmdbApiKey: tmdbApiKeyInput.value.trim(),
    tvdbApiKey: tvdbApiKeyInput.value.trim(),
    excludeFuture: excludeFutureInput.checked,
    excludeSpecials: excludeSpecialsInput.checked,
    minCollectionSize: Math.max(2, parseInt(minCollectionSizeInput.value) || 2),
    minOwned: Math.max(1, parseInt(minOwnedInput.value) || 1),
  };

  hideFeedback(optionsFeedback);
  setButtonLoading(saveOptionsBtn, true);

  await browser.runtime.sendMessage({
    type: "SAVE_OPTIONS",
    options,
  });

  setButtonLoading(saveOptionsBtn, false);
  showFeedback(optionsFeedback, "Options saved", "success");
});

// --- Cache handlers ---

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
  }
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

  // Load status
  const status: StatusResponse = await browser.runtime.sendMessage({
    type: "GET_STATUS",
  });

  if (status.configured && status.lastRefresh) {
    showPlexStatus(status.itemCount, status.lastRefresh);
  }
  showCacheStatus(status.itemCount, status.lastRefresh);
})();
