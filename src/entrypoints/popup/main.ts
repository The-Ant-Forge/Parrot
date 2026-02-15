import { getConfig, saveConfig } from "../../common/storage";
import type {
  PlexConfig,
  TestConnectionResponse,
  BuildIndexResponse,
  StatusResponse,
  TabMediaResponse,
} from "../../common/types";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

// --- Setup elements ---
const setupView = $<HTMLDivElement>("setupView");
const serverUrlInput = $<HTMLInputElement>("serverUrl");
const tokenInput = $<HTMLInputElement>("token");
const testBtn = $<HTMLButtonElement>("testBtn");
const saveBtn = $<HTMLButtonElement>("saveBtn");
const setupFeedback = $<HTMLDivElement>("setupFeedback");

// --- Dashboard elements ---
const dashboardView = $<HTMLDivElement>("dashboardView");
const settingsLink = $<HTMLAnchorElement>("settingsLink");
const statusDot = $<HTMLSpanElement>("statusDot");
const statusText = $<HTMLSpanElement>("statusText");
const librarySummary = $<HTMLSpanElement>("librarySummary");
const mediaCard = $<HTMLDivElement>("mediaCard");
const mediaPoster = $<HTMLImageElement>("mediaPoster");
const mediaTitle = $<HTMLDivElement>("mediaTitle");
const mediaSubtitle = $<HTMLDivElement>("mediaSubtitle");
const mediaIds = $<HTMLDivElement>("mediaIds");
const refreshBtn = $<HTMLButtonElement>("refreshBtn");
const footerInfo = $<HTMLSpanElement>("footerInfo");
const dashFeedback = $<HTMLDivElement>("dashFeedback");

// --- Helpers ---

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
  return `${Math.floor(diffMin / 1440)}d ago`;
}

function getFormConfig(): PlexConfig {
  return {
    serverUrl: serverUrlInput.value.trim(),
    token: tokenInput.value.trim(),
  };
}

// --- Setup handlers ---

