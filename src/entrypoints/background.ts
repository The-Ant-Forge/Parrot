import { getServers, saveServers, getLibraryIndex, saveLibraryIndex, getOptions, saveOptions, getCachedCollection, saveCachedCollection, getCachedEpisodeGaps, saveCachedEpisodeGaps, clearEpisodeGapCache, getUpdateCheck } from "../common/storage";
import { testConnection, buildLibraryIndex, fetchShowEpisodes, formatResolution } from "../api/plex";
import { getMovie, getCollection, getTvShow, getTvSeason, findByTvdbId, findByImdbId, searchMovie, searchTv } from "../api/tmdb";
import { getSeriesEpisodes, getSeriesDetails, validateTvdbKey } from "../api/tvdb";
import { getTvMazeExternals, lookupByImdb, lookupByTvdb } from "../api/tvmaze";
import { getImdbRating, validateOmdbKey } from "../api/omdb";
import { getRadarrMovie, getRadarrMovieByImdb, getRadarrCollection, searchRadarrMovie } from "../api/radarr";
import type { RadarrMovie } from "../api/radarr";
import { getSonarrShow, searchSonarrShow } from "../api/sonarr";
import type { SonarrShow } from "../api/sonarr";
import { debugLog, errorLog } from "../common/logger";
import { isNewerVersion, maybeCheckForUpdate } from "./bg/version";
import { resolveItemPlex, lookupItem } from "./bg/library";
import { applyRadarrMetadata, applySonarrMetadata, hasAnyRatings } from "./bg/metadata";
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
let cachedOpts: import("../common/types").ParrotOptions | null = null;
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

