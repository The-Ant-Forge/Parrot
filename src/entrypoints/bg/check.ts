/**
 * CHECK handling: the core "is this media in the user's library?" decision
 * path — direct index lookups plus all cross-reference fallbacks (TVMaze
 * bridge, Radarr proxy, TMDB API) and the IMDb movie/show dual lookup.
 *
 * Pure with respect to extension state: the library index, options and server
 * list are passed in (the background memoizes them), so tests only need to
 * mock the api modules.
 */

import { getRadarrMovieByImdb } from "../../api/radarr";
import { findByImdbId, findByTvdbId } from "../../api/tmdb";
import { getTvMazeExternals, lookupByImdb, lookupByTvdb } from "../../api/tvmaze";
import { formatResolution } from "../../api/plex";
import { debugLog } from "../../common/logger";
import type {
  CheckResponse,
  LibraryIndex,
  Message,
  OwnedItem,
  ParrotOptions,
  PlexServerConfig,
} from "../../common/types";
import { lookupItem, resolveItemPlex } from "./library";

export async function handleCheck(
  message: Extract<Message, { type: "CHECK" }>,
  index: LibraryIndex,
  options: ParrotOptions,
  servers: PlexServerConfig[],
): Promise<CheckResponse> {
  let item: OwnedItem | undefined;

  // TVMaze: resolve to TVDB/IMDb via TVMaze API, then look up
  if (message.source === "tvmaze") {
    try {
      debugLog("BG", `CHECK: calling TVMaze externals for tvmaze:${message.id}`);
      const ext = await getTvMazeExternals(message.id);
      debugLog("BG", `CHECK: TVMaze resolved → tvdb:${ext.tvdbId ?? "none"} imdb:${ext.imdbId ?? "none"}`);
      if (ext.tvdbId) {
        item = lookupItem(index, "show", "tvdb", String(ext.tvdbId));
        if (item) debugLog("BG", `CHECK: found via TVMaze→TVDB:${ext.tvdbId}`);
      }
      if (!item && ext.imdbId) {
        item = lookupItem(index, "show", "imdb", ext.imdbId);
        if (item) debugLog("BG", `CHECK: found via TVMaze→IMDb:${ext.imdbId}`);
      }
      // TMDB cross-reference fallback
      if (!item && ext.imdbId && options.tmdbApiKey) {
        try {
          debugLog("BG", `CHECK: calling TMDB findByImdbId for ${ext.imdbId}`);
          const tmdbId = await findByImdbId(options.tmdbApiKey, ext.imdbId, "show");
          if (tmdbId) {
            item = lookupItem(index, "show", "tmdb", String(tmdbId));
            if (item) debugLog("BG", `CHECK: found via TVMaze→TMDB:${tmdbId}`);
          }
        } catch (err) {
          debugLog("BG", "CHECK: TMDB cross-reference via TVMaze failed", err);
        }
      }
    } catch (err) {
      debugLog("BG", "CHECK: TVMaze API failed", err);
    }
  } else {
    item = await lookupWithCrossRefs(index, options, message.mediaType, message.source, message.id);
  }

  // IMDb ambiguity: an IMDb ID can refer to a movie OR a show. If the
  // requested type missed (including all its cross-refs), retry with the
  // opposite type so a single CHECK can resolve either. resolvedMediaType
  // tells the caller which type actually matched, so it can pick the right
  // gap-detection path without needing to fire a second CHECK.
  let resolvedMediaType: "movie" | "show" | undefined;
  if (!item && message.source === "imdb") {
    const opposite: "movie" | "show" = message.mediaType === "movie" ? "show" : "movie";
    debugLog("BG", `CHECK: ${message.mediaType} miss, retrying as ${opposite} for imdb:${message.id}`);
    item = await lookupWithCrossRefs(index, options, opposite, "imdb", message.id);
    if (item) resolvedMediaType = opposite;
  }

  if (!item) return { owned: false };

  const plex = resolveItemPlex(item, servers);

  return {
    owned: true,
    item,
    plexUrl: plex?.url,
    plexServerName: plex?.serverName,
    resolution: item.resolution ? formatResolution(item.resolution) : undefined,
    resolvedMediaType,
  };
}

