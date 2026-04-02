/**
 * Radarr community proxy client — free movie metadata + multi-source ratings.
 * Base URL: https://api.radarr.video/v1
 * No authentication required.
 */

import { createCircuitBreaker } from "../common/circuit-breaker";
import { debugLog } from "../common/logger";
import { getProxyCache, setProxyCache } from "../common/storage";

const BASE_URL = "https://api.radarr.video/v1";
const TIMEOUT_MS = 4000;

const breaker = createCircuitBreaker();

// --- Response types (PascalCase to match API) ---

export interface RadarrRatingEntry {
  Value: number;
  Count: number;
  Type: string;
}

export interface RadarrMovieRatings {
  Tmdb?: RadarrRatingEntry;
  Imdb?: RadarrRatingEntry;
  Metacritic?: RadarrRatingEntry;
  RottenTomatoes?: RadarrRatingEntry;
  Trakt?: RadarrRatingEntry;
}

export interface RadarrImage {
  CoverType: string;
  Url: string;
}

export interface RadarrCollectionRef {
  TmdbId: number;
  Title?: string;
}

export interface RadarrMovie {
  TmdbId: number;
  ImdbId?: string;
  Title: string;
  OriginalTitle?: string;
  Year: number;
  Overview?: string;
  Studio?: string;
  Runtime?: number;
  Status?: string;
  Images?: RadarrImage[];
  MovieRatings?: RadarrMovieRatings;
  Genres?: string[];
  Collection?: RadarrCollectionRef;
}

export interface RadarrCollectionMovie {
  TmdbId: number;
  Title: string;
  Year: number;
  Overview?: string;
  Images?: RadarrImage[];
  MovieRatings?: RadarrMovieRatings;
}

export interface RadarrCollection {
  TmdbId: number;
  Title: string;
  Movies: RadarrCollectionMovie[];
}

// --- Fetch helper with timeout + circuit breaker ---

async function radarrFetch<T>(path: string): Promise<T | null> {
  if (breaker.isOpen()) {
    debugLog("Radarr", "circuit breaker open, skipping");
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
      debugLog("Radarr", `HTTP ${res.status} for ${path}`);
      return null;
    }

    const data = await res.json() as T;
    breaker.recordSuccess();
    return data;
  } catch (err) {
    clearTimeout(timer);
    breaker.recordFailure();
    debugLog("Radarr", `fetch failed for ${path}:`, err);
    return null;
  }
}

// --- Cache TTLs ---

const LOOKUP_TTL = 7 * 24 * 60 * 60 * 1000;  // 7 days for ID lookups
const SEARCH_TTL = 24 * 60 * 60 * 1000;       // 24 hours for searches

/** Cache-first fetch: return cached data if fresh, else fetch and cache. */
async function cachedRadarrFetch<T>(cacheKey: string, ttl: number, path: string): Promise<T | null> {
  const cached = await getProxyCache<T>(cacheKey, ttl);
  if (cached) {
    debugLog("Radarr", `cache hit for ${cacheKey}`);
    return cached;
  }
  const data = await radarrFetch<T>(path);
  if (data) setProxyCache(cacheKey, data);
  return data;
}

// --- Public API ---

/** Get movie by TMDB ID — returns metadata + all ratings. */
export async function getRadarrMovie(tmdbId: number): Promise<RadarrMovie | null> {
  return cachedRadarrFetch<RadarrMovie>(`radarr:movie:${tmdbId}`, LOOKUP_TTL, `/movie/${tmdbId}`);
}

/** Get movie by IMDb ID — useful for IMDb→TMDB cross-reference. */
export async function getRadarrMovieByImdb(imdbId: string): Promise<RadarrMovie | null> {
  // IMDb endpoint returns an array; unwrap the first match
  const results = await cachedRadarrFetch<RadarrMovie[]>(`radarr:imdb:${imdbId}`, LOOKUP_TTL, `/movie/imdb/${encodeURIComponent(imdbId)}`);
  return results && results.length > 0 ? results[0] : null;
}

/** Get collection by TMDB collection ID. */
export async function getRadarrCollection(collectionTmdbId: number): Promise<RadarrCollection | null> {
  return cachedRadarrFetch<RadarrCollection>(`radarr:coll:${collectionTmdbId}`, LOOKUP_TTL, `/movie/collection/${collectionTmdbId}`);
}

/** Search movies by title and optional year. Returns first match or null. */
export async function searchRadarrMovie(query: string, year?: number): Promise<RadarrMovie | null> {
  const yearParam = year ? `&year=${year}` : "";
  const cacheKey = `radarr:search:${query}${year ? `:${year}` : ""}`;
  const results = await cachedRadarrFetch<RadarrMovie[]>(cacheKey, SEARCH_TTL, `/search?q=${encodeURIComponent(query)}${yearParam}`);
  return results && results.length > 0 ? results[0] : null;
}

/** Check if the Radarr proxy circuit breaker is open. */
export function isRadarrCircuitOpen(): boolean {
  return breaker.isOpen();
}
