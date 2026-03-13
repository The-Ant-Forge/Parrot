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
  status: string;
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
  images?: { coverType: string; url: string }[];
  seasons?: SonarrSeason[];
  episodes: SonarrEpisode[];
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

const LOOKUP_TTL = 7 * 24 * 60 * 60 * 1000;  // 7 days for ID lookups
const SEARCH_TTL = 24 * 60 * 60 * 1000;       // 24 hours for searches

/** Cache-first fetch: return cached data if fresh, else fetch and cache. */
async function cachedSonarrFetch<T>(cacheKey: string, ttl: number, path: string): Promise<T | null> {
  const cached = await getProxyCache<T>(cacheKey, ttl);
  if (cached) {
    debugLog("Sonarr", `cache hit for ${cacheKey}`);
    return cached;
  }
  const data = await sonarrFetch<T>(path);
  if (data) setProxyCache(cacheKey, data);
  return data;
}

// --- Public API ---

/** Get show by TVDB ID — returns full metadata + complete episode list. */
export async function getSonarrShow(tvdbId: number): Promise<SonarrShow | null> {
  return cachedSonarrFetch<SonarrShow>(`sonarr:show:${tvdbId}`, LOOKUP_TTL, `/tvdb/shows/en/${tvdbId}`);
}

/** Search shows by title. Returns array of matches or null. */
export async function searchSonarrShow(query: string): Promise<SonarrShow[] | null> {
  return cachedSonarrFetch<SonarrShow[]>(`sonarr:search:${query}`, SEARCH_TTL, `/tvdb/search/en/?term=${encodeURIComponent(query)}`);
}

/** Check if the Sonarr proxy circuit breaker is open. */
export function isSonarrCircuitOpen(): boolean {
  return breaker.isOpen();
}
