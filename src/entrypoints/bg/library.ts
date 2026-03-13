/**
 * Library index lookup and Plex URL resolution.
 */

import type { LibraryIndex, OwnedItem, PlexServerConfig } from "../../common/types";

export function buildPlexUrl(machineIdentifier: string, plexKey: string): string {
  return `https://app.plex.tv/desktop/#!/server/${machineIdentifier}/details?key=%2Flibrary%2Fmetadata%2F${plexKey}`;
}

/**
 * Resolve the best Plex URL for an owned item, using server priority order.
 * Returns the URL and server name for the highest-priority server that owns the item.
 */
export function resolveItemPlex(item: OwnedItem, servers: PlexServerConfig[]): { url: string; serverName: string } | undefined {
  for (const server of servers) {
    const plexKey = item.plexKeys[server.id];
    if (plexKey) return { url: buildPlexUrl(server.id, plexKey), serverName: server.name };
  }
  return undefined;
}

/**
 * Two-step lookup: map[id] → index number → items[index] → OwnedItem
 */
export function lookupItem(index: LibraryIndex, mediaType: "movie" | "show", source: string, id: string): OwnedItem | undefined {
  let idx: number | undefined;

  if (source === "title") {
    const map = mediaType === "movie" ? index.movies.byTitle : index.shows.byTitle;
    idx = map[id];
    // Year-qualified key missed → widen to yearless key
    if (idx === undefined && id.includes("|")) {
      idx = map[id.split("|")[0]];
    }
  } else if (mediaType === "movie") {
    const map = source === "tmdb" ? index.movies.byTmdbId : index.movies.byImdbId;
    idx = map[id];
  } else {
    const map = source === "tvdb"
      ? index.shows.byTvdbId
      : source === "tmdb"
        ? index.shows.byTmdbId
        : index.shows.byImdbId;
    idx = map[id];
  }

  return idx !== undefined ? index.items[idx] : undefined;
}
