import { getServers, saveServers, getLibraryIndex, saveLibraryIndex, getOptions, saveOptions, getCachedCollection, saveCachedCollection, getCachedEpisodeGaps, saveCachedEpisodeGaps, clearMetadataCaches, getUpdateCheck } from "../common/storage";
import { testConnection, buildLibraryIndex, fetchShowEpisodes, formatResolution } from "../api/plex";
import { getMovie, getCollection, getTvShow, getTvSeason, findByTvdbId, findByImdbId, searchMovie, searchTv } from "../api/tmdb";
import { getSeriesEpisodes, getSeriesDetails, validateTvdbKey } from "../api/tvdb";
import { getTvMazeExternals, lookupByImdb, lookupByTvdb } from "../api/tvmaze";
import { getImdbRating, validateOmdbKey } from "../api/omdb";
import { fetchServerConnections, pickRemoteUrl } from "../api/plex-tv";
import { getRadarrMovie, getRadarrMovieByImdb, getRadarrCollection, searchRadarrMovie } from "../api/radarr";
import type { RadarrMovie } from "../api/radarr";
import { getSonarrShow, searchSonarrShow } from "../api/sonarr";
import type { SonarrShow } from "../api/sonarr";
import { fetchWithTimeout } from "../common/fetch-timeout";
import { debugLog, errorLog } from "../common/logger";
import { isNewerVersion, maybeCheckForUpdate, checkForUpdate } from "./bg/version";
import { resolveItemPlex, lookupItem } from "./bg/library";
import { applyRadarrMetadata, applySonarrMetadata, hasAnyRatings } from "./bg/metadata";
import { computeSeasonGaps, episodeKey, type GapEpisode } from "./bg/season-gaps";
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
  FetchRemoteUrlResponse,
  CheckForUpdateResponse,
  StorageUsageResponse,
  TabMediaInfo,
  TabMediaResponse,
  LibraryIndex,
  OwnedItem,
  PlexServerConfig,
} from "../common/types";
import { INDEX_SCHEMA_VERSION } from "../common/types";

let cachedIndex: LibraryIndex | null = null;
let cachedServers: PlexServerConfig[] | null = null;
let cachedOpts: import("../common/types").ParrotOptions | null = null;
let autoRefreshing = false;
const tabMediaCache = new Map<number, TabMediaInfo>();

// Reverse lookup: "serverId:ratingKey" → index into items[] (built lazily from cachedIndex)
let plexKeyMap: Map<string, number> | null = null;
let movieIndexSet: Set<number> | null = null;


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

// Monotonic per-tab CHECK generation. Each CHECK bumps it; the enrichment it
// spawns captures the value and re-verifies before any late write or notify.
// Without this, a slow enrichment chain from the previous page (SPA nav) could
// overwrite the new page's tabMedia and restyle the wrong badge.
const tabCheckGeneration = new Map<number, number>();

function bumpTabGeneration(tabId: number): number {
  const gen = (tabCheckGeneration.get(tabId) ?? 0) + 1;
  tabCheckGeneration.set(tabId, gen);
  return gen;
}

// Per-tab session keys ("tm:{tabId}") instead of one shared map: concurrent
// CHECKs from different tabs previously interleaved read-modify-write on the
// single key and could drop each other's entries. Per-key writes can't.
// Closed tabs are cleaned up by the tabs.onRemoved listener; session storage
// itself is cleared by the browser at end of session.
function tabMediaKey(tabId: number): string {
  return `tm:${tabId}`;
}

async function persistTabMedia(tabId: number, info: TabMediaInfo) {
  tabMediaCache.set(tabId, info);
  try {
    await browser.storage.session.set({ [tabMediaKey(tabId)]: info });
  } catch (err) {
    debugLog("BG", "session write failed for tabMedia", err);
  }
}

async function getTabMedia(tabId: number): Promise<TabMediaInfo | null> {
  const cached = tabMediaCache.get(tabId);
  if (cached) return cached;
  try {
    const key = tabMediaKey(tabId);
    const info = (await browser.storage.session.get(key))[key] as TabMediaInfo | undefined;
    if (info) {
      tabMediaCache.set(tabId, info);
      return info;
    }
  } catch (err) {
    debugLog("BG", "session read failed for tabMedia", err);
  }
  return null;
}

