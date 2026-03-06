import { getServers, saveServers, getLibraryIndex, saveLibraryIndex, getOptions, saveOptions, getCachedCollection, saveCachedCollection, getCachedEpisodeGaps, saveCachedEpisodeGaps, clearEpisodeGapCache, getUpdateCheck, saveUpdateCheck } from "../common/storage";
import { testConnection, buildLibraryIndex, fetchShowEpisodes, formatResolution } from "../api/plex";
import { getMovie, getCollection, getTvShow, getTvSeason, findByTvdbId, findByImdbId, searchMovie, searchTv } from "../api/tmdb";
import { getSeriesEpisodes, getSeriesDetails, validateTvdbKey } from "../api/tvdb";
import { getTvMazeExternals, lookupByImdb, lookupByTvdb } from "../api/tvmaze";
import { getImdbRating, validateOmdbKey } from "../api/omdb";
import { debugLog, errorLog } from "../common/logger";
import type {
  Message,
  CheckResponse,
  CollectionCheckResponse,
  EpisodeGapResponse,
  SeasonGapInfo,
  EpisodeGapCacheEntry,
  StatusResponse,
  TestConnectionResponse,
  TestAllServersResponse,
  BuildIndexResponse,
  ValidateTmdbKeyResponse,
  ValidateTvdbKeyResponse,
  ValidateOmdbKeyResponse,
  PlexLookupResponse,
  OptionsResponse,
  SaveOptionsResponse,
  ClearCacheResponse,
  FindTmdbIdResponse,
  StorageUsageResponse,
  TabMediaInfo,
  TabMediaResponse,
  LibraryIndex,
  OwnedItem,
  PlexServerConfig,
} from "../common/types";

let cachedIndex: LibraryIndex | null = null;
let cachedServers: PlexServerConfig[] | null = null;
let autoRefreshing = false;
const tabMediaCache = new Map<number, TabMediaInfo>();

// Reverse lookup: "serverId:ratingKey" → index into items[] (built lazily from cachedIndex)
let plexKeyMap: Map<string, number> | null = null;
let movieIndexSet: Set<number> | null = null;

const SESSION_KEY = "tabMedia";
const MAX_SESSION_ENTRIES = 20;

async function loadServers(): Promise<PlexServerConfig[]> {
  if (!cachedServers) {
    cachedServers = await getServers();
  }
  return cachedServers;
}

async function persistTabMedia(tabId: number, info: TabMediaInfo) {
  tabMediaCache.set(tabId, info);
  try {
    const stored: Record<string, TabMediaInfo> =
      (await browser.storage.session.get(SESSION_KEY))[SESSION_KEY] ?? {};
    stored[String(tabId)] = info;
    // Limit entries
    const keys = Object.keys(stored);
    if (keys.length > MAX_SESSION_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_SESSION_ENTRIES)) {
        delete stored[k];
      }
    }
    await browser.storage.session.set({ [SESSION_KEY]: stored });
  } catch {
    // session storage not available (e.g. Firefox MV2 fallback)
  }
}

async function getTabMedia(tabId: number): Promise<TabMediaInfo | null> {
  const cached = tabMediaCache.get(tabId);
  if (cached) return cached;
  try {
    const stored: Record<string, TabMediaInfo> =
      (await browser.storage.session.get(SESSION_KEY))[SESSION_KEY] ?? {};
    const info = stored[String(tabId)];
    if (info) {
      tabMediaCache.set(tabId, info);
      return info;
    }
  } catch {
    // session storage not available
  }
  return null;
}

async function removeTabMedia(tabId: number) {
  tabMediaCache.delete(tabId);
  try {
    const stored: Record<string, TabMediaInfo> =
      (await browser.storage.session.get(SESSION_KEY))[SESSION_KEY] ?? {};
    delete stored[String(tabId)];
    await browser.storage.session.set({ [SESSION_KEY]: stored });
  } catch {
    // session storage not available
  }
}

function setIndex(index: LibraryIndex | null) {
  cachedIndex = index;
  plexKeyMap = null; // invalidate reverse lookups
  movieIndexSet = null;
}

async function loadIndex(): Promise<LibraryIndex | null> {
  if (!cachedIndex) {
    setIndex(await getLibraryIndex());
    if (cachedIndex) {
      const movieTmdb = Object.keys(cachedIndex.movies.byTmdbId).length;
      const movieImdb = Object.keys(cachedIndex.movies.byImdbId).length;
      const showTvdb = Object.keys(cachedIndex.shows.byTvdbId).length;
      const showTmdb = Object.keys(cachedIndex.shows.byTmdbId).length;
      const showImdb = Object.keys(cachedIndex.shows.byImdbId).length;
      debugLog("BG",
        `loaded index — movies: ${movieTmdb} tmdb / ${movieImdb} imdb, shows: ${showTvdb} tvdb / ${showTmdb} tmdb / ${showImdb} imdb`,
      );
    } else {
      debugLog("BG", "no index found in storage");
    }
  }

  // Auto-refresh if stale (fire-and-forget, returns current index immediately)
  if (cachedIndex && !autoRefreshing) {
    const options = await getOptions();
    if (options.autoRefresh) {
      const ageMs = Date.now() - (cachedIndex.lastRefresh ?? 0);
      const thresholdMs = options.autoRefreshDays * 24 * 60 * 60 * 1000;
      if (ageMs >= thresholdMs) {
        autoRefreshing = true;
        loadServers().then(async (servers) => {
          if (servers.length === 0) { autoRefreshing = false; return; }
          try {
            debugLog("BG", `auto-refresh — index is ${Math.floor(ageMs / 86400000)}d old, refreshing`);
            const newIndex = await buildLibraryIndex(servers);
            await saveLibraryIndex(newIndex);
            setIndex(newIndex);
            debugLog("BG", `auto-refresh complete — ${newIndex.itemCount} items`);
          } catch (err) {
            errorLog("BG", "auto-refresh failed", err);
          } finally {
            autoRefreshing = false;
          }
        });
      }
    }
  }

  return cachedIndex;
}

