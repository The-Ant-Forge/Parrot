/**
 * Pure URL/ID extraction functions, shared by content scripts.
 * Extracted to enable unit testing without DOM or browser dependencies.
 */

/** TMDB: extract mediaType and numeric ID from a TMDB URL. */
export function extractTmdbFromUrl(url: string): { mediaType: "movie" | "show"; id: string } | null {
  const match = url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
  if (!match) return null;
  return {
    mediaType: match[1] === "movie" ? "movie" : "show",
    id: match[2],
  };
}

/** IMDb: extract tt-prefixed ID from an IMDb URL. */
export function extractImdbId(url: string): string | null {
  const match = url.match(/imdb\.com\/title\/(tt\d+)/);
  return match ? match[1] : null;
}

/** PSA: extract mediaType and slug from a PSA URL. */
export function extractPsaFromUrl(url: string): { mediaType: "movie" | "show"; slug: string } | null {
  const match = url.match(/psa\.wf\/(movie|tv-show)\/([^/?#]+)/);
  if (!match) return null;
  return {
    mediaType: match[1] === "movie" ? "movie" : "show",
    slug: match[2],
  };
}

/** NZBGeek: determine media type from URL query parameters. */
export function extractNzbgeekMediaType(search: string): "movie" | "show" | null {
  const params = new URLSearchParams(search);
  if (params.has("movieid")) return "movie";
  if (params.has("tvid")) return "show";
  return null;
}
