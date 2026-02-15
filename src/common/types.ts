/** Plex server connection settings (stored in browser.storage.sync) */
export interface PlexConfig {
  serverUrl: string;
  token: string;
}

/** A media item the user owns in Plex */
export interface OwnedItem {
  title: string;
  year?: number;
  plexKey: string;
}

/** Cached index of the user's Plex library (stored in browser.storage.local) */
export interface LibraryIndex {
  movies: {
    byTmdbId: Record<string, OwnedItem>;
    byImdbId: Record<string, OwnedItem>;
  };
  shows: {
    byTvdbId: Record<string, OwnedItem>;
    byTmdbId: Record<string, OwnedItem>;
    byImdbId: Record<string, OwnedItem>;
  };
  lastRefresh: number;
  itemCount: number;
}

/** External IDs extracted from Plex GUID strings */
export interface ExternalIds {
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
}

/** A Plex library section */
export interface PlexSection {
  key: string;
  title: string;
  type: "movie" | "show" | string;
}

// --- Messages (popup/content scripts → background) ---

export type Message =
  | { type: "TEST_CONNECTION"; config: PlexConfig }
  | { type: "BUILD_INDEX" }
  | { type: "GET_STATUS" }
  | {
      type: "CHECK";
      mediaType: "movie" | "show";
      source: "tmdb" | "imdb" | "tvdb";
      id: string;
    };

// --- Responses ---

export interface StatusResponse {
  configured: boolean;
  lastRefresh: number | null;
  itemCount: number;
}

export interface CheckResponse {
  owned: boolean;
  item?: OwnedItem;
}

export interface TestConnectionResponse {
  success: boolean;
  error?: string;
  libraryCount?: number;
}

export interface BuildIndexResponse {
  success: boolean;
  error?: string;
  itemCount?: number;
}