// --- Update checker ---

const UPDATE_CHECK_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const l = latestParts[i] ?? 0;
    const c = currentParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

async function checkForUpdate(): Promise<void> {
  try {
    const response = await fetch("https://api.github.com/repos/The-Ant-Forge/Parrot/releases/latest", {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!response.ok) {
      errorLog("BG", `update check failed: ${response.status}`);
      return;
    }
    const data = await response.json();
    const tagName = data.tag_name as string;
    const latestVersion = tagName.replace(/^v/, "");
    const downloadUrl = (data.html_url as string) ?? `https://github.com/The-Ant-Forge/Parrot/releases/tag/${tagName}`;
    await saveUpdateCheck({ latestVersion, downloadUrl, checkedAt: Date.now() });
    debugLog("BG", `update check complete — latest: ${latestVersion}`);
  } catch (err) {
    errorLog("BG", "update check failed", err);
  }
}

async function maybeCheckForUpdate(): Promise<void> {
  const cached = await getUpdateCheck();
  if (cached && Date.now() - cached.checkedAt < UPDATE_CHECK_INTERVAL_MS) return;
  checkForUpdate(); // fire-and-forget
}

function buildPlexUrl(machineIdentifier: string, plexKey: string): string {
  return `https://app.plex.tv/desktop/#!/server/${machineIdentifier}/details?key=%2Flibrary%2Fmetadata%2F${plexKey}`;
}

/**
 * Resolve the best Plex URL for an owned item, using server priority order.
 * Returns the URL and server name for the highest-priority server that owns the item.
 */
function resolveItemPlex(item: OwnedItem, servers: PlexServerConfig[]): { url: string; serverName: string } | undefined {
  for (const server of servers) {
    const plexKey = item.plexKeys[server.id];
    if (plexKey) return { url: buildPlexUrl(server.id, plexKey), serverName: server.name };
  }
  return undefined;
}

/** Build lazy reverse lookups for PLEX_LOOKUP (plexKey→index, movie index set). */
function ensurePlexKeyMap(index: LibraryIndex) {
  if (plexKeyMap) return;
  const map = new Map<string, number>();
  for (let i = 0; i < index.items.length; i++) {
    for (const [serverId, ratingKey] of Object.entries(index.items[i].plexKeys)) {
      map.set(`${serverId}:${ratingKey}`, i);
    }
  }
  plexKeyMap = map;
  movieIndexSet = new Set([
    ...Object.values(index.movies.byTmdbId),
    ...Object.values(index.movies.byImdbId),
    ...Object.values(index.movies.byTitle),
  ]);
}

/**
 * Two-step lookup: map[id] → index number → items[index] → OwnedItem
 */
function lookupItem(index: LibraryIndex, mediaType: "movie" | "show", source: string, id: string): OwnedItem | undefined {
  let idx: number | undefined;

  if (source === "title") {
    const map = mediaType === "movie" ? index.movies.byTitle : index.shows.byTitle;
    idx = map[id];
  } else if (mediaType === "movie") {
    const map = source === "tmdb" ? index.movies.byTmdbId : index.movies.byImdbId;
    idx = map[id];
  } else {
    const map = source === "tvdb"
      ? index.shows.byTvdbId
      : source === "tmdb"
        ? index.shows.byTmdbId
        : index.shows.byImdbId;
    idx = map[id];
  }

  return idx !== undefined ? index.items[idx] : undefined;
}

async function handleCheck(
  message: Extract<Message, { type: "CHECK" }>,
  index: LibraryIndex,
): Promise<CheckResponse> {
  let item: OwnedItem | undefined;

  // TVMaze: resolve to TVDB/IMDb via TVMaze API, then look up
  if (message.source === "tvmaze") {
    try {
      debugLog("BG", `CHECK: calling TVMaze externals for tvmaze:${message.id}`);
      const ext = await getTvMazeExternals(message.id);
      debugLog("BG", `CHECK: TVMaze resolved → tvdb:${ext.tvdbId ?? "none"} imdb:${ext.imdbId ?? "none"}`);
      if (ext.tvdbId) {
        item = lookupItem(index, "show", "tvdb", String(ext.tvdbId));
        if (item) debugLog("BG", `CHECK: found via TVMaze→TVDB:${ext.tvdbId}`);
      }
      if (!item && ext.imdbId) {
        item = lookupItem(index, "show", "imdb", ext.imdbId);
        if (item) debugLog("BG", `CHECK: found via TVMaze→IMDb:${ext.imdbId}`);
      }
      // TMDB cross-reference fallback
      if (!item && ext.imdbId) {
        try {
          const options = await getOptions();
          if (options.tmdbApiKey) {
            debugLog("BG", `CHECK: calling TMDB findByImdbId for ${ext.imdbId}`);
            const tmdbId = await findByImdbId(options.tmdbApiKey, ext.imdbId);
            if (tmdbId) {
              item = lookupItem(index, "show", "tmdb", String(tmdbId));
              if (item) debugLog("BG", `CHECK: found via TVMaze→TMDB:${tmdbId}`);
            }
          }
        } catch (err) {
          debugLog("BG", "CHECK: TMDB cross-reference via TVMaze failed", err);
        }
      }
    } catch (err) {
      debugLog("BG", "CHECK: TVMaze API failed", err);
    }
  } else {
    debugLog("BG", `CHECK: direct index lookup ${message.mediaType} ${message.source}:${message.id}`);
    item = lookupItem(index, message.mediaType, message.source, message.id);

    // Cross-reference: if direct lookup missed, try alternate IDs
    if (!item && message.source !== "tmdb" && message.source !== "title") {
      // TVMaze bridge (free, no key): IMDb ↔ TVDB for shows
      if (!item && message.mediaType === "show") {
        try {
          debugLog("BG", `CHECK: calling TVMaze cross-ref for ${message.source}:${message.id}`);
          const ext = message.source === "imdb"
            ? await lookupByImdb(message.id)
            : message.source === "tvdb"
              ? await lookupByTvdb(message.id)
              : null;
          if (ext) {
            debugLog("BG", `CHECK: TVMaze resolved → tvdb:${ext.tvdbId ?? "none"} imdb:${ext.imdbId ?? "none"}`);
            if (ext.tvdbId && message.source !== "tvdb") {
              item = lookupItem(index, "show", "tvdb", String(ext.tvdbId));
              if (item) debugLog("BG", `CHECK: found via TVMaze cross-ref → TVDB:${ext.tvdbId}`);
            }
            if (!item && ext.imdbId && message.source !== "imdb") {
              item = lookupItem(index, "show", "imdb", ext.imdbId);
              if (item) debugLog("BG", `CHECK: found via TVMaze cross-ref → IMDb:${ext.imdbId}`);
            }
          }
        } catch (err) {
          debugLog("BG", "CHECK: TVMaze cross-reference failed", err);
        }
      }

      // TMDB API fallback (requires user API key)
      if (!item) {
        try {
          const options = await getOptions();
          if (options.tmdbApiKey) {
            const resolverName = message.source === "imdb" ? "findByImdbId" : "findByTvdbId";
            debugLog("BG", `CHECK: calling TMDB ${resolverName} for ${message.id}`);
            const resolver = message.source === "imdb" ? findByImdbId : findByTvdbId;
            const tmdbId = await resolver(options.tmdbApiKey, message.id);
            if (tmdbId) {
              item = lookupItem(index, message.mediaType, "tmdb", String(tmdbId));
              if (item) debugLog("BG", `CHECK: found via TMDB cross-ref → TMDB:${tmdbId}`);
            }
          }
        } catch (err) {
          debugLog("BG", "CHECK: TMDB cross-reference failed", err);
        }
      }
    }
  }

  if (!item) return { owned: false };

  const servers = await loadServers();
  const plex = resolveItemPlex(item, servers);

  return {
    owned: true,
    item,
    plexUrl: plex?.url,
    plexServerName: plex?.serverName,
    resolution: item.resolution ? formatResolution(item.resolution) : undefined,
  };
}

type IconState = "owned" | "not-owned" | "inactive";

const ICON_COLORS: Record<IconState, { bg: string; border: string; letter: string }> = {
  owned: { bg: "#1a1a1a", border: "#ebaf00", letter: "#ffffff" },
  "not-owned": { bg: "#3a3a3a", border: "#888888", letter: "#888888" },
  inactive: { bg: "#cccccc", border: "#999999", letter: "#666666" },
};

function roundedRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawIcon(size: number, state: IconState): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const c = ICON_COLORS[state];

  // Rounded rectangle background
  const borderWidth = Math.max(1, Math.round(size * 0.08));
  const radius = Math.round(size * 0.18);
  const inset = borderWidth / 2;

  roundedRect(ctx, inset, inset, size - borderWidth, size - borderWidth, radius);
  ctx.fillStyle = c.bg;
  ctx.fill();
  ctx.strokeStyle = c.border;
  ctx.lineWidth = borderWidth;
  ctx.stroke();

  // "P" letter centered
  const fontSize = Math.round(size * 0.6);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = c.letter;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("P", size / 2, size / 2 + size * 0.04);

  return ctx.getImageData(0, 0, size, size);
}

