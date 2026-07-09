/**
 * Sonarr community proxy client — free TV show metadata + episode lists.
 * Base URL: https://skyhook.sonarr.tv/v1
 * No authentication required.
 */

import { debugLog } from "../common/logger";
import { createProxyClient } from "../common/proxy-client";
import { getProxyCache } from "../common/storage";

const client = createProxyClient("https://skyhook.sonarr.tv/v1", "Sonarr");

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

// --- Cache TTLs ---

const ENDED_TTL = 7 * 24 * 60 * 60 * 1000;   // 7 days — ended shows' episode lists don't change
const FRESH_TTL = 24 * 60 * 60 * 1000;        // 24 hours — continuing shows air new episodes
const SEARCH_TTL = 24 * 60 * 60 * 1000;       // 24 hours for searches

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

  const data = await client.fetchAndCache<SonarrShow>(cacheKey, path);
  // Refetch failed (proxy down / circuit open) — a day-old entry beats nothing
  return data ?? stale;
}

/** Search shows by title. Returns array of matches or null. */
export async function searchSonarrShow(query: string): Promise<SonarrShow[] | null> {
  return client.cachedFetch<SonarrShow[]>(`sonarr:search:${query}`, SEARCH_TTL, `/tvdb/search/en/?term=${encodeURIComponent(query)}`);
}

