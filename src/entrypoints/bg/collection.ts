/**
 * CHECK_COLLECTION decision logic: given a resolved collection (name + parts,
 * from Radarr or TMDB), apply the excludeFuture / minCollectionSize / minOwned
 * options and partition parts into owned vs missing against the library index.
 *
 * Pure: index, servers, options and "today" are all inputs.
 */

import type {
  CollectionCheckResponse,
  LibraryIndex,
  ParrotOptions,
  PlexServerConfig,
} from "../../common/types";
import { resolveItemPlex } from "./library";

/** One movie in a collection, normalized from Radarr/TMDB shapes. */
export interface CollectionPart {
  tmdbId: number;
  title: string;
  year?: number;
  /** "YYYY-MM-DD" when known (TMDB); Radarr only provides the year. */
  releaseDate?: string;
}

type CollectionOptions = Pick<ParrotOptions, "excludeFuture" | "minCollectionSize" | "minOwned">;

/**
 * Drop unreleased parts when excludeFuture is set. Movies releasing today are
 * kept (`releaseDate <= today`) — unlike episodes, a released-today movie is
 * a legitimate gap to surface. Parts with no date info at all are kept.
 */
export function filterCollectionParts(
  parts: CollectionPart[],
  options: Pick<ParrotOptions, "excludeFuture">,
  today: string,
): CollectionPart[] {
  if (!options.excludeFuture) return parts;
  const todayYear = parseInt(today.slice(0, 4), 10);
  return parts.filter((m) => {
    if (m.releaseDate) return m.releaseDate <= today;
    if (m.year) return m.year <= todayYear;
    return true; // include if no date info
  });
}

/**
 * Apply all collection options and build the response. Returns
 * `{ hasCollection: false }` when the collection fails the size or
 * minimum-owned thresholds.
 */
export function evaluateCollection(
  name: string,
  collParts: CollectionPart[],
  index: LibraryIndex | null,
  servers: PlexServerConfig[],
  options: CollectionOptions,
  today = new Date().toLocaleDateString("en-CA"),
): CollectionCheckResponse {
  const parts = filterCollectionParts(collParts, options, today);

  if (parts.length < options.minCollectionSize) {
    return { hasCollection: false };
  }

  const ownedMovies: { title: string; year?: number; plexUrl?: string }[] = [];
  const missingMovies: { title: string; releaseDate?: string; tmdbId: number }[] = [];

  for (const part of parts) {
    const itemIdx = index?.movies.byTmdbId[String(part.tmdbId)];
    if (itemIdx !== undefined && index) {
      const ownedItem = index.items[itemIdx];
      const plexResult = resolveItemPlex(ownedItem, servers);
      ownedMovies.push({
        title: part.title,
        year: part.year,
        plexUrl: plexResult?.url,
      });
    } else {
      missingMovies.push({
        title: part.title,
        releaseDate: part.releaseDate,
        tmdbId: part.tmdbId,
      });
    }
  }

  if (ownedMovies.length < options.minOwned) {
    return { hasCollection: false };
  }

  return {
    hasCollection: true,
    collection: {
      name,
      totalMovies: parts.length,
      ownedMovies,
      missingMovies,
    },
  };
}
