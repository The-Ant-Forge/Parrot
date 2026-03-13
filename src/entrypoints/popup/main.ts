import { getServers, saveServers, getOptions } from "../../common/storage";
import { showFeedback, hideFeedback, setButtonLoading, formatTimestamp } from "../../common/ui-helpers";
import type {
  PlexServerConfig,
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
const movieCountEl = $<HTMLSpanElement>("movieCount");
const showCountEl = $<HTMLSpanElement>("showCount");
const updateBanner = $<HTMLAnchorElement>("updateBanner");
const mediaCard = $<HTMLDivElement>("mediaCard");
const mediaPoster = $<HTMLImageElement>("mediaPoster");
const mediaTitle = $<HTMLDivElement>("mediaTitle");
const mediaTypeTag = $<HTMLSpanElement>("mediaTypeTag");
const mediaSubtitle = $<HTMLDivElement>("mediaSubtitle");
const mediaCollection = $<HTMLDivElement>("mediaCollection");
const mediaIds = $<HTMLDivElement>("mediaIds");
const refreshBtn = $<HTMLButtonElement>("refreshBtn");
const syncInfo = $<HTMLSpanElement>("syncInfo");
const dashFeedback = $<HTMLDivElement>("dashFeedback");

// --- Helpers ---

function getFormConfig(): { serverUrl: string; token: string } {
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

  const serverId = testResult.machineIdentifier ?? `server-${Date.now()}`;
  const serverName = testResult.friendlyName ?? (() => {
    try { return new URL(config.serverUrl).hostname; } catch { return "Server 1"; }
  })();

  const newServer: PlexServerConfig = {
    id: serverId,
    name: serverName,
    serverUrl: config.serverUrl,
    token: config.token,
  };

  await saveServers([newServer]);
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
  refreshBtn.disabled = true;
  const refreshLabel = refreshBtn.querySelector(".refresh-label")!;
  refreshLabel.textContent = "...";

  const result: BuildIndexResponse = await browser.runtime.sendMessage({
    type: "BUILD_INDEX",
  });

  refreshBtn.disabled = false;
  refreshLabel.textContent = "Refresh";

  if (result.success) {
    showFeedback(dashFeedback, `Refreshed — ${result.itemCount} items`, "success");
    updateSyncInfo(result.itemCount ?? 0, Date.now());
  } else {
    showFeedback(dashFeedback, result.error ?? "Refresh failed", "error");
  }
});

// --- Dashboard rendering ---

function updateSyncInfo(itemCount: number, lastRefresh: number | null) {
  const timeStr = lastRefresh ? formatTimestamp(lastRefresh) : "never";
  syncInfo.textContent = `${itemCount} items \u00B7 ${timeStr}`;
}

