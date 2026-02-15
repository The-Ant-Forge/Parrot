/** Plex server connection settings (stored in browser.storage.sync) */
export interface PlexConfig {
  serverUrl: string;
  token: string;
  machineIdentifier?: string;
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
    byTitle: Record<string, OwnedItem>;
  };
  shows: {
    byTvdbId: Record<string, OwnedItem>;
    byTmdbId: Record<string, OwnedItem>;
    byImdbId: Record<string, OwnedItem>;
    byTitle: Record<string, OwnedItem>;
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

// --- Options (stored in browser.storage.sync) ---

export interface ParrotOptions {
  tmdbApiKey: string;
  excludeFuture: boolean;
  excludeSpecials: boolean;
  minCollectionSize: number;
  minOwned: number;
}

export const DEFAULT_OPTIONS: ParrotOptions = {
  tmdbApiKey: "",
  excludeFuture: true,
  excludeSpecials: true,
  minCollectionSize: 2,
  minOwned: 2,
};

// --- Messages (popup/content scripts/options → background) ---

export type Message =
  | { type: "TEST_CONNECTION"; config: PlexConfig }
  | { type: "BUILD_INDEX" }
  | { type: "GET_STATUS" }
  | {
      type: "CHECK";
      mediaType: "movie" | "show";
      source: "tmdb" | "imdb" | "tvdb" | "title";
      id: string;
    }
  | { type: "GET_OPTIONS" }
  | { type: "SAVE_OPTIONS"; options: ParrotOptions }
  | { type: "VALIDATE_TMDB_KEY"; apiKey: string }
  | { type: "CLEAR_CACHE" };

// --- Responses ---

export interface StatusResponse {
  configured: boolean;
  lastRefresh: number | null;
  itemCount: number;
}

export interface CheckResponse {
  owned: boolean;
  item?: OwnedItem;
  plexUrl?: string;
}

export interface TestConnectionResponse {
  success: boolean;
  error?: string;
  libraryCount?: number;
  machineIdentifier?: string;
}

export interface BuildIndexResponse {
  success: boolean;
  error?: string;
  itemCount?: number;
}

export interface ValidateTmdbKeyResponse {
  valid: boolean;
  error?: string;
}

export interface OptionsResponse {
  options: ParrotOptions;
}

export interface SaveOptionsResponse {
  success: boolean;
}

export interface ClearCacheResponse {
  success: boolean;
}
