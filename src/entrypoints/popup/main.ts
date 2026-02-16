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
const statusPills = $<HTMLDivElement>("statusPills");
const librarySummary = $<HTMLSpanElement>("librarySummary");
const mediaCard = $<HTMLDivElement>("mediaCard");
const mediaPoster = $<HTMLImageElement>("mediaPoster");
const mediaTitle = $<HTMLDivElement>("mediaTitle");
const mediaTypeTag = $<HTMLSpanElement>("mediaTypeTag");
const mediaSubtitle = $<HTMLDivElement>("mediaSubtitle");
const mediaCollection = $<HTMLDivElement>("mediaCollection");
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

  // Service status pills
  statusPills.innerHTML = "";
  const plexActive = status.configured && !!status.lastRefresh;
  addStatusPill("Plex", plexActive);
  addStatusPill("TMDB", status.tmdbConfigured);
  if (status.tvdbConfigured) addStatusPill("TVDB", true);

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

      // Retry once after 1s if metadata fetch hasn't completed yet (no poster)
      if (!response.media.posterPath && !response.media.posterUrl && activeTab.id) {
        const retryTabId = activeTab.id;
        setTimeout(async () => {
          try {
            const retry: TabMediaResponse = await browser.runtime.sendMessage({
              type: "GET_TAB_MEDIA",
              tabId: retryTabId,
            });
            if (retry.media?.posterPath || retry.media?.posterUrl) {
              renderMediaCard(retry.media);
            }
          } catch {
            // ignore retry failure
          }
        }, 1000);
      }
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
  } else if (media.posterUrl) {
    mediaPoster.src = media.posterUrl;
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

  // Collection summary (movies only)
  if (media.collectionName && media.collectionTotal) {
    mediaCollection.hidden = false;
    mediaCollection.innerHTML = "";
    mediaCollection.appendChild(document.createTextNode(`${media.collectionName} \u2014 `));
    const countSpan = document.createElement("span");
    countSpan.className = "collection-count";
    countSpan.textContent = `${media.collectionOwned ?? 0} of ${media.collectionTotal} owned`;
    mediaCollection.appendChild(countSpan);
  } else {
    mediaCollection.hidden = true;
  }

  // Media type tag (title row, floated right)
  if (media.owned) {
    mediaTypeTag.textContent = media.mediaType === "movie" ? "Movie" : "Show";
    mediaTypeTag.hidden = false;
  } else {
    mediaTypeTag.hidden = true;
  }

  // Source ID tags
  mediaIds.innerHTML = "";

  if (media.plexUrl) {
    const plexLink = document.createElement("a");
    plexLink.className = "id-tag plex";
    plexLink.textContent = "Plex";
    plexLink.href = media.plexUrl;
    plexLink.target = "_blank";
    plexLink.rel = "noopener noreferrer";
    mediaIds.appendChild(plexLink);
  }

  const tmdbPath = media.mediaType === "movie" ? "movie" : "tv";
  if (media.tmdbId) addIdLink(`TMDB ${media.tmdbId}`, `https://www.themoviedb.org/${tmdbPath}/${media.tmdbId}`);
  if (media.imdbId) addIdLink(`IMDb ${media.imdbId}`, `https://www.imdb.com/title/${media.imdbId}/`);
  if (media.tvdbId) addIdLink(`TVDB ${media.tvdbId}`, `https://www.thetvdb.com/dereferrer/series/${media.tvdbId}`);
}

function addStatusPill(label: string, active: boolean) {
  const pill = document.createElement("span");
  pill.className = `status-pill${active ? " active" : ""}`;
  const dot = document.createElement("span");
  dot.className = "pill-dot";
  pill.appendChild(dot);
  pill.appendChild(document.createTextNode(label));
  statusPills.appendChild(pill);
}

function addIdLink(text: string, url: string) {
  const link = document.createElement("a");
  link.className = "id-tag";
  link.textContent = text;
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  mediaIds.appendChild(link);
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