async function initDashboard() {
  setupView.hidden = true;
  dashboardView.hidden = false;

  const status: StatusResponse = await browser.runtime.sendMessage({
    type: "GET_STATUS",
  });

  // Service status pills (always show all four)
  statusPills.innerHTML = "";
  const plexActive = status.configured && !!status.lastRefresh;
  addStatusPill("Plex", plexActive);
  addStatusPill("TMDB", status.tmdbConfigured);
  addStatusPill("TVDB", status.tvdbConfigured);
  addStatusPill("OMDb", status.omdbConfigured);

  // Library summary (stacked)
  movieCountEl.textContent = `${status.movieCount} Movies`;
  showCountEl.textContent = `${status.showCount} Shows`;

  // Footer
  updateSyncInfo(status.itemCount, status.lastRefresh);

  // Update banner
  if (status.updateAvailable && status.latestVersion && status.updateUrl) {
    updateBanner.textContent = `v${status.latestVersion} available — click to download`;
    updateBanner.href = status.updateUrl;
    updateBanner.hidden = false;
  } else {
    updateBanner.hidden = true;
  }

  // Media card — check active tab
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    if (!activeTab?.id) return;

    const response: TabMediaResponse = await browser.runtime.sendMessage({
      type: "GET_TAB_MEDIA",
      tabId: activeTab.id,
    });

    const opts = await getOptions();
    if (response.media) {
      renderMediaCard(response.media, opts.debugLogging);

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
              renderMediaCard(retry.media, opts.debugLogging);
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

function renderMediaCard(media: NonNullable<TabMediaResponse["media"]>, debug = false) {
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

  // Average rating from available sources (TMDB + IMDb)
  const ratingValues: number[] = [];
  if (media.tmdbRating && media.tmdbRating > 0) ratingValues.push(media.tmdbRating);
  if (media.imdbRating && media.imdbRating > 0) ratingValues.push(media.imdbRating);
  const ratingText = ratingValues.length > 0
    ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(1)
    : null;

  // Subtitle
  mediaSubtitle.innerHTML = "";
  if (media.mediaType === "show") {
    const parts: string[] = [];
    if (media.resolution) parts.push(media.resolution);
    if (media.seasonCount) parts.push(`${media.seasonCount} seasons`);
    if (media.episodeCount) parts.push(`${media.episodeCount} episodes`);
    if (media.showStatus) parts.push(media.showStatus.replace(/ Series$/i, ""));
    if (ratingText) {
      const ratingSpan = document.createElement("span");
      ratingSpan.className = "rating-score";
      ratingSpan.textContent = ratingText;
      mediaSubtitle.appendChild(ratingSpan);
      if (parts.length > 0) mediaSubtitle.appendChild(document.createTextNode(` \u00B7 ${parts.join(" \u00B7 ")}`));
    } else {
      mediaSubtitle.textContent = parts.join(" \u00B7 ");
    }
  } else {
    const statusText = media.owned ? "In Library" : "Not in Library";
    const middleParts: string[] = [];
    if (media.resolution) middleParts.push(media.resolution);
    middleParts.push(statusText);
    const suffix = middleParts.join(" \u00B7 ");
    if (ratingText) {
      const ratingSpan = document.createElement("span");
      ratingSpan.className = "rating-score";
      ratingSpan.textContent = ratingText;
      mediaSubtitle.appendChild(ratingSpan);
      mediaSubtitle.appendChild(document.createTextNode(` \u00B7 ${suffix}`));
    } else {
      mediaSubtitle.textContent = suffix;
    }
  }

  // Collection summary (movies only)
  if (media.collectionName && media.collectionTotal) {
    mediaCollection.hidden = false;
    const owned = media.collectionOwned ?? 0;
    mediaCollection.textContent = `${media.collectionName} \u00B7 ${owned}/${media.collectionTotal} In Library`;
  } else {
    mediaCollection.hidden = true;
  }

  // Media type tag (title row, floated right)
  mediaTypeTag.textContent = media.mediaType === "movie" ? "Movie" : "Show";
  mediaTypeTag.hidden = false;

  // Source ID tags
  mediaIds.innerHTML = "";

  if (media.plexUrl) {
    const plexLink = document.createElement("a");
    plexLink.className = "id-tag plex";
    plexLink.textContent = `\u25B6 ${media.plexServerName ?? "Plex"}`;
    plexLink.href = media.plexUrl;
    plexLink.target = "_blank";
    plexLink.rel = "noopener noreferrer";
    mediaIds.appendChild(plexLink);
  }

  const tmdbPath = media.mediaType === "movie" ? "movie" : "tv";
  if (media.tmdbId) addRatedIdLink(media.tmdbRating, "TMDB", `TMDB ${media.tmdbId}`, `https://www.themoviedb.org/${tmdbPath}/${media.tmdbId}`, debug);
  if (media.imdbId) addRatedIdLink(media.imdbRating, "IMDb", `IMDb ${media.imdbId}`, `https://www.imdb.com/title/${media.imdbId}/`, debug);
  if (media.tvdbId) addIdLink("TVDB", `TVDB ${media.tvdbId}`, `https://www.thetvdb.com/dereferrer/series/${media.tvdbId}`, debug);
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

function addIdLink(label: string, fullText: string, url: string, debug: boolean) {
  const link = document.createElement("a");
  link.className = "id-tag";
  link.textContent = debug ? fullText : label;
  link.title = fullText;
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  mediaIds.appendChild(link);
}

function addRatedIdLink(rating: number | undefined, label: string, fullText: string, url: string, debug: boolean) {
  const link = document.createElement("a");
  link.className = "id-tag";
  link.title = fullText;
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (rating && rating > 0) {
    const ratingSpan = document.createElement("span");
    ratingSpan.className = "rating-score";
    ratingSpan.textContent = `${rating.toFixed(1)} `;
    link.appendChild(ratingSpan);
  }
  link.appendChild(document.createTextNode(debug ? fullText : label));
  mediaIds.appendChild(link);
}

// --- Init ---

(async () => {
  const servers = await getServers();
  const status: StatusResponse = await browser.runtime.sendMessage({
    type: "GET_STATUS",
  });

  if (status.configured && servers.length > 0) {
    initDashboard();
  } else {
    setupView.hidden = false;
    if (servers.length > 0) {
      serverUrlInput.value = servers[0].serverUrl;
      tokenInput.value = servers[0].token;
    }
  }
})();