function getIconImageData(state: IconState): Record<string, ImageData> {
  return {
    "16": drawIcon(16, state),
    "32": drawIcon(32, state),
    "48": drawIcon(48, state),
    "128": drawIcon(128, state),
  };
}

function sendRatingsToTab(tabId: number, info: TabMediaInfo) {
  if (info.tmdbRating !== undefined || info.imdbRating !== undefined) {
    browser.tabs.sendMessage(tabId, {
      type: "RATINGS_READY",
      tmdbRating: info.tmdbRating,
      imdbRating: info.imdbRating,
    }).catch(() => debugLog("BG", "RATINGS: content script not listening"));
  }
}

async function fetchTabMetadata(tabId: number, info: TabMediaInfo) {
  try {
    const options = await getOptions();
    debugLog("BG", `META: enriching ${info.mediaType} ${info.source}:${info.id} (owned:${info.owned})`);
    // Resolve TMDB ID if not already known
    let tmdbId = info.tmdbId;
    if (options.tmdbApiKey) {
      if (!tmdbId && info.source === "imdb") {
        debugLog("BG", `META: calling TMDB findByImdbId for ${info.id}`);
        tmdbId = (await findByImdbId(options.tmdbApiKey, info.id, info.mediaType)) ?? undefined;
      } else if (!tmdbId && info.source === "tvdb") {
        debugLog("BG", `META: calling TMDB findByTvdbId for ${info.id}`);
        tmdbId = (await findByTvdbId(options.tmdbApiKey, info.id)) ?? undefined;
      } else if (!tmdbId && info.source === "title") {
        const parts = info.id.split("|");
        const query = parts[0];
        const year = parts[1] ? parseInt(parts[1], 10) : undefined;
        const searcher = info.mediaType === "movie" ? searchMovie : searchTv;
        const searchLabel = info.mediaType === "movie" ? "searchMovie" : "searchTv";
        debugLog("BG", `META: calling TMDB ${searchLabel} for "${query}" year:${year ?? "none"}`);
        tmdbId = (await searcher(options.tmdbApiKey, query, year)) ?? undefined;
        if (!tmdbId && year) {
          debugLog("BG", `META: retrying TMDB ${searchLabel} for "${query}" without year`);
          tmdbId = (await searcher(options.tmdbApiKey, query)) ?? undefined;
        }
      }
      if (tmdbId) {
        debugLog("BG", `META: resolved TMDB ID → ${tmdbId}`);
        info.tmdbId = tmdbId;
      }
    }

    // Re-check library ownership by resolved TMDB ID
    // Catches items missed by title matching but present in the index by TMDB ID
    if (!info.owned && tmdbId) {
      const index = await loadIndex();
      if (index) {
        const map = info.mediaType === "movie" ? index.movies.byTmdbId : index.shows.byTmdbId;
        const itemIdx = map[String(tmdbId)];
        if (itemIdx !== undefined) {
          const item = index.items[itemIdx];
          const servers = await loadServers();
          const plex = resolveItemPlex(item, servers);
          info.owned = true;
          info.plexUrl = plex?.url;
          info.plexServerName = plex?.serverName;
          if (item.imdbId) info.imdbId = item.imdbId;
          if (item.tvdbId) info.tvdbId = item.tvdbId;
          if (item.title) info.title = item.title;
          if (item.year) info.year = item.year;
          if (item.resolution) info.resolution = formatResolution(item.resolution);
          await setTabIcon(tabId, "owned");
          // Notify content script so the in-page pill updates
          debugLog("BG", `META: ownership flipped via TMDB re-check, notifying tab ${tabId}`);
          browser.tabs.sendMessage(tabId, {
            type: "OWNERSHIP_UPDATED",
            owned: true,
            plexUrl: info.plexUrl,
            resolution: info.resolution,
            mediaType: info.mediaType,
            source: "tmdb",
            id: String(tmdbId),
          }).catch(() => debugLog("BG", "OWNERSHIP: content script not listening"));
        }
      }
    }

    if (!tmdbId) {
      // TVDB fallback: fetch metadata directly from TVDB API
      if (info.source === "tvdb" && info.tvdbId && options.tvdbApiKey) {
        debugLog("BG", `META: no TMDB ID, calling TVDB getSeriesDetails for ${info.tvdbId}`);
        const tvdbDetails = await getSeriesDetails(options.tvdbApiKey, String(info.tvdbId));
        info.title = tvdbDetails.name;
        info.posterUrl = tvdbDetails.image ?? undefined;
        info.year = tvdbDetails.year ? parseInt(tvdbDetails.year, 10) : undefined;
        info.showStatus = tvdbDetails.status?.name;
        persistTabMedia(tabId, info);
      }
      return;
    }

    if (info.mediaType === "movie") {
      debugLog("BG", `META: calling TMDB getMovie for ${tmdbId}`);
      const details = await getMovie(options.tmdbApiKey, tmdbId);
      info.title = details.title;
      info.year = details.release_date ? parseInt(details.release_date.slice(0, 4), 10) : undefined;
      info.posterPath = details.poster_path;
      if (details.vote_average) info.tmdbRating = details.vote_average;
      if (details.imdb_id && !info.imdbId) info.imdbId = details.imdb_id;

      // Collection summary
      if (details.belongs_to_collection) {
        try {
          const collId = details.belongs_to_collection.id;
          let collection = await getCachedCollection(collId);
          if (!collection) {
            collection = await getCollection(options.tmdbApiKey, collId);
            await saveCachedCollection(collection);
          }
          const index = await loadIndex();
          let ownedCount = 0;
          for (const part of collection.parts) {
            if (index && index.movies.byTmdbId[String(part.id)] !== undefined) ownedCount++;
          }
          info.collectionName = collection.name;
          info.collectionOwned = ownedCount;
          info.collectionTotal = collection.parts.length;
        } catch (err) {
          errorLog("BG", "collection summary fetch failed", err);
        }
      }
    } else {
      debugLog("BG", `META: calling TMDB getTvShow for ${tmdbId}`);
      const details = await getTvShow(options.tmdbApiKey, tmdbId);
      info.title = details.name;
      info.posterPath = details.poster_path ?? null;
      info.seasonCount = details.number_of_seasons;
      info.episodeCount = details.number_of_episodes;
      info.showStatus = details.status;
      if (details.vote_average) info.tmdbRating = details.vote_average;
      if (details.external_ids?.imdb_id && !info.imdbId) info.imdbId = details.external_ids.imdb_id;
    }

    // OMDb: fetch IMDb rating if we have an IMDb ID and OMDb key
    if (options.omdbApiKey && info.imdbId) {
      try {
        debugLog("BG", `META: calling OMDb getImdbRating for ${info.imdbId}`);
        const imdbRating = await getImdbRating(options.omdbApiKey, info.imdbId);
        if (imdbRating !== null) info.imdbRating = imdbRating;
      } catch {
        // OMDb fetch is non-critical
      }
    }

    persistTabMedia(tabId, info);
    sendRatingsToTab(tabId, info);
  } catch (err) {
    // 404 = TMDB ID doesn't exist (stale/merged); not worth alarming about
    const msg = String(err);
    if (msg.includes("404")) {
      debugLog("BG", `metadata not found on TMDB for ${info.mediaType} tmdb:${info.tmdbId} — skipping enrichment`);
    } else {
      errorLog("BG", "metadata fetch failed", err);
    }
  }
}

