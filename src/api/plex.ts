import type {
  PlexConfig,
  PlexSection,
  OwnedItem,
  ExternalIds,
  LibraryIndex,
} from "../common/types";
import { buildTitleKey } from "../common/normalize";

async function plexFetch(config: PlexConfig, path: string): Promise<Response> {
  const url = `${config.serverUrl.replace(/\/+$/, "")}${path}`;
  return fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Plex-Token": config.token,
    },
  });
}

export async function testConnection(
  config: PlexConfig,
): Promise<{ success: boolean; error?: string; libraryCount?: number; machineIdentifier?: string }> {
  try {
    const res = await plexFetch(config, "/library/sections");
    if (!res.ok) {
      if (res.status === 401) {
        return { success: false, error: "Authentication failed — check your token" };
      }
      return { success: false, error: `Server returned ${res.status}` };
    }
    const data = await res.json();
    const sections = data.MediaContainer?.Directory ?? [];

    // Fetch machineIdentifier from server identity
    let machineIdentifier: string | undefined;
    try {
      const idRes = await plexFetch(config, "/");
      if (idRes.ok) {
        const idData = await idRes.json();
        machineIdentifier = idData.MediaContainer?.machineIdentifier;
      }
    } catch {
      // Non-critical — deep links just won't work
    }

    return { success: true, libraryCount: sections.length, machineIdentifier };
  } catch {
    return { success: false, error: "Could not reach server — check URL" };
  }
}

export async function fetchLibrarySections(
  config: PlexConfig,
): Promise<PlexSection[]> {
  const res = await plexFetch(config, "/library/sections");
  if (!res.ok) throw new Error(`Plex API error: ${res.status}`);
  const data = await res.json();
  const dirs: Array<{ key: string; title: string; type: string }> =
    data.MediaContainer?.Directory ?? [];
  return dirs
    .filter((d) => d.type === "movie" || d.type === "show")
    .map((d) => ({ key: d.key, title: d.title, type: d.type }));
}

export async function fetchSectionItems(
  config: PlexConfig,
  sectionKey: string,
): Promise<Array<{ title: string; year?: number; ratingKey: string; guids: Array<{ id: string }> }>> {
  const res = await plexFetch(
    config,
    `/library/sections/${sectionKey}/all?includeGuids=1`,
  );
  if (!res.ok) throw new Error(`Plex API error: ${res.status}`);
  const data = await res.json();
  const items = data.MediaContainer?.Metadata ?? [];
  return items.map(
    (item: { title: string; year?: number; ratingKey: string; Guid?: Array<{ id: string }> }) => ({
      title: item.title,
      year: item.year,
      ratingKey: item.ratingKey,
      guids: item.Guid ?? [],
    }),
  );
}

export async function fetchShowEpisodes(
  config: PlexConfig,
  ratingKey: string,
): Promise<Array<{ seasonNumber: number; episodeNumber: number }>> {
  const res = await plexFetch(config, `/library/metadata/${ratingKey}/allLeaves`);
  if (!res.ok) throw new Error(`Plex API error: ${res.status}`);
  const data = await res.json();
  const episodes: Array<{ parentIndex?: number; index?: number }> =
    data.MediaContainer?.Metadata ?? [];
  return episodes
    .filter((ep) => ep.parentIndex != null && ep.index != null)
    .map((ep) => ({
      seasonNumber: ep.parentIndex!,
      episodeNumber: ep.index!,
    }));
}

export function extractExternalIds(
  guids: Array<{ id: string }>,
): ExternalIds {
  const ids: ExternalIds = {};
  for (const guid of guids) {
    const tmdbMatch = guid.id.match(/tmdb:\/\/(\d+)/);
    if (tmdbMatch) ids.tmdbId = parseInt(tmdbMatch[1]);

    const tvdbMatch = guid.id.match(/tvdb:\/\/(\d+)/);
    if (tvdbMatch) ids.tvdbId = parseInt(tvdbMatch[1]);

    const imdbMatch = guid.id.match(/imdb:\/\/(tt\d+)/);
    if (imdbMatch) ids.imdbId = imdbMatch[1];
  }
  return ids;
}

function emptyIndex(): LibraryIndex {
  return {
    movies: { byTmdbId: {}, byImdbId: {}, byTitle: {} },
    shows: { byTvdbId: {}, byTmdbId: {}, byImdbId: {}, byTitle: {} },
    lastRefresh: 0,
    itemCount: 0,
  };
}

export async function buildLibraryIndex(
  config: PlexConfig,
): Promise<LibraryIndex> {
  const sections = await fetchLibrarySections(config);
  const index = emptyIndex();
  let totalItems = 0;

  for (const section of sections) {
    const items = await fetchSectionItems(config, section.key);

    for (const item of items) {
      const ids = extractExternalIds(item.guids);
      const owned: OwnedItem = {
        title: item.title,
        year: item.year,
        plexKey: item.ratingKey,
        tmdbId: ids.tmdbId,
        tvdbId: ids.tvdbId,
        imdbId: ids.imdbId,
      };

      if (section.type === "movie") {
        if (ids.tmdbId) index.movies.byTmdbId[String(ids.tmdbId)] = owned;
        if (ids.imdbId) index.movies.byImdbId[ids.imdbId] = owned;
        // Title-based keys: precise (with year) and fallback (without)
        if (item.year) index.movies.byTitle[buildTitleKey(item.title, item.year)] = owned;
        index.movies.byTitle[buildTitleKey(item.title)] = owned;
      } else if (section.type === "show") {
        if (ids.tvdbId) index.shows.byTvdbId[String(ids.tvdbId)] = owned;
        if (ids.tmdbId) index.shows.byTmdbId[String(ids.tmdbId)] = owned;
        if (ids.imdbId) index.shows.byImdbId[ids.imdbId] = owned;
        // Title-based keys: precise (with year) and fallback (without)
        if (item.year) index.shows.byTitle[buildTitleKey(item.title, item.year)] = owned;
        index.shows.byTitle[buildTitleKey(item.title)] = owned;
      }

      totalItems++;
    }
  }

  index.lastRefresh = Date.now();
  index.itemCount = totalItems;
  return index;
}