async function loadOptions(): Promise<import("../common/types").ParrotOptions> {
  if (!cachedOpts) {
    cachedOpts = await getOptions();
  }
  return cachedOpts;
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
    const options = await loadOptions();
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
          const options = await loadOptions();
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

      // Radarr proxy cross-reference for movies (free, no key)
      if (!item && message.mediaType === "movie" && message.source === "imdb") {
        try {
          const options = await loadOptions();
          if (options.useCommunityProxies) {
            debugLog("BG", `CHECK: calling Radarr proxy for imdb:${message.id}`);
            const radarrMovie = await getRadarrMovieByImdb(message.id);
            if (radarrMovie?.TmdbId) {
              item = lookupItem(index, "movie", "tmdb", String(radarrMovie.TmdbId));
              if (item) debugLog("BG", `CHECK: found via Radarr cross-ref → TMDB:${radarrMovie.TmdbId}`);
            }
          }
        } catch (err) {
          debugLog("BG", "CHECK: Radarr cross-reference failed", err);
        }
      }

      // TMDB API fallback (requires user API key)
      if (!item) {
        try {
          const options = await loadOptions();
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

function getIconPaths(state: IconState): Record<string, string> {
  return {
    "16": `/icons/${state}-16.png`,
    "32": `/icons/${state}-32.png`,
    "48": `/icons/${state}-48.png`,
    "128": `/icons/${state}-128.png`,
  };
}

function sendRatingsToTab(tabId: number, info: TabMediaInfo) {
  if (hasAnyRatings(info)) {
    browser.tabs.sendMessage(tabId, {
      type: "RATINGS_READY",
      tmdbRating: info.tmdbRating,
      imdbRating: info.imdbRating,
      rtRating: info.rtRating,
      metacriticRating: info.metacriticRating,
      traktRating: info.traktRating,
      tvdbRating: info.tvdbRating,
    }).catch(() => debugLog("BG", "RATINGS: content script not listening"));
  }
}

/** Try Radarr proxy for movie metadata. Returns true if successful. */
async function tryRadarrMovieMetadata(info: TabMediaInfo): Promise<boolean> {
  let movie: RadarrMovie | null = null;

  if (info.tmdbId) {
    debugLog("BG", `META: trying Radarr for tmdb:${info.tmdbId}`);
    movie = await getRadarrMovie(info.tmdbId);
  } else if (info.source === "imdb") {
    debugLog("BG", `META: trying Radarr for imdb:${info.id}`);
    movie = await getRadarrMovieByImdb(info.id);
  } else if (info.source === "title") {
    const parts = info.id.split("|");
    const query = parts[0];
    const year = parts[1] ? parseInt(parts[1], 10) : undefined;
    debugLog("BG", `META: trying Radarr search for "${query}" year:${year ?? "none"}`);
    movie = await searchRadarrMovie(query, year);
    if (!movie && year) movie = await searchRadarrMovie(query);
  }

  if (!movie) return false;

  applyRadarrMetadata(info, movie);

  // Collection summary via Radarr
  if (movie.Collection?.TmdbId && movie.Collection.TmdbId > 0) {
    try {
      const radarrColl = await getRadarrCollection(movie.Collection.TmdbId);
      if (radarrColl && radarrColl.Movies) {
        const index = await loadIndex();
        let ownedCount = 0;
        for (const part of radarrColl.Movies) {
          if (index && index.movies.byTmdbId[String(part.TmdbId)] !== undefined) ownedCount++;
        }
        info.collectionName = radarrColl.Title;
        info.collectionOwned = ownedCount;
        info.collectionTotal = radarrColl.Movies.length;
      }
    } catch (err) {
      errorLog("BG", "Radarr collection fetch failed", err);
    }
  }

  return true;
}

/** Try Sonarr proxy for TV show metadata. Returns true if successful. */
async function trySonarrShowMetadata(info: TabMediaInfo): Promise<boolean> {
  let show: SonarrShow | null = null;

  if (info.tvdbId) {
    debugLog("BG", `META: trying Sonarr for tvdb:${info.tvdbId}`);
    show = await getSonarrShow(info.tvdbId);
  } else if (info.source === "title") {
    const parts = info.id.split("|");
    const query = parts[0];
    debugLog("BG", `META: trying Sonarr search for "${query}"`);
    const results = await searchSonarrShow(query);
    if (results && results.length > 0) show = results[0];
  } else if (info.imdbId) {
    // Use TVMaze to bridge IMDb → TVDB, then call Sonarr
    try {
      const ext = await lookupByImdb(info.imdbId);
      if (ext?.tvdbId) {
        debugLog("BG", `META: trying Sonarr via TVMaze bridge tvdb:${ext.tvdbId}`);
        show = await getSonarrShow(ext.tvdbId);
      }
    } catch { /* TVMaze bridge non-critical */ }
  }

  if (!show) return false;

  applySonarrMetadata(info, show);
  return true;
}

async function fetchTabMetadata(tabId: number, info: TabMediaInfo) {
  try {
    const options = await loadOptions();
    debugLog("BG", `META: enriching ${info.mediaType} ${info.source}:${info.id} (owned:${info.owned})`);

    let proxyHandled = false;

    // --- Community proxy path (tried first if enabled) ---
    if (options.useCommunityProxies) {
      if (info.mediaType === "movie") {
        proxyHandled = await tryRadarrMovieMetadata(info);
        if (proxyHandled) debugLog("BG", "META: Radarr proxy provided movie metadata");
      } else {
        proxyHandled = await trySonarrShowMetadata(info);
        if (proxyHandled) debugLog("BG", "META: Sonarr proxy provided show metadata");
      }
    }

    // --- Fallback: resolve TMDB ID via user keys ---
    let tmdbId = info.tmdbId;
    if (!proxyHandled && options.tmdbApiKey) {
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

    // --- Fallback: TMDB/TVDB key-based metadata (if proxy didn't handle it) ---
    if (!proxyHandled) {
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
    }

    // Resolve IMDb ID if still missing (needed for OMDb fallback)
    // Proxy may return metadata without an ImdbId (e.g. duplicate TMDB entries)
    if (!info.imdbId && options.tmdbApiKey && info.tmdbId && info.mediaType === "movie") {
      try {
        debugLog("BG", `META: resolving IMDb ID via TMDB getMovie for ${info.tmdbId}`);
        const details = await getMovie(options.tmdbApiKey, info.tmdbId);
        if (details.imdb_id) {
          info.imdbId = details.imdb_id;
          debugLog("BG", `META: resolved IMDb ID → ${info.imdbId}`);
        }
      } catch {
        debugLog("BG", `META: TMDB getMovie failed for IMDb resolution`);
      }
    }

    // OMDb: fetch IMDb rating if we have an IMDb ID and OMDb key (and Radarr didn't already provide it)
    if (options.omdbApiKey && info.imdbId && !info.imdbRating) {
      try {
        debugLog("BG", `META: calling OMDb getImdbRating for ${info.imdbId}`);
        const imdbRating = await getImdbRating(options.omdbApiKey, info.imdbId);
        debugLog("BG", `META: OMDb returned ${imdbRating} for ${info.imdbId}`);
        if (imdbRating !== null) info.imdbRating = imdbRating;
      } catch (err) {
        debugLog("BG", `META: OMDb fetch failed for ${info.imdbId}`, err);
      }
    }

    // For TV shows enriched via Sonarr: supplement with TMDB rating if user has key
    if (proxyHandled && info.mediaType === "show" && !info.tmdbRating && options.tmdbApiKey && tmdbId) {
      try {
        const details = await getTvShow(options.tmdbApiKey, tmdbId);
        if (details.vote_average) info.tmdbRating = details.vote_average;
      } catch { /* TMDB supplement non-critical */ }
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
    await browser.action.setIcon({ path: getIconPaths(state), tabId });
  } catch (err) {
    errorLog("BG", "failed to set tab icon", err);
  }
}

export default defineBackground(() => {
  // Set default inactive icon on startup
  const manifest = browser.runtime.getManifest();
  debugLog("BG", `v${manifest.version} service worker starting`);
  try {
    browser.action.setIcon({ path: getIconPaths("inactive") });
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
            const statusOptions = await loadOptions();
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
            cachedOpts = null; // invalidate cached options
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
              const options = await loadOptions();
              const useTvdb = message.source === "tvdb" && !!options.tvdbApiKey;
              const useSonarr = options.useCommunityProxies;

              // Need at least one data source
              if (!useTvdb && !options.tmdbApiKey && !useSonarr) {
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

              const serverFetches = servers
                .filter(s => ownedShow.plexKeys[s.id])
                .map(async (server) => {
                  try {
                    return { server, result: await fetchShowEpisodes(server, ownedShow.plexKeys[server.id]) };
                  } catch (err) {
                    errorLog("BG", `failed to fetch episodes from server ${server.name}`, err);
                    return null;
                  }
                });
              for (const outcome of await Promise.all(serverFetches)) {
                if (!outcome) continue;
                for (const ep of outcome.result.episodes) {
                  ownedSet.add(`S${ep.seasonNumber}E${ep.episodeNumber}`);
                }
                if (!latestResolution && outcome.result.latestResolution) {
                  latestResolution = outcome.result.latestResolution;
                }
              }

              if (ownedSet.size === 0) {
                // Couldn't fetch from any server
                sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
                break;
              }

              const today = new Date().toLocaleDateString("en-CA");
              let seasonGaps: SeasonGapInfo[];
              let showTitle: string;

              // --- Sonarr path: free episode data via community proxy ---
              let sonarrHandled = false;
              if (useSonarr) {
                // Determine TVDB ID for Sonarr lookup
                const tvdbIdForSonarr = message.source === "tvdb"
                  ? parseInt(message.id, 10)
                  : ownedShow.tvdbId;

                if (tvdbIdForSonarr) {
                  debugLog("BG", `EPISODES: trying Sonarr for tvdb:${tvdbIdForSonarr}`);
                  const sonarrShow = await getSonarrShow(tvdbIdForSonarr);
                  if (sonarrShow?.episodes?.length) {
                    showTitle = sonarrShow.title;

                    // Group episodes by season
                    const bySeason = new Map<number, typeof sonarrShow.episodes>();
                    for (const ep of sonarrShow.episodes) {
                      if (options.excludeSpecials && ep.seasonNumber === 0) continue;
                      const key = `S${ep.seasonNumber}E${ep.episodeNumber}`;
                      if (options.excludeFuture && !ownedSet.has(key) && (!ep.airDate || ep.airDate >= today)) continue;
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
                        const key = `S${ep.seasonNumber}E${ep.episodeNumber}`;
                        if (ownedSet.has(key)) {
                          ownedCount++;
                        } else {
                          missing.push({
                            number: ep.episodeNumber,
                            name: ep.title ?? `Episode ${ep.episodeNumber}`,
                            airDate: ep.airDate ?? undefined,
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

                    sonarrHandled = true;
                    debugLog("BG", `EPISODES: using Sonarr for tvdb:${tvdbIdForSonarr}`);
                  }
                }
              }

              if (!sonarrHandled && useTvdb) {
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
              } else if (!sonarrHandled) {
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
              const options = await loadOptions();
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
                const searcher = message.mediaType === "show" ? searchTv : searchMovie;
                tmdbId = await searcher(options.tmdbApiKey, query, year);
                // Retry without year if no match
                if (!tmdbId && year) {
                  tmdbId = await searcher(options.tmdbApiKey, query);
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
              const options = await loadOptions();
              const movieId = parseInt(message.tmdbMovieId, 10);

              // Resolve collection ID + parts list (Radarr proxy first, TMDB fallback)
              let collectionName: string | undefined;
              let collParts: { tmdbId: number; title: string; year?: number; releaseDate?: string }[] | null = null;

              // --- Radarr proxy path (free, no key) ---
              if (options.useCommunityProxies) {
                const radarrMovie = await getRadarrMovie(movieId);
                if (radarrMovie?.Collection?.TmdbId) {
                  const radarrColl = await getRadarrCollection(radarrMovie.Collection.TmdbId);
                  if (radarrColl && radarrColl.Movies.length > 0) {
                    collectionName = radarrColl.Title;
                    collParts = radarrColl.Movies.map(m => ({
                      tmdbId: m.TmdbId,
                      title: m.Title,
                      year: m.Year,
                      releaseDate: undefined, // Radarr doesn't provide exact release dates
                    }));
                    debugLog("BG", `COLLECTION: resolved via Radarr — ${collectionName} (${collParts.length} movies)`);
                  }
                }
              }

              // --- TMDB fallback (requires API key) ---
              if (!collParts && options.tmdbApiKey) {
                const movieData = await getMovie(options.tmdbApiKey, movieId);
                if (!movieData.belongs_to_collection) {
                  sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
                  break;
                }

                const collectionId = movieData.belongs_to_collection.id;
                let collection = await getCachedCollection(collectionId);
                if (!collection) {
                  collection = await getCollection(options.tmdbApiKey, collectionId);
                  await saveCachedCollection(collection);
                }

                collectionName = collection.name;
                collParts = collection.parts.map(p => ({
                  tmdbId: p.id,
                  title: p.title,
                  year: p.release_date ? parseInt(p.release_date.slice(0, 4), 10) : undefined,
                  releaseDate: p.release_date || undefined,
                }));
              }

              if (!collParts || !collectionName) {
                sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
                break;
              }

              // Filter parts based on options
              const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
              const todayYear = parseInt(today.slice(0, 4), 10);
              let parts = collParts;
              if (options.excludeFuture) {
                parts = parts.filter((m) => {
                  if (m.releaseDate) return m.releaseDate <= today;
                  if (m.year) return m.year <= todayYear;
                  return true; // include if no date info
                });
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
                const tmdbId = String(part.tmdbId);
                const itemIdx = index?.movies.byTmdbId[tmdbId];

                if (itemIdx !== undefined && index) {
                  const ownedItem = index.items[itemIdx];
                  const plexResult = resolveItemPlex(ownedItem, servers);
                  ownedMovies.push({
                    title: part.title,
                    year: part.year,
                    plexUrl: plexResult?.url,
                  });
                } else {
                  missingMovies.push({
                    title: part.title,
                    releaseDate: part.releaseDate,
                    tmdbId: part.tmdbId,
                  });
                }
              }

              // Apply minOwned filter
              if (ownedMovies.length < options.minOwned) {
                sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
                break;
              }

              debugLog("BG",
                `COLLECTION: ${collectionName} — ${ownedMovies.length}/${parts.length} owned, ${missingMovies.length} missing`,
              );

              sendResponse({
                hasCollection: true,
                collection: {
                  name: collectionName,
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
