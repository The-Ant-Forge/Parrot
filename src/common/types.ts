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
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
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
  tvdbApiKey: string;
  excludeFuture: boolean;
  excludeSpecials: boolean;
  minCollectionSize: number;
  minOwned: number;
  showCompletePanels: boolean;
}

export const DEFAULT_OPTIONS: ParrotOptions = {
  tmdbApiKey: "",
  tvdbApiKey: "",
  excludeFuture: true,
  excludeSpecials: true,
  minCollectionSize: 2,
  minOwned: 2,
  showCompletePanels: false,
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
  | { type: "VALIDATE_TVDB_KEY"; apiKey: string }
  | { type: "CLEAR_CACHE" }
  | { type: "CHECK_COLLECTION"; tmdbMovieId: string }
  | { type: "CHECK_EPISODES"; source: "tvdb" | "tmdb"; id: string }
  | { type: "FIND_TMDB_ID"; source: "imdb" | "tvdb"; id: string }
  | { type: "GET_TAB_MEDIA"; tabId: number }
  | { type: "GET_STORAGE_USAGE" };

// --- Responses ---

export interface StatusResponse {
  configured: boolean;
  lastRefresh: number | null;
  itemCount: number;
  movieCount: number;
  showCount: number;
  tmdbConfigured: boolean;
  tvdbConfigured: boolean;
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

export interface ValidateTvdbKeyResponse {
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

export interface FindTmdbIdResponse {
  tmdbId: number | null;
}

// --- Tab media info (popup dashboard) ---

export interface TabMediaInfo {
  mediaType: "movie" | "show";
  source: "tmdb" | "imdb" | "tvdb" | "title";
  id: string;
  owned: boolean;
  plexUrl?: string;
  tmdbId?: number;
  imdbId?: string;
  tvdbId?: number;
  title?: string;
  year?: number;
  posterPath?: string | null;
  seasonCount?: number;
  episodeCount?: number;
  showStatus?: string;
  collectionName?: string;
  collectionOwned?: number;
  collectionTotal?: number;
}

export interface TabMediaResponse {
  media: TabMediaInfo | null;
}

export interface StorageUsageResponse {
  bytesUsed: number;
  quota: number | null;
}

// --- Site definitions ---

export interface SiteDefinition {
  id: string;
  name: string;
  urlPattern: string;
  mediaType: "movie" | "show" | "auto";
  badgeSelector: string;
  isBuiltin: boolean;
  enabled: boolean;
}

// --- Episode gap types ---

export interface SeasonGapInfo {
  seasonNumber: number;
  ownedCount: number;
  totalCount: number;
  missing: { number: number; name: string; airDate?: string }[];
}

export interface EpisodeGapResponse {
  hasGaps: boolean;
  gaps?: {
    showTitle: string;
    totalOwned: number;
    totalEpisodes: number;
    completeSeasons: number;
    totalSeasons: number;
    seasons: SeasonGapInfo[];
  };
}

export interface EpisodeGapCacheEntry {
  showTitle: string;
  cacheKey: string; // "tmdb:{id}" or "tvdb:{id}"
  seasons: SeasonGapInfo[];
  totalOwned: number;
  totalEpisodes: number;
  completeSeasons: number;
  totalSeasons: number;
  fetchedAt: number;
}

export interface CollectionCheckResponse {
  hasCollection: boolean;
  collection?: {
    name: string;
    totalMovies: number;
    ownedMovies: { title: string; year?: number; plexUrl?: string }[];
    missingMovies: { title: string; releaseDate?: string; tmdbId: number }[];
  };
}