/**
 * Direct index lookup for a single (mediaType, source, id) tuple, with all
 * the cross-reference fallbacks (TVMaze bridge, Radarr proxy, TMDB API) used
 * when the direct lookup misses. Returns the OwnedItem or undefined.
 *
 * Called twice by handleCheck for IMDb sources — once with the requested
 * mediaType, once with the opposite — so it must be self-contained and
 * idempotent.
 */
export async function lookupWithCrossRefs(
  index: LibraryIndex,
  options: ParrotOptions,
  mediaType: "movie" | "show",
  source: "tmdb" | "imdb" | "tvdb" | "title",
  id: string,
): Promise<OwnedItem | undefined> {
  debugLog("BG", `CHECK: direct index lookup ${mediaType} ${source}:${id}`);
  let item = lookupItem(index, mediaType, source, id);
  if (item) return item;
  if (source === "tmdb" || source === "title") return undefined;

  // TVMaze bridge (free, no key): IMDb ↔ TVDB for shows
  if (mediaType === "show") {
    try {
      debugLog("BG", `CHECK: calling TVMaze cross-ref for ${source}:${id}`);
      const ext = source === "imdb" ? await lookupByImdb(id) : await lookupByTvdb(id);
      if (ext) {
        debugLog("BG", `CHECK: TVMaze resolved → tvdb:${ext.tvdbId ?? "none"} imdb:${ext.imdbId ?? "none"}`);
        if (ext.tvdbId && source !== "tvdb") {
          item = lookupItem(index, "show", "tvdb", String(ext.tvdbId));
          if (item) { debugLog("BG", `CHECK: found via TVMaze cross-ref → TVDB:${ext.tvdbId}`); return item; }
        }
        if (ext.imdbId && source !== "imdb") {
          item = lookupItem(index, "show", "imdb", ext.imdbId);
          if (item) { debugLog("BG", `CHECK: found via TVMaze cross-ref → IMDb:${ext.imdbId}`); return item; }
        }
      }
    } catch (err) {
      debugLog("BG", "CHECK: TVMaze cross-reference failed", err);
    }
  }

  // Radarr proxy cross-reference for movies (free, no key)
  if (mediaType === "movie" && source === "imdb" && options.useCommunityProxies) {
    try {
      debugLog("BG", `CHECK: calling Radarr proxy for imdb:${id}`);
      const radarrMovie = await getRadarrMovieByImdb(id);
      if (radarrMovie?.TmdbId) {
        item = lookupItem(index, "movie", "tmdb", String(radarrMovie.TmdbId));
        if (item) { debugLog("BG", `CHECK: found via Radarr cross-ref → TMDB:${radarrMovie.TmdbId}`); return item; }
      }
    } catch (err) {
      debugLog("BG", "CHECK: Radarr cross-reference failed", err);
    }
  }

  // TMDB API fallback (requires user API key)
  if (options.tmdbApiKey) {
    try {
      debugLog("BG", `CHECK: calling TMDB ${source === "imdb" ? "findByImdbId" : "findByTvdbId"} for ${id}`);
      // TMDB movie and TV IDs are separate numeric namespaces — constrain the
      // /find result to the mediaType we're resolving for, or a movie's TMDB
      // id could be looked up in shows.byTmdbId (false OWNED on collision).
      const tmdbId = source === "imdb"
        ? await findByImdbId(options.tmdbApiKey, id, mediaType)
        : await findByTvdbId(options.tmdbApiKey, id);
      if (tmdbId) {
        item = lookupItem(index, mediaType, "tmdb", String(tmdbId));
        if (item) { debugLog("BG", `CHECK: found via TMDB cross-ref → TMDB:${tmdbId}`); return item; }
      }
    } catch (err) {
      debugLog("BG", "CHECK: TMDB cross-reference failed", err);
    }
  }

  return undefined;
}
