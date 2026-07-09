/**
 * Radarr community proxy client — free movie metadata + multi-source ratings.
 * Base URL: https://api.radarr.video/v1
 * No authentication required.
 */

import { createProxyClient } from "../common/proxy-client";

const client = createProxyClient("https://api.radarr.video/v1", "Radarr");

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
  // Optional: a malformed image entry shouldn't kill the whole enrichment
  CoverType?: string;
  Url?: string;
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
  // Movies is missing from some collection responses; treat as optional
  Movies?: RadarrCollectionMovie[];
}

// --- Cache TTLs ---

const LOOKUP_TTL = 7 * 24 * 60 * 60 * 1000;  // 7 days for ID lookups
const SEARCH_TTL = 24 * 60 * 60 * 1000;       // 24 hours for searches

// --- Public API ---

/** Get movie by TMDB ID — returns metadata + all ratings. */
export async function getRadarrMovie(tmdbId: number): Promise<RadarrMovie | null> {
  return client.cachedFetch<RadarrMovie>(`radarr:movie:${tmdbId}`, LOOKUP_TTL, `/movie/${tmdbId}`);
}

/** Get movie by IMDb ID — useful for IMDb→TMDB cross-reference. */
export async function getRadarrMovieByImdb(imdbId: string): Promise<RadarrMovie | null> {
  // IMDb endpoint returns an array; unwrap the first match
  const results = await client.cachedFetch<RadarrMovie[]>(`radarr:imdb:${imdbId}`, LOOKUP_TTL, `/movie/imdb/${encodeURIComponent(imdbId)}`);
  return results && results.length > 0 ? results[0] : null;
}

/** Get collection by TMDB collection ID. */
export async function getRadarrCollection(collectionTmdbId: number): Promise<RadarrCollection | null> {
  return client.cachedFetch<RadarrCollection>(`radarr:coll:${collectionTmdbId}`, LOOKUP_TTL, `/movie/collection/${collectionTmdbId}`);
}

/** Search movies by title and optional year. Returns first match or null. */
export async function searchRadarrMovie(query: string, year?: number): Promise<RadarrMovie | null> {
  const yearParam = year ? `&year=${year}` : "";
  const cacheKey = `radarr:search:${query}${year ? `:${year}` : ""}`;
  const results = await client.cachedFetch<RadarrMovie[]>(cacheKey, SEARCH_TTL, `/search?q=${encodeURIComponent(query)}${yearParam}`);
  return results && results.length > 0 ? results[0] : null;
}