async function setTabIcon(tabId: number, state: IconState) {
  try {
    await browser.action.setIcon({ imageData: getIconImageData(state), tabId });
  } catch (err) {
    errorLog("BG", "failed to set tab icon", err);
  }
}

export default defineBackground(() => {
  // Set default inactive icon on startup
  const manifest = browser.runtime.getManifest();
  debugLog("BG", `v${manifest.version} service worker starting`);
  try {
    browser.action.setIcon({ imageData: getIconImageData("inactive") });
  } catch (err) {
    errorLog("BG", "failed to set default icon", err);
  }

  // Check for extension updates (fire-and-forget)
  maybeCheckForUpdate();

  // Clear episode gap cache on extension update (stale entries may use old logic)
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "update") {
      clearEpisodeGapCache().then(() => {
        debugLog("BG", "episode gap cache cleared after extension update");
      }).catch(() => {});
    }
  });

  browser.runtime.onMessage.addListener(
    (message: Message, sender, sendResponse) => {
      (async () => {
        switch (message.type) {
          case "TEST_CONNECTION": {
            const result: TestConnectionResponse = await testConnection(
              message.config,
            );
            sendResponse(result);
            break;
          }

          case "TEST_ALL_SERVERS": {
            const servers = await loadServers();
            const results = await Promise.all(servers.map(async (s) => {
              const r = await testConnection(s);
              return { serverId: s.id, name: s.name, success: r.success, error: r.error };
            }));
            sendResponse({ results } satisfies TestAllServersResponse);
            break;
          }

          case "BUILD_INDEX": {
            const servers = await loadServers();
            if (servers.length === 0) {
              sendResponse({
                success: false,
                error: "No servers configured",
              } satisfies BuildIndexResponse);
              break;
            }
            try {
              const index = await buildLibraryIndex(servers);
              await saveLibraryIndex(index);
              setIndex(index);

              // Update per-server item counts
              const counts = new Map<string, number>();
              for (const item of index.items) {
                for (const sid of Object.keys(item.plexKeys)) {
                  counts.set(sid, (counts.get(sid) ?? 0) + 1);
                }
              }
              const updatedServers = servers.map(s => ({
                ...s,
                itemCount: counts.get(s.id) ?? 0,
              }));
              await saveServers(updatedServers);
              cachedServers = updatedServers;

              sendResponse({
                success: true,
                itemCount: index.itemCount,
              } satisfies BuildIndexResponse);
            } catch (err) {
              sendResponse({
                success: false,
                error: String(err),
              } satisfies BuildIndexResponse);
            }
            break;
          }

          case "GET_STATUS": {
            const servers = await loadServers();
            const index = await loadIndex();
            const statusOptions = await getOptions();
            const updateCheck = await getUpdateCheck();
            const currentVersion = browser.runtime.getManifest().version;
            const updateAvailable = updateCheck ? isNewerVersion(updateCheck.latestVersion, currentVersion) : false;
            sendResponse({
              configured: servers.length > 0,
              serverCount: servers.length,
              lastRefresh: index?.lastRefresh ?? null,
              itemCount: index?.itemCount ?? 0,
              movieCount: index?.movieCount ?? 0,
              showCount: index?.showCount ?? 0,
              tmdbConfigured: !!statusOptions.tmdbApiKey,
              tvdbConfigured: !!statusOptions.tvdbApiKey,
              omdbConfigured: !!statusOptions.omdbApiKey,
              updateAvailable,
              latestVersion: updateCheck?.latestVersion,
              updateUrl: updateCheck?.downloadUrl,
            } satisfies StatusResponse);
            break;
          }

          case "CHECK": {
            const tabId = sender.tab?.id;
            const index = await loadIndex();
            if (!index) {
              debugLog("BG", "CHECK: no index loaded, returning not owned");
              if (tabId) await setTabIcon(tabId, "not-owned");
              sendResponse({ owned: false } satisfies CheckResponse);
              break;
            }
            const result = await handleCheck(message, index);
            debugLog("BG",
              `CHECK: ${message.mediaType} ${message.source}:${message.id} → ${result.owned ? "OWNED" : "not owned"}`,
              result.owned ? result.item : "",
            );
            if (tabId) await setTabIcon(tabId, result.owned ? "owned" : "not-owned");

            // Cache tab media info for popup dashboard
            if (tabId) {
              // For title source, parse the titleKey "normalized title|year"
              let titleFromKey: string | undefined;
              let yearFromKey: number | undefined;
              if (message.source === "title") {
                const parts = message.id.split("|");
                titleFromKey = parts[0];
                yearFromKey = parts[1] ? parseInt(parts[1], 10) : undefined;
              }

              const mediaInfo: TabMediaInfo = {
                mediaType: message.mediaType,
                source: message.source,
                id: message.id,
                owned: result.owned,
                plexUrl: result.plexUrl,
                plexServerName: result.plexServerName,
                tmdbId: result.item?.tmdbId ?? (message.source === "tmdb" && /^\d+$/.test(message.id) ? parseInt(message.id, 10) : undefined),
                imdbId: result.item?.imdbId ?? (message.source === "imdb" ? message.id : undefined),
                tvdbId: result.item?.tvdbId ?? (message.source === "tvdb" && /^\d+$/.test(message.id) ? parseInt(message.id, 10) : undefined),
                title: result.item?.title ?? titleFromKey,
                year: result.item?.year ?? yearFromKey,
                resolution: result.resolution,
              };
              persistTabMedia(tabId, mediaInfo);
              // Fire-and-forget metadata fetch
              fetchTabMetadata(tabId, mediaInfo).catch((err) =>
                errorLog("BG", "metadata fetch failed", err),
              );
            }

            sendResponse(result);
            break;
          }

          case "GET_OPTIONS": {
            const options = await getOptions();
            sendResponse({ options } satisfies OptionsResponse);
            break;
          }

          case "SAVE_OPTIONS": {
            await saveOptions(message.options);
            sendResponse({ success: true } satisfies SaveOptionsResponse);
            break;
          }

          case "VALIDATE_TMDB_KEY": {
            try {
              const res = await fetch(
                `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(message.apiKey)}`,
                { headers: { Accept: "application/json" } },
              );
              if (res.ok) {
                sendResponse({ valid: true } satisfies ValidateTmdbKeyResponse);
              } else if (res.status === 401) {
                sendResponse({ valid: false, error: "Invalid API key" } satisfies ValidateTmdbKeyResponse);
              } else {
                sendResponse({ valid: false, error: `TMDB returned ${res.status}` } satisfies ValidateTmdbKeyResponse);
              }
            } catch {
              sendResponse({ valid: false, error: "Could not reach TMDB — check your connection" } satisfies ValidateTmdbKeyResponse);
            }
            break;
          }

          case "VALIDATE_TVDB_KEY": {
            try {
              const valid = await validateTvdbKey(message.apiKey);
              if (valid) {
                sendResponse({ valid: true } satisfies ValidateTvdbKeyResponse);
              } else {
                sendResponse({ valid: false, error: "Invalid API key" } satisfies ValidateTvdbKeyResponse);
              }
            } catch {
              sendResponse({ valid: false, error: "Could not reach TVDB — check your connection" } satisfies ValidateTvdbKeyResponse);
            }
            break;
          }

          case "VALIDATE_OMDB_KEY": {
            try {
              const valid = await validateOmdbKey(message.apiKey);
              if (valid) {
                sendResponse({ valid: true } satisfies ValidateOmdbKeyResponse);
              } else {
                sendResponse({ valid: false, error: "Invalid API key" } satisfies ValidateOmdbKeyResponse);
              }
            } catch {
              sendResponse({ valid: false, error: "Could not reach OMDb — check your connection" } satisfies ValidateOmdbKeyResponse);
            }
            break;
          }

          case "CLEAR_CACHE": {
            await browser.storage.local.clear();
            setIndex(null);
            debugLog("BG", "cache cleared");
            sendResponse({ success: true } satisfies ClearCacheResponse);
            break;
          }

          case "GET_TAB_MEDIA": {
            const media = await getTabMedia(message.tabId);
            sendResponse({ media } satisfies TabMediaResponse);
            break;
          }

          case "GET_STORAGE_USAGE": {
            try {
              const bytesUsed = await browser.storage.local.getBytesInUse(null);
              sendResponse({
                bytesUsed,
                quota: (browser.storage.local as unknown as { QUOTA_BYTES?: number }).QUOTA_BYTES ?? 10_485_760,
              } satisfies StorageUsageResponse);
            } catch {
              // Fallback: estimate from index size
              const index = await loadIndex();
              const bytesUsed = index ? JSON.stringify(index).length : 0;
              sendResponse({
                bytesUsed,
                quota: null,
              } satisfies StorageUsageResponse);
            }
            break;
          }

          case "UPDATE_ICON": {
            const iconTabId = sender.tab?.id;
            if (iconTabId) {
              await setTabIcon(iconTabId, message.state);
            }
            sendResponse({});
            break;
          }

          case "CHECK_EPISODES": {
            try {
              const options = await getOptions();
              const useTvdb = message.source === "tvdb" && !!options.tvdbApiKey;

              // Need at least one API key
              if (!useTvdb && !options.tmdbApiKey) {
                sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
                break;
              }

              // Look up show in library index (two-step lookup)
              const index = await loadIndex();
              if (!index) {
                sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
                break;
              }

              const showMap =
                message.source === "tmdb"
                  ? index.shows.byTmdbId
                  : index.shows.byTvdbId;
              const itemIdx = showMap[message.id];
              if (itemIdx === undefined) {
                sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
                break;
              }
              const ownedShow = index.items[itemIdx];

              // Build cache key based on source
              const cacheKey = `${message.source}:${message.id}`;

              // Check cache
              const cachedGaps = await getCachedEpisodeGaps(cacheKey);
              if (cachedGaps) {
                debugLog("BG", `EPISODES: cache hit for ${cacheKey}`);
                sendResponse({
                  hasGaps: cachedGaps.seasons.some((s) => s.missing.length > 0),
                  resolution: cachedGaps.resolution,
                  gaps: {
                    showTitle: cachedGaps.showTitle,
                    totalOwned: cachedGaps.totalOwned,
                    totalEpisodes: cachedGaps.totalEpisodes,
                    completeSeasons: cachedGaps.completeSeasons,
                    totalSeasons: cachedGaps.totalSeasons,
                    seasons: cachedGaps.seasons,
                  },
                } satisfies EpisodeGapResponse);
                break;
              }

              // Fetch Plex episodes from ALL servers that own this show (merge for most accurate gaps)
              const servers = await loadServers();
              const ownedSet = new Set<string>();
              let latestResolution: string | undefined;

              for (const server of servers) {
                const plexKey = ownedShow.plexKeys[server.id];
                if (!plexKey) continue;
                try {
                  const plexResult = await fetchShowEpisodes(server, plexKey);
                  for (const ep of plexResult.episodes) {
                    ownedSet.add(`S${ep.seasonNumber}E${ep.episodeNumber}`);
                  }
                  // Take resolution from first server that returns it (primary server)
                  if (!latestResolution && plexResult.latestResolution) {
                    latestResolution = plexResult.latestResolution;
                  }
                } catch (err) {
                  errorLog("BG", `failed to fetch episodes from server ${server.name}`, err);
                }
              }

              if (ownedSet.size === 0) {
                // Couldn't fetch from any server
                sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
                break;
              }

              const today = new Date().toISOString().split("T")[0];
              let seasonGaps: SeasonGapInfo[];
              let showTitle: string;

              if (useTvdb) {
                // --- TVDB path: one paginated call for all episodes ---
                const allEpisodes = await getSeriesEpisodes(options.tvdbApiKey, message.id);
                showTitle = ownedShow.title;

                // Group episodes by season
                const bySeason = new Map<number, typeof allEpisodes>();
                for (const ep of allEpisodes) {
                  if (options.excludeSpecials && ep.seasonNumber === 0) continue;
                  const tvdbKey = `S${ep.seasonNumber}E${ep.number}`;
                  if (options.excludeFuture && !ownedSet.has(tvdbKey) && (!ep.aired || ep.aired >= today)) continue;
                  const list = bySeason.get(ep.seasonNumber) ?? [];
                  list.push(ep);
                  bySeason.set(ep.seasonNumber, list);
                }

                seasonGaps = [];
                const sortedSeasons = [...bySeason.keys()].sort((a, b) => a - b);

                for (const seasonNum of sortedSeasons) {
                  const episodes = bySeason.get(seasonNum)!;
                  const missing: SeasonGapInfo["missing"] = [];
                  let ownedCount = 0;

                  for (const ep of episodes) {
                    const key = `S${ep.seasonNumber}E${ep.number}`;
                    if (ownedSet.has(key)) {
                      ownedCount++;
                    } else {
                      missing.push({
                        number: ep.number,
                        name: ep.name ?? `Episode ${ep.number}`,
                        airDate: ep.aired ?? undefined,
                      });
                    }
                  }

                  seasonGaps.push({
                    seasonNumber: seasonNum,
                    ownedCount,
                    totalCount: episodes.length,
                    missing,
                  });
                }

                debugLog("BG", `EPISODES: using TVDB for ${message.id}`);
              } else {
                // --- TMDB path: per-season fetching ---
                let tmdbId: number;
                if (message.source === "tmdb") {
                  tmdbId = parseInt(message.id, 10);
                } else {
                  const found = await findByTvdbId(options.tmdbApiKey, message.id);
                  if (!found) {
                    debugLog("BG", `EPISODES: could not find TMDB ID for TVDB ${message.id}`);
                    sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
                    break;
                  }
                  tmdbId = found;
                }

                const tvShow = await getTvShow(options.tmdbApiKey, tmdbId);
                showTitle = tvShow.name;

                let seasons = tvShow.seasons;
                if (options.excludeSpecials) {
                  seasons = seasons.filter((s) => s.season_number !== 0);
                }

                seasonGaps = [];

                for (const season of seasons) {
                  if (season.episode_count === 0) continue;

                  const tmdbSeason = await getTvSeason(options.tmdbApiKey, tmdbId, season.season_number);
                  let episodes = tmdbSeason.episodes;

                  if (options.excludeFuture) {
                    episodes = episodes.filter((ep) => {
                      const key = `S${season.season_number}E${ep.episode_number}`;
                      return ownedSet.has(key) || (ep.air_date && ep.air_date < today);
                    });
                  }

                  if (episodes.length === 0) continue;

                  const missing: SeasonGapInfo["missing"] = [];
                  let ownedCount = 0;

                  for (const ep of episodes) {
                    const key = `S${season.season_number}E${ep.episode_number}`;
                    if (ownedSet.has(key)) {
                      ownedCount++;
                    } else {
                      missing.push({
                        number: ep.episode_number,
                        name: ep.name,
                        airDate: ep.air_date ?? undefined,
                      });
                    }
                  }

                  seasonGaps.push({
                    seasonNumber: season.season_number,
                    ownedCount,
                    totalCount: episodes.length,
                    missing,
                  });
                }

                debugLog("BG", `EPISODES: using TMDB for ${message.id}`);
              }

              const totalOwned = seasonGaps.reduce((sum, s) => sum + s.ownedCount, 0);
              const totalEpisodes = seasonGaps.reduce((sum, s) => sum + s.totalCount, 0);
              const completeSeasons = seasonGaps.filter((s) => s.missing.length === 0).length;
              const hasAnyGaps = seasonGaps.some((s) => s.missing.length > 0);
              const formattedResolution = latestResolution ? formatResolution(latestResolution) : undefined;

              // Cache the result
              const cacheEntry: EpisodeGapCacheEntry = {
                showTitle,
                cacheKey,
                seasons: seasonGaps,
                totalOwned,
                totalEpisodes,
                completeSeasons,
                totalSeasons: seasonGaps.length,
                fetchedAt: Date.now(),
                resolution: formattedResolution,
              };
              await saveCachedEpisodeGaps(cacheEntry);

              debugLog("BG",
                `EPISODES: ${showTitle} — ${totalOwned}/${totalEpisodes} episodes, ${completeSeasons}/${seasonGaps.length} seasons complete`,
              );

              // Update TabMediaInfo with resolution for popup dashboard
              const epTabId = sender.tab?.id;
              if (formattedResolution && epTabId) {
                const existingMedia = await getTabMedia(epTabId);
                if (existingMedia) {
                  existingMedia.resolution = formattedResolution;
                  persistTabMedia(epTabId, existingMedia);
                }
              }

              sendResponse({
                hasGaps: hasAnyGaps,
                resolution: formattedResolution,
                gaps: {
                  showTitle,
                  totalOwned,
                  totalEpisodes,
                  completeSeasons,
                  totalSeasons: seasonGaps.length,
                  seasons: seasonGaps,
                },
              } satisfies EpisodeGapResponse);
            } catch (err) {
              errorLog("BG", "episode check failed", err);
              sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
            }
            break;
          }

          case "FIND_TMDB_ID": {
            try {
              const options = await getOptions();
              if (!options.tmdbApiKey) {
                sendResponse({ tmdbId: null } satisfies FindTmdbIdResponse);
                break;
              }

              let tmdbId: number | null = null;
              if (message.source === "title") {
                // Parse titleKey "normalized title|year" or "normalized title"
                const parts = message.id.split("|");
                const query = parts[0];
                const year = parts[1] ? parseInt(parts[1], 10) : undefined;
                tmdbId = await searchMovie(options.tmdbApiKey, query, year);
                // Retry without year if no match
                if (!tmdbId && year) {
                  tmdbId = await searchMovie(options.tmdbApiKey, query);
                }
              } else {
                const resolver = message.source === "imdb" ? findByImdbId : findByTvdbId;
                tmdbId = await resolver(options.tmdbApiKey, message.id);
              }
              sendResponse({ tmdbId } satisfies FindTmdbIdResponse);
            } catch (err) {
              errorLog("BG", "FIND_TMDB_ID failed", err);
              sendResponse({ tmdbId: null } satisfies FindTmdbIdResponse);
            }
            break;
          }

          case "PLEX_LOOKUP": {
            const index = await loadIndex();
            if (!index) {
              sendResponse({ found: false } satisfies PlexLookupResponse);
              break;
            }

            const { machineIdentifier, ratingKey } = message;
            ensurePlexKeyMap(index);
            const itemIdx = plexKeyMap!.get(`${machineIdentifier}:${ratingKey}`);
            const foundItem = itemIdx !== undefined ? index.items[itemIdx] : undefined;

            // Determine media type via cached set (O(1) lookup)
            let foundMediaType: "movie" | "show" | undefined;
            if (foundItem && itemIdx !== undefined) {
              foundMediaType = movieIndexSet!.has(itemIdx) ? "movie" : "show";
            }

            if (!foundItem || !foundMediaType) {
              debugLog("BG", `PLEX_LOOKUP: ${machineIdentifier}:${ratingKey} → not found in index`);
              sendResponse({ found: false } satisfies PlexLookupResponse);
              break;
            }

            // Return best external ID for a subsequent CHECK
            let source: "tmdb" | "imdb" | "tvdb" | undefined;
            let id: string | undefined;
            if (foundMediaType === "movie") {
              if (foundItem.tmdbId) { source = "tmdb"; id = String(foundItem.tmdbId); }
              else if (foundItem.imdbId) { source = "imdb"; id = foundItem.imdbId; }
            } else {
              if (foundItem.tvdbId) { source = "tvdb"; id = String(foundItem.tvdbId); }
              else if (foundItem.tmdbId) { source = "tmdb"; id = String(foundItem.tmdbId); }
              else if (foundItem.imdbId) { source = "imdb"; id = foundItem.imdbId; }
            }

            debugLog("BG", `PLEX_LOOKUP: ${machineIdentifier}:${ratingKey} → ${foundMediaType} ${source}:${id}`);
            sendResponse({
              found: true,
              mediaType: foundMediaType,
              source,
              id,
            } satisfies PlexLookupResponse);
            break;
          }

          case "CHECK_COLLECTION": {
            try {
              const options = await getOptions();
              if (!options.tmdbApiKey) {
                sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
                break;
              }

              const movieId = parseInt(message.tmdbMovieId, 10);
              const movieData = await getMovie(options.tmdbApiKey, movieId);
              if (!movieData.belongs_to_collection) {
                sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
                break;
              }

              const collectionId = movieData.belongs_to_collection.id;

              // Check cache first
              let collection = await getCachedCollection(collectionId);
              if (!collection) {
                collection = await getCollection(options.tmdbApiKey, collectionId);
                await saveCachedCollection(collection);
              }

              // Filter parts based on options
              const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
              let parts = collection.parts;
              if (options.excludeFuture) {
                parts = parts.filter((m) => m.release_date && m.release_date < today);
              }

              // Check size filters
              if (parts.length < options.minCollectionSize) {
                sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
                break;
              }

              // Check ownership against library index (two-step lookup)
              const index = await loadIndex();
              const servers = await loadServers();
              const ownedMovies: { title: string; year?: number; plexUrl?: string }[] = [];
              const missingMovies: { title: string; releaseDate?: string; tmdbId: number }[] = [];

              for (const part of parts) {
                const tmdbId = String(part.id);
                const itemIdx = index?.movies.byTmdbId[tmdbId];

                if (itemIdx !== undefined && index) {
                  const ownedItem = index.items[itemIdx];
                  const plexResult = resolveItemPlex(ownedItem, servers);
                  ownedMovies.push({
                    title: part.title,
                    year: part.release_date ? parseInt(part.release_date.slice(0, 4), 10) : undefined,
                    plexUrl: plexResult?.url,
                  });
                } else {
                  missingMovies.push({
                    title: part.title,
                    releaseDate: part.release_date || undefined,
                    tmdbId: part.id,
                  });
                }
              }

              // Apply minOwned filter
              if (ownedMovies.length < options.minOwned) {
                sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
                break;
              }

              debugLog("BG",
                `COLLECTION: ${collection.name} — ${ownedMovies.length}/${parts.length} owned, ${missingMovies.length} missing`,
              );

              sendResponse({
                hasCollection: true,
                collection: {
                  name: collection.name,
                  totalMovies: parts.length,
                  ownedMovies,
                  missingMovies,
                },
              } satisfies CollectionCheckResponse);
            } catch (err) {
              errorLog("BG", "collection check failed", err);
              sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
            }
            break;
          }
        }
      })();
      return true; // keep message channel open for async response
    },
  );

  // Clean up stale tab media cache entries
  browser.tabs.onRemoved.addListener((tabId) => {
    removeTabMedia(tabId);
  });

  // Invalidate cached servers when storage changes (e.g. options page saves)
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.plexServers) {
      cachedServers = null;
    }
  });
});
