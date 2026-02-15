const BASE_URL = "https://api.themoviedb.org/3";

export interface TMDBCollectionRef {
  id: number;
  name: string;
}

export interface TMDBCollectionMovie {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
}

export interface TMDBCollection {
  id: number;
  name: string;
  parts: TMDBCollectionMovie[];
}

export interface TMDBMovieDetails {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  belongs_to_collection: TMDBCollectionRef | null;
}

interface TMDBCollectionResponse {
  id: number;
  name: string;
  parts: TMDBCollectionMovie[];
}

// --- TV types ---

export interface TMDBTvShow {
  id: number;
  name: string;
  poster_path?: string | null;
  status?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons: { season_number: number; episode_count: number; air_date: string | null }[];
}

export interface TMDBTvSeason {
  season_number: number;
  episodes: { episode_number: number; name: string; air_date: string | null }[];
}

interface TMDBFindResponse {
  movie_results: { id: number }[];
  tv_results: { id: number }[];
}

async function tmdbFetch<T>(apiKey: string, path: string): Promise<T> {
  const url = `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`TMDB API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Get movie details — returns collection ref, poster, title, etc.
 */
export async function getMovie(
  apiKey: string,
  movieId: number,
): Promise<TMDBMovieDetails> {
  return tmdbFetch<TMDBMovieDetails>(apiKey, `/movie/${movieId}`);
}

/**
 * Get full collection with all movies.
 */
export async function getCollection(
  apiKey: string,
  collectionId: number,
): Promise<TMDBCollection> {
  const data = await tmdbFetch<TMDBCollectionResponse>(apiKey, `/collection/${collectionId}`);
  return {
    id: data.id,
    name: data.name,
    parts: data.parts,
  };
}

/**
 * Get TV show details — returns season list with episode counts.
 */
export async function getTvShow(
  apiKey: string,
  tvId: number,
): Promise<TMDBTvShow> {
  return tmdbFetch<TMDBTvShow>(apiKey, `/tv/${tvId}`);
}

/**
 * Get all episodes for a specific season.
 */
export async function getTvSeason(
  apiKey: string,
  tvId: number,
  seasonNumber: number,
): Promise<TMDBTvSeason> {
  return tmdbFetch<TMDBTvSeason>(apiKey, `/tv/${tvId}/season/${seasonNumber}`);
}

/**
 * Convert a TVDB ID to a TMDB ID using the find endpoint.
 * Returns null if no match found.
 */
export async function findByTvdbId(
  apiKey: string,
  tvdbId: string,
): Promise<number | null> {
  const data = await tmdbFetch<TMDBFindResponse>(
    apiKey,
    `/find/${tvdbId}?external_source=tvdb_id`,
  );
  return data.tv_results.length > 0 ? data.tv_results[0].id : null;
}

/**
 * Convert an IMDb ID to a TMDB ID using the find endpoint.
 * Checks movie results first, then TV results.
 * Returns null if no match found.
 */
export async function findByImdbId(
  apiKey: string,
  imdbId: string,
): Promise<number | null> {
  const data = await tmdbFetch<TMDBFindResponse>(
    apiKey,
    `/find/${imdbId}?external_source=imdb_id`,
  );
  if (data.movie_results.length > 0) return data.movie_results[0].id;
  if (data.tv_results.length > 0) return data.tv_results[0].id;
  return null;
}
