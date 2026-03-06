/**
 * Pure URL/ID extraction functions, shared by content scripts.
 * URL-based extractors are pure functions (no DOM).
 * scanLinksForExternalId() is the DOM-based link scanner.
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

/** TVMaze: extract numeric show ID from a TVMaze URL. */
export function extractTvmazeFromUrl(url: string): { id: string } | null {
  const match = url.match(/tvmaze\.com\/shows\/(\d+)/);
  return match ? { id: match[1] } : null;
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

/** BBC iPlayer: extract mediaType and slug from an iPlayer URL. */
export function extractIplayerFromUrl(url: string): { mediaType: "movie" | "show"; slug: string } | null {
  // /iplayer/episode/{pid}/{slug} = movie (singular)
  // /iplayer/episodes/{pid}/{slug} = show (plural)
  const match = url.match(/bbc\.co\.uk\/iplayer\/(episodes?)\/[^/]+\/([^/?#]+)/);
  if (!match) return null;
  return {
    mediaType: match[1] === "episode" ? "movie" : "show",
    slug: match[2],
  };
}

/** Trakt: extract media type from Trakt URL path. */
export function extractTraktMediaType(pathname: string): "movie" | "show" | null {
  if (/\/movies\//.test(pathname)) return "movie";
  if (/\/shows\//.test(pathname)) return "show";
  return null;
}

/** JustWatch: extract media type from JustWatch URL path. */
export function extractJustWatchMediaType(pathname: string): "movie" | "show" | null {
  if (/\/movie\//.test(pathname)) return "movie";
  if (/\/tv-show\//.test(pathname) || /\/tv-series\//.test(pathname)) return "show";
  return null;
}

/** Rotten Tomatoes: extract media type from RT URL path. */
export function extractRtMediaType(pathname: string): "movie" | "show" | null {
  if (/\/m\//.test(pathname)) return "movie";
  if (/\/tv\//.test(pathname)) return "show";
  return null;
}

/** Metacritic: extract media type from URL path (/movie/ or /tv/). */
export function extractMetacriticMediaType(pathname: string): "movie" | "show" | null {
  if (/^\/movie\//.test(pathname)) return "movie";
  if (/^\/tv\//.test(pathname)) return "show";
  return null;
}

/** NZBGeek: determine media type from URL query parameters. */
export function extractNzbgeekMediaType(search: string): "movie" | "show" | null {
  const params = new URLSearchParams(search);
  if (params.has("movieid")) return "movie";
  if (params.has("tvid")) return "show";
  return null;
}

// --- JSON-LD structured data scanner ---

/**
 * Scan JSON-LD structured data for an IMDb ID in `sameAs`,
 * then fall back to page link scanning.
 */
export function findExternalIdFromJsonLd(
  linkSources?: ExternalIdSource[],
): ExternalIdFromLink | null {
  const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of ldScripts) {
    try {
      const data = JSON.parse(script.textContent ?? "");
      const sameAs = Array.isArray(data.sameAs) ? data.sameAs : data.sameAs ? [data.sameAs] : [];
      for (const url of sameAs) {
        if (typeof url !== "string") continue;
        const imdbMatch = url.match(/imdb\.com\/title\/(tt\d+)/);
        if (imdbMatch) return { source: "imdb", id: imdbMatch[1] };
      }
    } catch {
      // invalid JSON-LD, skip
    }
  }

  // Fallback: scan DOM links
  return scanLinksForExternalId({ sources: linkSources ?? ["tmdb", "imdb", "tvmaze"] });
}

// --- DOM-based link scanner ---

export type ExternalIdSource = "tmdb" | "imdb" | "tvdb" | "tvmaze";

export interface ExternalIdFromLink {
  source: ExternalIdSource;
  id: string;
  mediaType?: "movie" | "show";
}

const ALL_SOURCES: ExternalIdSource[] = ["tmdb", "imdb", "tvdb", "tvmaze"];

/** Authority ranking: IMDb > TVDB > TMDB > TVMaze. Lower = higher authority. */
const SOURCE_PRIORITY: Record<string, number> = { imdb: 0, tvdb: 1, tmdb: 2, tvmaze: 3 };

/**
 * Scan <a> elements for TMDB, IMDb, TVDB, or TVMaze links.
 *
 * Collects the first match per source, then returns the highest-authority
 * one (IMDb > TVDB > TMDB > TVMaze). This prevents a stray sidebar link
 * from overriding the correct link further down the page.
 *
 * @param options.sources — restrict which sources to check (default: all four)
 * @param options.container — scope the scan to a DOM subtree (default: document)
 */
export function scanLinksForExternalId(
  options?: { sources?: ExternalIdSource[]; container?: ParentNode },
): ExternalIdFromLink | null {
  const sources = options?.sources ?? ALL_SOURCES;
  const sourceSet = new Set<ExternalIdSource>(sources);
  const root = options?.container ?? document;
  const links = root.querySelectorAll<HTMLAnchorElement>("a[href]");

  const found = new Map<string, ExternalIdFromLink>();

  for (const link of links) {
    const href = link.href;

    if (sourceSet.has("tmdb") && !found.has("tmdb")) {
      const tmdb = extractTmdbFromUrl(href);
      if (tmdb) found.set("tmdb", { source: "tmdb", id: tmdb.id, mediaType: tmdb.mediaType });
    }

    if (sourceSet.has("imdb") && !found.has("imdb")) {
      const imdbId = extractImdbId(href);
      if (imdbId) found.set("imdb", { source: "imdb", id: imdbId });
    }

    if (sourceSet.has("tvdb") && !found.has("tvdb")) {
      const tvdbPathMatch = href.match(/thetvdb\.com\/series\/(\d+)/);
      if (tvdbPathMatch) {
        found.set("tvdb", { source: "tvdb", id: tvdbPathMatch[1], mediaType: "show" });
      } else {
        const tvdbQueryMatch = href.match(/thetvdb\.com\/.*[?&]id=(\d+)/);
        if (tvdbQueryMatch) found.set("tvdb", { source: "tvdb", id: tvdbQueryMatch[1], mediaType: "show" });
      }
    }

    if (sourceSet.has("tvmaze") && !found.has("tvmaze")) {
      const tvmaze = extractTvmazeFromUrl(href);
      if (tvmaze) found.set("tvmaze", { source: "tvmaze", id: tvmaze.id, mediaType: "show" });
    }

    if (found.size === sources.length) break;
  }

  if (found.size === 0) return null;

  // Return highest-authority match
  let best: ExternalIdFromLink | null = null;
  let bestPri = Infinity;
  for (const match of found.values()) {
    const pri = SOURCE_PRIORITY[match.source] ?? Infinity;
    if (pri < bestPri) { best = match; bestPri = pri; }
  }
  return best;
}
