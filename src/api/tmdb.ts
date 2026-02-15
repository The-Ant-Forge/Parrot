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

interface TMDBMovieResponse {
  id: number;
  title: string;
  belongs_to_collection: TMDBCollectionRef | null;
}

interface TMDBCollectionResponse {
  id: number;
  name: string;
  parts: TMDBCollectionMovie[];
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
 * Get movie details — we only need belongs_to_collection.
 */
export async function getMovie(
  apiKey: string,
  movieId: number,
): Promise<{ belongs_to_collection: TMDBCollectionRef | null }> {
  const data = await tmdbFetch<TMDBMovieResponse>(apiKey, `/movie/${movieId}`);
  return { belongs_to_collection: data.belongs_to_collection };
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