settingsLink.addEventListener("click", (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

testBtn.addEventListener("click", async () => {
  const config = getFormConfig();
  if (!config.serverUrl || !config.token) {
    showFeedback(setupFeedback, "Enter both server URL and token", "error");
    return;
  }

  hideFeedback(setupFeedback);
  setButtonLoading(testBtn, true);

  const result: TestConnectionResponse = await browser.runtime.sendMessage({
    type: "TEST_CONNECTION",
    config,
  });

  setButtonLoading(testBtn, false);

  if (result.success) {
    showFeedback(
      setupFeedback,
      `Connected! Found ${result.libraryCount} ${result.libraryCount === 1 ? "library" : "libraries"}`,
      "success",
    );
  } else {
    showFeedback(setupFeedback, result.error ?? "Connection failed", "error");
  }
});

saveBtn.addEventListener("click", async () => {
  const config = getFormConfig();
  if (!config.serverUrl || !config.token) {
    showFeedback(setupFeedback, "Enter both server URL and token", "error");
    return;
  }

  hideFeedback(setupFeedback);
  setButtonLoading(saveBtn, true);

  const testResult: TestConnectionResponse = await browser.runtime.sendMessage({
    type: "TEST_CONNECTION",
    config,
  });
  if (testResult.machineIdentifier) {
    config.machineIdentifier = testResult.machineIdentifier;
  }

  await saveConfig(config);
  showFeedback(setupFeedback, "Syncing library...", "info");

  const result: BuildIndexResponse = await browser.runtime.sendMessage({
    type: "BUILD_INDEX",
  });

  setButtonLoading(saveBtn, false);

  if (result.success) {
    showFeedback(setupFeedback, `Synced ${result.itemCount} items`, "success");
    // Switch to dashboard after successful setup
    setTimeout(() => initDashboard(), 1000);
  } else {
    showFeedback(setupFeedback, result.error ?? "Sync failed", "error");
  }
});

// --- Dashboard handlers ---

refreshBtn.addEventListener("click", async () => {
  hideFeedback(dashFeedback);
  setButtonLoading(refreshBtn, true);

  const result: BuildIndexResponse = await browser.runtime.sendMessage({
    type: "BUILD_INDEX",
  });

  setButtonLoading(refreshBtn, false);

  if (result.success) {
    showFeedback(dashFeedback, `Refreshed — ${result.itemCount} items`, "success");
    updateFooter(result.itemCount ?? 0, Date.now());
  } else {
    showFeedback(dashFeedback, result.error ?? "Refresh failed", "error");
  }
});

// --- Dashboard rendering ---

function updateFooter(itemCount: number, lastRefresh: number | null) {
  const timeStr = lastRefresh ? formatTimestamp(lastRefresh) : "never";
  footerInfo.textContent = `${itemCount} items \u00B7 ${timeStr}`;
}

async function initDashboard() {
  setupView.hidden = true;
  dashboardView.hidden = false;

  const status: StatusResponse = await browser.runtime.sendMessage({
    type: "GET_STATUS",
  });

  // Connection status
  if (status.configured && status.lastRefresh) {
    statusDot.className = "dot connected";
    statusText.textContent = "Connected";
  } else {
    statusDot.className = "dot offline";
    statusText.textContent = "Offline";
  }

  // Library summary
  librarySummary.textContent = `${status.movieCount} Movies \u00B7 ${status.showCount} Shows`;

  // Footer
  updateFooter(status.itemCount, status.lastRefresh);

  // Media card — check active tab
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    if (!activeTab?.id) return;

    const response: TabMediaResponse = await browser.runtime.sendMessage({
      type: "GET_TAB_MEDIA",
      tabId: activeTab.id,
    });

    if (response.media) {
      renderMediaCard(response.media);
    }
  } catch {
    // Not on a supported page — no media card
  }
}

function renderMediaCard(media: NonNullable<TabMediaResponse["media"]>) {
  mediaCard.hidden = false;

  // Poster
  if (media.posterPath) {
    mediaPoster.src = `https://image.tmdb.org/t/p/w92${media.posterPath}`;
    mediaPoster.style.display = "";
  } else {
    mediaPoster.style.display = "none";
  }

  // Title
  const yearStr = media.year ? ` (${media.year})` : "";
  mediaTitle.textContent = (media.title ?? "Unknown") + yearStr;

  // Subtitle
  if (media.mediaType === "show") {
    const parts: string[] = [];
    if (media.seasonCount) parts.push(`${media.seasonCount} seasons`);
    if (media.episodeCount) parts.push(`${media.episodeCount} episodes`);
    if (media.showStatus) parts.push(media.showStatus);
    mediaSubtitle.textContent = parts.join(" \u00B7 ");
  } else {
    mediaSubtitle.textContent = media.owned ? "In Library" : "Not in Library";
  }

  // Source ID tags
  mediaIds.innerHTML = "";

  if (media.owned) {
    const ownedTag = document.createElement("span");
    ownedTag.className = "id-tag owned";
    ownedTag.textContent = media.mediaType === "movie" ? "Movie" : "Show";
    mediaIds.appendChild(ownedTag);
  }

  if (media.plexUrl) {
    const plexLink = document.createElement("a");
    plexLink.className = "id-tag plex";
    plexLink.textContent = "Plex";
    plexLink.href = media.plexUrl;
    plexLink.target = "_blank";
    plexLink.rel = "noopener noreferrer";
    mediaIds.appendChild(plexLink);
  }

  if (media.tmdbId) addIdTag(`TMDB ${media.tmdbId}`);
  if (media.imdbId) addIdTag(media.imdbId);
  if (media.tvdbId) addIdTag(`TVDB ${media.tvdbId}`);
}

function addIdTag(text: string) {
  const tag = document.createElement("span");
  tag.className = "id-tag";
  tag.textContent = text;
  mediaIds.appendChild(tag);
}

// --- Init ---

(async () => {
  const config = await getConfig();
  const status: StatusResponse = await browser.runtime.sendMessage({
    type: "GET_STATUS",
  });

  if (status.configured && config) {
    initDashboard();
  } else {
    setupView.hidden = false;
    if (config) {
      serverUrlInput.value = config.serverUrl;
      tokenInput.value = config.token;
    }
  }
})();