async function removeTabMedia(tabId: number) {
  tabMediaCache.delete(tabId);
  try {
    await browser.storage.session.remove(tabMediaKey(tabId));
  } catch (err) {
    debugLog("BG", "session remove failed for tabMedia", err);
  }
}

function setIndex(index: LibraryIndex | null) {
  cachedIndex = index;
  plexKeyMap = null; // invalidate reverse lookups
  movieIndexSet = null;
}

async function loadIndex(): Promise<LibraryIndex | null> {
  if (!cachedIndex) {
    const loaded = await getLibraryIndex();
    setIndex(loaded);
    if (loaded) {
      const movieTmdb = Object.keys(loaded.movies.byTmdbId).length;
      const movieImdb = Object.keys(loaded.movies.byImdbId).length;
      const showTvdb = Object.keys(loaded.shows.byTvdbId).length;
      const showTmdb = Object.keys(loaded.shows.byTmdbId).length;
      const showImdb = Object.keys(loaded.shows.byImdbId).length;
      debugLog("BG",
        `loaded index — movies: ${movieTmdb} tmdb / ${movieImdb} imdb, shows: ${showTvdb} tvdb / ${showTmdb} tmdb / ${showImdb} imdb`,
      );
    } else {
      debugLog("BG", "no index found in storage");
    }
  }

  // Auto-refresh if stale or built by an older schema version (fire-and-forget;
  // the current index keeps serving lookups while the rebuild runs).
  if (cachedIndex && !autoRefreshing) {
    // Schema mismatch always rebuilds, regardless of the autoRefresh option —
    // the stored index was built by code with different semantics (e.g. changed
    // title normalization) and would silently mis-match until the next refresh.
    const schemaOutdated = cachedIndex.schemaVersion !== INDEX_SCHEMA_VERSION;
    let due = schemaOutdated;
    let reason = `schema v${cachedIndex.schemaVersion ?? 1} → v${INDEX_SCHEMA_VERSION}`;

    if (!due) {
      const options = await loadOptions();
      if (options.autoRefresh) {
        const ageMs = Date.now() - (cachedIndex.lastRefresh ?? 0);
        const thresholdMs = options.autoRefreshDays * 24 * 60 * 60 * 1000;
        if (ageMs >= thresholdMs) {
          due = true;
          reason = `index is ${Math.floor(ageMs / 86400000)}d old`;
        }
      }
    }

    if (due) {
      autoRefreshing = true;
      loadServers().then(async (servers) => {
        if (servers.length === 0) { autoRefreshing = false; return; }
        try {
          debugLog("BG", `auto-refresh — ${reason}, refreshing`);
          const newIndex = await buildLibraryIndex(servers);
          await saveLibraryIndex(newIndex);
          setIndex(newIndex);
          debugLog("BG", `auto-refresh complete — ${newIndex.itemCount} items`);
        } catch (err) {
          errorLog("BG", "auto-refresh failed", err);
        } finally {
          autoRefreshing = false;
        }
      }).catch((err: unknown) => {
        autoRefreshing = false;
        errorLog("BG", "auto-refresh failed to load servers", err);
      });
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
    item = await lookupWithCrossRefs(index, message.mediaType, message.source, message.id);
  }

  // IMDb ambiguity: an IMDb ID can refer to a movie OR a show. If the
  // requested type missed (including all its cross-refs), retry with the
  // opposite type so a single CHECK can resolve either. resolvedMediaType
  // tells the caller which type actually matched, so it can pick the right
  // gap-detection path without needing to fire a second CHECK.
  let resolvedMediaType: "movie" | "show" | undefined;
  if (!item && message.source === "imdb") {
    const opposite: "movie" | "show" = message.mediaType === "movie" ? "show" : "movie";
    debugLog("BG", `CHECK: ${message.mediaType} miss, retrying as ${opposite} for imdb:${message.id}`);
    item = await lookupWithCrossRefs(index, opposite, "imdb", message.id);
    if (item) resolvedMediaType = opposite;
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
    resolvedMediaType,
  };
}

/**
 * Direct index lookup for a single (mediaType, source, id) tuple, with all
 * the cross-reference fallbacks (TVMaze bridge, Radarr proxy, TMDB API) used
 * when the direct lookup misses. Returns the OwnedItem or undefined.
 *
 * Called twice by handleCheck for IMDb sources — once with the requested
 * mediaType, once with the opposite — so it must be self-contained and
 * idempotent.
 */
async function lookupWithCrossRefs(
  index: LibraryIndex,
  mediaType: "movie" | "show",
  source: "tmdb" | "imdb" | "tvdb" | "title",
  id: string,
): Promise<OwnedItem | undefined> {
  debugLog("BG", `CHECK: direct index lookup ${mediaType} ${source}:${id}`);
  let item = lookupItem(index, mediaType, source, id);
  if (item) return item;
  if (source === "tmdb" || source === "title") return undefined;

  // TVMaze bridge (free, no key): IMDb ↔ TVDB for shows
  if (mediaType === "show") {
    try {
      debugLog("BG", `CHECK: calling TVMaze cross-ref for ${source}:${id}`);
      const ext = source === "imdb"
        ? await lookupByImdb(id)
        : source === "tvdb"
          ? await lookupByTvdb(id)
          : null;
      if (ext) {
        debugLog("BG", `CHECK: TVMaze resolved → tvdb:${ext.tvdbId ?? "none"} imdb:${ext.imdbId ?? "none"}`);
        if (ext.tvdbId && source !== "tvdb") {
          item = lookupItem(index, "show", "tvdb", String(ext.tvdbId));
          if (item) { debugLog("BG", `CHECK: found via TVMaze cross-ref → TVDB:${ext.tvdbId}`); return item; }
        }
        if (ext.imdbId && source !== "imdb") {
          item = lookupItem(index, "show", "imdb", ext.imdbId);
          if (item) { debugLog("BG", `CHECK: found via TVMaze cross-ref → IMDb:${ext.imdbId}`); return item; }
        }
      }
    } catch (err) {
      debugLog("BG", "CHECK: TVMaze cross-reference failed", err);
    }
  }

  // Radarr proxy cross-reference for movies (free, no key)
  if (mediaType === "movie" && source === "imdb") {
    try {
      const options = await loadOptions();
      if (options.useCommunityProxies) {
        debugLog("BG", `CHECK: calling Radarr proxy for imdb:${id}`);
        const radarrMovie = await getRadarrMovieByImdb(id);
        if (radarrMovie?.TmdbId) {
          item = lookupItem(index, "movie", "tmdb", String(radarrMovie.TmdbId));
          if (item) { debugLog("BG", `CHECK: found via Radarr cross-ref → TMDB:${radarrMovie.TmdbId}`); return item; }
        }
      }
    } catch (err) {
      debugLog("BG", "CHECK: Radarr cross-reference failed", err);
    }
  }

  // TMDB API fallback (requires user API key)
  try {
    const options = await loadOptions();
    if (options.tmdbApiKey) {
      debugLog("BG", `CHECK: calling TMDB ${source === "imdb" ? "findByImdbId" : "findByTvdbId"} for ${id}`);
      // TMDB movie and TV IDs are separate numeric namespaces — constrain the
      // /find result to the mediaType we're resolving for, or a movie's TMDB
      // id could be looked up in shows.byTmdbId (false OWNED on collision).
      const tmdbId = source === "imdb"
        ? await findByImdbId(options.tmdbApiKey, id, mediaType)
        : await findByTvdbId(options.tmdbApiKey, id);
      if (tmdbId) {
        item = lookupItem(index, mediaType, "tmdb", String(tmdbId));
        if (item) { debugLog("BG", `CHECK: found via TMDB cross-ref → TMDB:${tmdbId}`); return item; }
      }
    }
  } catch (err) {
    debugLog("BG", "CHECK: TMDB cross-reference failed", err);
  }

  return undefined;
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

async function fetchTabMetadata(tabId: number, info: TabMediaInfo, generation: number) {
  // True when a newer CHECK has run for this tab — all external effects
  // (persist, icon, messages) must be skipped so we don't clobber its state.
  const isStale = () => tabCheckGeneration.get(tabId) !== generation;
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
    if (!info.owned && tmdbId && !isStale()) {
      const index = await loadIndex();
      if (index) {
        const map = info.mediaType === "movie" ? index.movies.byTmdbId : index.shows.byTmdbId;
        const itemIdx = map[String(tmdbId)];
        if (itemIdx !== undefined) {
          const item = index.items[itemIdx];
          const servers = await loadServers();
          if (isStale()) return; // re-check: loadIndex/loadServers awaited above
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
          if (!isStale()) await persistTabMedia(tabId, info);
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

    if (isStale()) {
      debugLog("BG", `META: discarding stale enrichment for ${info.source}:${info.id} (tab ${tabId} moved on)`);
      return;
    }
    await persistTabMedia(tabId, info);
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

/** Set or clear the global "!" badge based on update availability. */
async function refreshUpdateBadge(): Promise<void> {
  try {
    const updateCheck = await getUpdateCheck();
    const currentVersion = browser.runtime.getManifest().version;
    const available = updateCheck ? isNewerVersion(updateCheck.latestVersion, currentVersion) : false;
    if (available) {
      await browser.action.setBadgeText({ text: "!" });
      await browser.action.setBadgeBackgroundColor({ color: "#ebaf00" });
    } else {
      await browser.action.setBadgeText({ text: "" });
    }
  } catch (err) {
    errorLog("BG", "failed to update badge text", err);
  }
}

export default defineBackground(() => {
  // Set default inactive icon on startup
  const manifest = browser.runtime.getManifest();
  debugLog("BG", `v${manifest.version} service worker starting`);
  // setIcon rejects asynchronously — a sync try/catch around it catches nothing
  browser.action.setIcon({ path: getIconPaths("inactive") }).catch((err: unknown) => {
    errorLog("BG", "failed to set default icon", err);
  });

  // Check for extension updates (fire-and-forget), then refresh badge
  maybeCheckForUpdate().then(() => refreshUpdateBadge()).catch((err) => debugLog("BG", "startup update check failed", err));
  // Also reconcile badge against any cached check (covers cold start when no new check was needed)
  void refreshUpdateBadge();

  // Clear all derived metadata caches on extension update — cached entries
  // must never bake in parsing/logic from an older version. (The library
  // index self-heals via its schemaVersion check in loadIndex.)
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "update") {
      clearMetadataCaches().then(() => {
        debugLog("BG", "metadata caches cleared after extension update");
      }).catch((err) => debugLog("BG", "metadata cache clear failed", err));
      // Clear the "!" badge since we've reached or passed the previously-seen latest version
      void refreshUpdateBadge();
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

          case "FETCH_REMOTE_URL": {
            try {
              const resources = await fetchServerConnections(message.token);
              const remoteUrl = pickRemoteUrl(resources, message.machineIdentifier);
              debugLog("BG", `FETCH_REMOTE_URL for ${message.machineIdentifier} → ${remoteUrl ?? "none"}`);
              sendResponse({ remoteUrl } satisfies FetchRemoteUrlResponse);
            } catch (err) {
              errorLog("BG", "FETCH_REMOTE_URL failed", err);
              sendResponse({ remoteUrl: null, error: "Discovery failed" } satisfies FetchRemoteUrlResponse);
            }
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
              updateAssetUrl: updateCheck?.assetUrl,
            } satisfies StatusResponse);
            break;
          }

          case "CHECK_FOR_UPDATE": {
            await checkForUpdate();
            const refreshed = await getUpdateCheck();
            const currentVersion = browser.runtime.getManifest().version;
            const updateAvailable = refreshed
              ? isNewerVersion(refreshed.latestVersion, currentVersion)
              : false;
            await refreshUpdateBadge();
            sendResponse({
              updateAvailable,
              latestVersion: refreshed?.latestVersion,
              currentVersion,
              updateUrl: refreshed?.downloadUrl,
              updateAssetUrl: refreshed?.assetUrl,
            } satisfies CheckForUpdateResponse);
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
                // For IMDb sources, prefer the type actually resolved by handleCheck
                // (movie vs show) over the type the content script requested.
                mediaType: result.resolvedMediaType ?? message.mediaType,
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
              await persistTabMedia(tabId, mediaInfo);
              // Fire-and-forget metadata fetch. Bumping the generation first
              // invalidates any still-running enrichment from a previous CHECK
              // on this tab (SPA navigation) so it can't overwrite this one.
              const generation = bumpTabGeneration(tabId);
              fetchTabMetadata(tabId, mediaInfo, generation).catch((err) =>
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
              const res = await fetchWithTimeout(
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
                  ownedSet.add(episodeKey(ep.seasonNumber, ep.episodeNumber));
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

              const gapOptions = {
                excludeSpecials: options.excludeSpecials,
                excludeFuture: options.excludeFuture,
              };
              // Initialized here because TS can't prove one of the three data
              // paths below always assigns (the sonarrHandled flag hides it).
              let seasonGaps: SeasonGapInfo[] = [];
              let showTitle: string = ownedShow.title;

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
                    seasonGaps = computeSeasonGaps(
                      sonarrShow.episodes.map((ep) => ({
                        seasonNumber: ep.seasonNumber,
                        episodeNumber: ep.episodeNumber,
                        name: ep.title,
                        airDate: ep.airDate,
                      })),
                      ownedSet,
                      gapOptions,
                    );
                    sonarrHandled = true;
                    debugLog("BG", `EPISODES: using Sonarr for tvdb:${tvdbIdForSonarr}`);
                  }
                }
              }

              if (!sonarrHandled && useTvdb) {
                // --- TVDB path: one paginated call for all episodes ---
                const allEpisodes = await getSeriesEpisodes(options.tvdbApiKey, message.id);
                seasonGaps = computeSeasonGaps(
                  allEpisodes.map((ep) => ({
                    seasonNumber: ep.seasonNumber,
                    episodeNumber: ep.number,
                    name: ep.name ?? undefined,
                    airDate: ep.aired ?? undefined,
                  })),
                  ownedSet,
                  gapOptions,
                );
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
                  // Filter here too (not just in computeSeasonGaps) to skip
                  // the per-season network fetch for specials.
                  seasons = seasons.filter((s) => s.season_number !== 0);
                }

                const tmdbEpisodes: GapEpisode[] = [];
                for (const season of seasons) {
                  if (season.episode_count === 0) continue;
                  const tmdbSeason = await getTvSeason(options.tmdbApiKey, tmdbId, season.season_number);
                  for (const ep of tmdbSeason.episodes) {
                    tmdbEpisodes.push({
                      seasonNumber: season.season_number,
                      episodeNumber: ep.episode_number,
                      name: ep.name,
                      airDate: ep.air_date ?? undefined,
                    });
                  }
                }
                seasonGaps = computeSeasonGaps(tmdbEpisodes, ownedSet, gapOptions);

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
                  await persistTabMedia(epTabId, existingMedia);
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
              } else if (message.source === "imdb") {
                // Constrain to the caller's mediaType — TMDB movie and TV IDs
                // are separate namespaces, so an unconstrained /find could hand
                // a show gap-check a movie id (or vice versa).
                tmdbId = await findByImdbId(options.tmdbApiKey, message.id, message.mediaType);
              } else {
                tmdbId = await findByTvdbId(options.tmdbApiKey, message.id);
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
                  const radarrMovies = radarrColl?.Movies ?? [];
                  if (radarrColl && radarrMovies.length > 0) {
                    collectionName = radarrColl.Title;
                    collParts = radarrMovies.map(m => ({
                      tmdbId: m.TmdbId,
                      title: m.Title,
                      year: m.Year,
                      releaseDate: undefined, // Radarr doesn't provide exact release dates
                    }));
                    debugLog("BG", `COLLECTION: resolved via Radarr — ${collectionName} (${collParts.length} movies)`);
                  } else if (radarrColl) {
                    debugLog("BG", `COLLECTION: Radarr returned collection ${radarrColl.TmdbId} with no Movies — falling through to TMDB if available`);
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

          default: {
            // Unknown/future message type — respond immediately so the
            // sender's await doesn't hang until the SW unloads.
            errorLog("BG", `unknown message type: ${(message as { type?: string }).type}`);
            sendResponse({ error: "Unknown message type" });
            break;
          }
        }
      })().catch((err) => {
        // Top-level guard: without this, a throw inside any handler that
        // lacks its own try/catch leaves sendResponse uncalled and the
        // sender's await hanging until the service worker unloads.
        errorLog("BG", `unhandled error in ${message.type} handler`, err);
        try {
          sendResponse({ error: String(err) });
        } catch {
          // channel already closed — nothing to do
        }
      });
      return true; // keep message channel open for async response
    },
  );

  // Clean up stale tab media cache entries
  browser.tabs.onRemoved.addListener((tabId) => {
    void removeTabMedia(tabId); // has its own catch
    tabCheckGeneration.delete(tabId);
  });

  // Invalidate in-memory caches when synced storage changes — covers saves
  // from this device AND changes arriving via storage.sync from another
  // profile/machine (SAVE_OPTIONS only covers the former).
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.plexServers) {
      cachedServers = null;
    }
    if (areaName === "sync" && changes.parrotOptions) {
      cachedOpts = null;
    }
  });
});
