import type {
  PlexServerConfig,
  PlexSection,
  OwnedItem,
  ExternalIds,
  LibraryIndex,
} from "../common/types";
import { buildTitleKey, parseTitleFromH1 } from "../common/normalize";
import { debugLog } from "../common/logger";

/** Connection config — either a full PlexServerConfig or an ad-hoc test pair. */
type PlexConnConfig = { serverUrl: string; remoteUrl?: string; token: string; id?: string };

// 30s is enough for /library/sections/{id}/all?includeGuids=1 on a large
// library (10k+ items can take 15-25s even over LAN). Short enough that
// the worst-case fallback (serverUrl hangs, remoteUrl also hangs) is still
// bearable — and the session-memo means the user only pays it once per
// service worker lifetime.
const PER_ATTEMPT_TIMEOUT_MS = 30000;

/**
 * Session-sticky memo of the working URL per server. Cleared when service worker
 * unloads, so re-probing happens naturally on cold start (e.g. after laptop wake).
 */
const lastWorkingUrl = new Map<string, string>();

/** Reset the URL memo — used by tests and when a server config changes. */
export function _resetUrlMemo(): void {
  lastWorkingUrl.clear();
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

async function fetchAttempt(baseUrl: string, path: string, token: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);
  try {
    return await fetch(`${stripTrailingSlash(baseUrl)}${path}`, {
      headers: { Accept: "application/json", "X-Plex-Token": token },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a Plex API path, trying the session-memoized URL first, then the
 * configured serverUrl, then the optional remoteUrl. The first attempt that
 * returns a Response (even non-2xx) is returned; only network/timeout errors
 * trigger fallback. On success, the working URL is memoized for the session.
 */
async function plexFetch(config: PlexConnConfig, path: string): Promise<Response> {
  const candidates: string[] = [];
  const memoKey = config.id;
  const memoUrl = memoKey ? lastWorkingUrl.get(memoKey) : undefined;
  if (memoUrl) candidates.push(memoUrl);
  if (config.serverUrl && !candidates.includes(config.serverUrl)) candidates.push(config.serverUrl);
  if (config.remoteUrl && !candidates.includes(config.remoteUrl)) candidates.push(config.remoteUrl);

  let lastError: unknown;
  for (const url of candidates) {
    try {
      const res = await fetchAttempt(url, path, config.token);
      if (memoKey) lastWorkingUrl.set(memoKey, url);
      return res;
    } catch (err) {
      lastError = err;
      debugLog("Plex", `attempt failed for ${url}${path}:`, err);
      // Drop a stale memo so the next candidate gets tried fresh
      if (memoKey && lastWorkingUrl.get(memoKey) === url) lastWorkingUrl.delete(memoKey);
    }
  }
  throw lastError ?? new Error("No Plex URL configured");
}

// --- Resolution helpers ---

const RESOLUTION_PRIORITY: Record<string, number> = {
  sd: 1, "480": 2, "720": 3, "1080": 4, "4k": 5,
};

/** Format raw Plex videoResolution for display: "480"→"480p", "4k"→"4K" */
export function formatResolution(raw: string): string {
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "4k") return "4K";
  if (lower === "sd") return "SD";
  return `${raw}p`;
}

/** Pick the highest resolution from a Plex Media array */
function pickHighestResolution(
  mediaArray: Array<{ videoResolution?: string }>,
): string | undefined {
  let best: string | undefined;
  let bestPriority = -1;
  for (const media of mediaArray) {
    if (!media.videoResolution) continue;
    const p = RESOLUTION_PRIORITY[media.videoResolution.toLowerCase()] ?? 0;
    if (p > bestPriority) {
      bestPriority = p;
      best = media.videoResolution;
    }
  }
  return best;
}

export async function testConnection(
  config: PlexConnConfig,
): Promise<{ success: boolean; error?: string; libraryCount?: number; machineIdentifier?: string; friendlyName?: string }> {
  try {
    const res = await plexFetch(config, "/library/sections");
    if (!res.ok) {
      if (res.status === 401) {
        return { success: false, error: "Authentication failed — check your token" };
      }
      return { success: false, error: `Server returned ${res.status}` };
    }
    const data = await res.json();
    const sections = data.MediaContainer?.Directory ?? [];

    // Fetch machineIdentifier and friendlyName from server identity
    let machineIdentifier: string | undefined;
    let friendlyName: string | undefined;
    try {
      const idRes = await plexFetch(config, "/");
      if (idRes.ok) {
        const idData = await idRes.json();
        machineIdentifier = idData.MediaContainer?.machineIdentifier;
        friendlyName = idData.MediaContainer?.friendlyName;
      }
    } catch {
      // Non-critical — deep links just won't work
    }

    return { success: true, libraryCount: sections.length, machineIdentifier, friendlyName };
  } catch {
    return { success: false, error: "Could not reach server — check URL" };
  }
}

export async function fetchLibrarySections(
  config: PlexConnConfig,
): Promise<PlexSection[]> {
  const res = await plexFetch(config, "/library/sections");
  if (!res.ok) throw new Error(`Plex API error: ${res.status}`);
  const data = await res.json();
  const dirs: Array<{ key: string; title: string; type: string }> =
    data.MediaContainer?.Directory ?? [];
  return dirs
    .filter((d) => d.type === "movie" || d.type === "show")
    .map((d) => ({ key: d.key, title: d.title, type: d.type }));
}

export async function fetchSectionItems(
  config: PlexConnConfig,
  sectionKey: string,
): Promise<Array<{ title: string; year?: number; ratingKey: string; guids: Array<{ id: string }>; resolution?: string }>> {
  const res = await plexFetch(
    config,
    `/library/sections/${sectionKey}/all?includeGuids=1`,
  );
  if (!res.ok) throw new Error(`Plex API error: ${res.status}`);
  const data = await res.json();
  const items = data.MediaContainer?.Metadata ?? [];
  return items.map(
    (item: { title: string; year?: number; ratingKey: string; Guid?: Array<{ id: string }>; Media?: Array<{ videoResolution?: string }> }) => ({
      title: item.title,
      year: item.year,
      ratingKey: item.ratingKey,
      guids: item.Guid ?? [],
      resolution: item.Media ? pickHighestResolution(item.Media) : undefined,
    }),
  );
}

export async function fetchShowEpisodes(
  config: PlexConnConfig,
  ratingKey: string,
): Promise<{
  episodes: Array<{ seasonNumber: number; episodeNumber: number }>;
  latestResolution?: string;
}> {
  const res = await plexFetch(config, `/library/metadata/${ratingKey}/allLeaves`);
  if (!res.ok) throw new Error(`Plex API error: ${res.status}`);
  const data = await res.json();
  const raw: Array<{ parentIndex?: number; index?: number; Media?: Array<{ videoResolution?: string }> }> =
    data.MediaContainer?.Metadata ?? [];

  const valid = raw.filter((ep) => ep.parentIndex != null && ep.index != null);

  // Find resolution of the most recent episode (highest season, then highest episode)
  let latestResolution: string | undefined;
  let latestSeason = -1;
  let latestEpisode = -1;
  for (const ep of valid) {
    const s = ep.parentIndex!;
    const e = ep.index!;
    if (s > latestSeason || (s === latestSeason && e > latestEpisode)) {
      latestSeason = s;
      latestEpisode = e;
      latestResolution = ep.Media ? pickHighestResolution(ep.Media) : undefined;
    }
  }

  return {
    episodes: valid.map((ep) => ({
      seasonNumber: ep.parentIndex!,
      episodeNumber: ep.index!,
    })),
    latestResolution,
  };
}

export function extractExternalIds(
  guids: Array<{ id: string }>,
): ExternalIds {
  const ids: ExternalIds = {};
  for (const guid of guids) {
    const tmdbMatch = guid.id.match(/tmdb:\/\/(\d+)/);
    if (tmdbMatch) ids.tmdbId = parseInt(tmdbMatch[1], 10);

    const tvdbMatch = guid.id.match(/tvdb:\/\/(\d+)/);
    if (tvdbMatch) ids.tvdbId = parseInt(tvdbMatch[1], 10);

    const imdbMatch = guid.id.match(/imdb:\/\/(tt\d+)/);
    if (imdbMatch) ids.imdbId = imdbMatch[1];
  }
  return ids;
}

function emptyIndex(): LibraryIndex {
  return {
    items: [],
    movies: { byTmdbId: {}, byImdbId: {}, byTitle: {} },
    shows: { byTvdbId: {}, byTmdbId: {}, byImdbId: {}, byTitle: {} },
    lastRefresh: 0,
    itemCount: 0,
    movieCount: 0,
    showCount: 0,
  };
}

/**
 * Find an existing item in the index by matching any external ID.
 * Returns the index into items[] or -1 if not found.
 */
function findExistingItem(
  index: LibraryIndex,
  sectionType: string,
  ids: ExternalIds,
): number {
  if (sectionType === "movie") {
    if (ids.tmdbId && index.movies.byTmdbId[String(ids.tmdbId)] !== undefined)
      return index.movies.byTmdbId[String(ids.tmdbId)];
    if (ids.imdbId && index.movies.byImdbId[ids.imdbId] !== undefined)
      return index.movies.byImdbId[ids.imdbId];
  } else if (sectionType === "show") {
    if (ids.tvdbId && index.shows.byTvdbId[String(ids.tvdbId)] !== undefined)
      return index.shows.byTvdbId[String(ids.tvdbId)];
    if (ids.tmdbId && index.shows.byTmdbId[String(ids.tmdbId)] !== undefined)
      return index.shows.byTmdbId[String(ids.tmdbId)];
    if (ids.imdbId && index.shows.byImdbId[ids.imdbId] !== undefined)
      return index.shows.byImdbId[ids.imdbId];
  }
  return -1;
}

/**
 * Build a merged library index from one or more Plex servers.
 * Servers are processed in priority order (first = primary).
 * Items that exist on multiple servers share a single OwnedItem with multiple plexKeys.
 */
export async function buildLibraryIndex(
  servers: PlexServerConfig[],
): Promise<LibraryIndex> {
  const index = emptyIndex();

  for (const server of servers) {
    const sections = await fetchLibrarySections(server);

    for (const section of sections) {
      const items = await fetchSectionItems(server, section.key);

      for (const item of items) {
        const ids = extractExternalIds(item.guids);
        const existingIdx = findExistingItem(index, section.type, ids);

        if (existingIdx >= 0) {
          // Merge: add this server's plexKey to existing item
          const existing = index.items[existingIdx];
          existing.plexKeys[server.id] = item.ratingKey;

          // Take highest resolution across servers
          if (item.resolution) {
            if (!existing.resolution ||
              (RESOLUTION_PRIORITY[item.resolution.toLowerCase()] ?? 0) >
              (RESOLUTION_PRIORITY[existing.resolution.toLowerCase()] ?? 0)) {
              existing.resolution = item.resolution;
            }
          }

          // Enrich with any new IDs the existing item was missing
          if (section.type === "movie") {
            if (!existing.tmdbId && ids.tmdbId) {
              existing.tmdbId = ids.tmdbId;
              index.movies.byTmdbId[String(ids.tmdbId)] = existingIdx;
            }
            if (!existing.imdbId && ids.imdbId) {
              existing.imdbId = ids.imdbId;
              index.movies.byImdbId[ids.imdbId] = existingIdx;
            }
          } else if (section.type === "show") {
            if (!existing.tvdbId && ids.tvdbId) {
              existing.tvdbId = ids.tvdbId;
              index.shows.byTvdbId[String(ids.tvdbId)] = existingIdx;
            }
            if (!existing.tmdbId && ids.tmdbId) {
              existing.tmdbId = ids.tmdbId;
              index.shows.byTmdbId[String(ids.tmdbId)] = existingIdx;
            }
            if (!existing.imdbId && ids.imdbId) {
              existing.imdbId = ids.imdbId;
              index.shows.byImdbId[ids.imdbId] = existingIdx;
            }
          }
        } else {
          // New item
          const owned: OwnedItem = {
            title: item.title,
            year: item.year,
            plexKeys: { [server.id]: item.ratingKey },
            tmdbId: ids.tmdbId,
            tvdbId: ids.tvdbId,
            imdbId: ids.imdbId,
            resolution: item.resolution,
          };

          const idx = index.items.length;
          index.items.push(owned);

          // Strip trailing "(YYYY)" from Plex titles so keys match content-script parsing
          const parsed = parseTitleFromH1(item.title);
          const cleanTitle = parsed.title;

          if (section.type === "movie") {
            if (ids.tmdbId) index.movies.byTmdbId[String(ids.tmdbId)] = idx;
            if (ids.imdbId) index.movies.byImdbId[ids.imdbId] = idx;
            if (item.year) index.movies.byTitle[buildTitleKey(cleanTitle, item.year)] = idx;
            index.movies.byTitle[buildTitleKey(cleanTitle)] = idx;
          } else if (section.type === "show") {
            if (ids.tvdbId) index.shows.byTvdbId[String(ids.tvdbId)] = idx;
            if (ids.tmdbId) index.shows.byTmdbId[String(ids.tmdbId)] = idx;
            if (ids.imdbId) index.shows.byImdbId[ids.imdbId] = idx;
            if (item.year) index.shows.byTitle[buildTitleKey(cleanTitle, item.year)] = idx;
            index.shows.byTitle[buildTitleKey(cleanTitle)] = idx;
          }
        }
      }
    }
  }

  index.lastRefresh = Date.now();
  index.itemCount = index.items.length;
  // Count unique items by type (items in movies maps vs shows maps)
  const movieIndices = new Set<number>();
  for (const v of Object.values(index.movies.byTmdbId)) movieIndices.add(v);
  for (const v of Object.values(index.movies.byImdbId)) movieIndices.add(v);
  for (const v of Object.values(index.movies.byTitle)) movieIndices.add(v);
  index.movieCount = movieIndices.size;
  const showIndices = new Set<number>();
  for (const v of Object.values(index.shows.byTvdbId)) showIndices.add(v);
  for (const v of Object.values(index.shows.byTmdbId)) showIndices.add(v);
  for (const v of Object.values(index.shows.byImdbId)) showIndices.add(v);
  for (const v of Object.values(index.shows.byTitle)) showIndices.add(v);
  index.showCount = showIndices.size;
  return index;
}
