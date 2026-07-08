/**
 * Sonarr community proxy client — free TV show metadata + episode lists.
 * Base URL: https://skyhook.sonarr.tv/v1
 * No authentication required.
 */

import { createCircuitBreaker } from "../common/circuit-breaker";
import { debugLog } from "../common/logger";
import { getProxyCache, setProxyCache } from "../common/storage";

const BASE_URL = "https://skyhook.sonarr.tv/v1";
const TIMEOUT_MS = 4000;

const breaker = createCircuitBreaker();

// --- Response types (camelCase to match API) ---

export interface SonarrEpisode {
  tvdbShowId: number;
  tvdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  absoluteEpisodeNumber?: number;
  title: string;
  overview?: string;
  airDate?: string;
  airDateUtc?: string;
  runtime?: number;
  finaleType?: string;
  image?: string;
}

export interface SonarrSeason {
  seasonNumber: number;
  images?: { coverType: string; url: string }[];
}

export interface SonarrShow {
  tvdbId: number;
  imdbId?: string;
  tmdbId?: number;
  tvMazeId?: number;
  tvRageId?: number;
  title: string;
  overview?: string;
  slug?: string;
  // "continuing" | "ended" | "upcoming" — absent on some search results
  status?: string;
  firstAired?: string;
  lastAired?: string;
  runtime?: number;
  originalNetwork?: string;
  network?: string;
  genres?: string[];
  contentRating?: string;
  originalCountry?: string;
  originalLanguage?: string;
  rating?: { count: number; value: string };
  images?: { coverType?: string; url?: string }[];
  seasons?: SonarrSeason[];
  // Present on /tvdb/shows/{id} lookups; absent on search results
  episodes?: SonarrEpisode[];
  alternativeTitles?: { title: string }[];
  actors?: { name: string; character: string; image?: string }[];
}

// --- Fetch helper with timeout + circuit breaker ---

async function sonarrFetch<T>(path: string): Promise<T | null> {
  if (breaker.isOpen()) {
    debugLog("Sonarr", "circuit breaker open, skipping");
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      breaker.recordFailure();
      debugLog("Sonarr", `HTTP ${res.status} for ${path}`);
      return null;
    }

    const data = await res.json() as T;
    breaker.recordSuccess();
    return data;
  } catch (err) {
    clearTimeout(timer);
    breaker.recordFailure();
    debugLog("Sonarr", `fetch failed for ${path}:`, err);
    return null;
  }
}

// --- Cache TTLs ---

const ENDED_TTL = 7 * 24 * 60 * 60 * 1000;   // 7 days — ended shows' episode lists don't change
const FRESH_TTL = 24 * 60 * 60 * 1000;        // 24 hours — continuing shows air new episodes
const SEARCH_TTL = 24 * 60 * 60 * 1000;       // 24 hours for searches

// Coalesce concurrent misses on the same key (e.g. two tabs opening the same
// title) so they share one proxy request instead of stampeding.
const inflight = new Map<string, Promise<unknown>>();

function fetchAndCache<T>(cacheKey: string, path: string): Promise<T | null> {
  const existing = inflight.get(cacheKey);
  if (existing) return existing as Promise<T | null>;
  const p = (async () => {
    try {
      const data = await sonarrFetch<T>(path);
      if (data) await setProxyCache(cacheKey, data);
      return data;
    } finally {
      inflight.delete(cacheKey);
    }
  })();
  inflight.set(cacheKey, p);
  return p;
}

/** Cache-first fetch: return cached data if fresh, else fetch and cache. */
async function cachedSonarrFetch<T>(cacheKey: string, ttl: number, path: string): Promise<T | null> {
  const cached = await getProxyCache<T>(cacheKey, ttl);
  if (cached) {
    debugLog("Sonarr", `cache hit for ${cacheKey}`);
    return cached;
  }
  return fetchAndCache<T>(cacheKey, path);
}

// --- Public API ---

/**
 * Get show by TVDB ID — returns full metadata + complete episode list.
 *
 * Tiered TTL: entries under 24 h are always served; between 24 h and 7 days
 * they're served only for ended shows (whose episode lists can't change).
 * Continuing shows refetch daily — otherwise the episode-gap cache's own
 * 24 h TTL would recompute gaps from a week-old episode list and a weekly
 * show could read "Complete" for days after a new episode aired.
 */
export async function getSonarrShow(tvdbId: number): Promise<SonarrShow | null> {
  const cacheKey = `sonarr:show:${tvdbId}`;
  const path = `/tvdb/shows/en/${tvdbId}`;

  const fresh = await getProxyCache<SonarrShow>(cacheKey, FRESH_TTL);
  if (fresh) {
    debugLog("Sonarr", `cache hit (fresh) for ${cacheKey}`);
    return fresh;
  }

  const stale = await getProxyCache<SonarrShow>(cacheKey, ENDED_TTL);
  if (stale && stale.status?.toLowerCase() === "ended") {
    debugLog("Sonarr", `cache hit (ended show) for ${cacheKey}`);
    return stale;
  }

  const data = await fetchAndCache<SonarrShow>(cacheKey, path);
  // Refetch failed (proxy down / circuit open) — a day-old entry beats nothing
  return data ?? stale;
}

/** Search shows by title. Returns array of matches or null. */
export async function searchSonarrShow(query: string): Promise<SonarrShow[] | null> {
  return cachedSonarrFetch<SonarrShow[]>(`sonarr:search:${query}`, SEARCH_TTL, `/tvdb/search/en/?term=${encodeURIComponent(query)}`);
}

/** Check if the Sonarr proxy circuit breaker is open. */
export function isSonarrCircuitOpen(): boolean {
  return breaker.isOpen();
}
