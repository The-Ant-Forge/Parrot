/** Plex server connection settings (stored in browser.storage.sync as PlexServerConfig[]) */
export interface PlexServerConfig {
  id: string;           // machineIdentifier (stable Plex server ID)
  name: string;         // friendlyName from Plex API
  serverUrl: string;
  token: string;
  libraryCount?: number; // cached section count from test connection
  itemCount?: number;    // cached item count from last index build
}

/** A media item the user owns in Plex */
export interface OwnedItem {
  title: string;
  year?: number;
  plexKeys: Record<string, string>; // serverId → plexKey
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
  resolution?: string; // raw Plex videoResolution (e.g. "1080", "4k")
}

/** Cached index of the user's Plex library (stored in browser.storage.local) */
export interface LibraryIndex {
  items: OwnedItem[];
  movies: {
    byTmdbId: Record<string, number>;  // value = index into items[]
    byImdbId: Record<string, number>;
    byTitle: Record<string, number>;
  };
  shows: {
    byTvdbId: Record<string, number>;
    byTmdbId: Record<string, number>;
    byImdbId: Record<string, number>;
    byTitle: Record<string, number>;
  };
  lastRefresh: number;
  itemCount: number;
  movieCount: number;
  showCount: number;
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
  omdbApiKey: string;
  excludeFuture: boolean;
  excludeSpecials: boolean;
  minCollectionSize: number;
  minOwned: number;
  showCompletePanels: boolean;
  autoRefresh: boolean;
  autoRefreshDays: number;
  debugLogging: boolean;
}

export const DEFAULT_OPTIONS: ParrotOptions = {
  tmdbApiKey: "",
  tvdbApiKey: "",
  omdbApiKey: "",
  excludeFuture: true,
  excludeSpecials: true,
  minCollectionSize: 2,
  minOwned: 2,
  showCompletePanels: false,
  autoRefresh: true,
  autoRefreshDays: 7,
  debugLogging: false,
};

// --- Messages (popup/content scripts/options → background) ---

export type Message =
  | { type: "TEST_CONNECTION"; config: { serverUrl: string; token: string } }
  | { type: "TEST_ALL_SERVERS" }
  | { type: "BUILD_INDEX" }
  | { type: "GET_STATUS" }
  | {
      type: "CHECK";
      mediaType: "movie" | "show";
      source: "tmdb" | "imdb" | "tvdb" | "title" | "tvmaze";
      id: string;
    }
  | { type: "GET_OPTIONS" }
  | { type: "SAVE_OPTIONS"; options: ParrotOptions }
  | { type: "VALIDATE_TMDB_KEY"; apiKey: string }
  | { type: "VALIDATE_TVDB_KEY"; apiKey: string }
  | { type: "VALIDATE_OMDB_KEY"; apiKey: string }
  | { type: "CLEAR_CACHE" }
  | { type: "CHECK_COLLECTION"; tmdbMovieId: string }
  | { type: "CHECK_EPISODES"; source: "tvdb" | "tmdb"; id: string }
  | { type: "FIND_TMDB_ID"; source: "imdb" | "tvdb" | "title"; id: string; mediaType?: "movie" | "show" }
  | { type: "GET_TAB_MEDIA"; tabId: number }
  | { type: "GET_STORAGE_USAGE" }
  | { type: "UPDATE_ICON"; state: "owned" | "not-owned" }
  | { type: "PLEX_LOOKUP"; machineIdentifier: string; ratingKey: string };

// --- Responses ---

export interface StatusResponse {
  configured: boolean;
  serverCount: number;
  lastRefresh: number | null;
  itemCount: number;
  movieCount: number;
  showCount: number;
  tmdbConfigured: boolean;
  tvdbConfigured: boolean;
  omdbConfigured: boolean;
  updateAvailable?: boolean;
  latestVersion?: string;
  updateUrl?: string;
}

export interface CheckResponse {
  owned: boolean;
  item?: OwnedItem;
  plexUrl?: string;
  plexServerName?: string;
  resolution?: string;
}

export interface TestConnectionResponse {
  success: boolean;
  error?: string;
  libraryCount?: number;
  machineIdentifier?: string;
  friendlyName?: string;
}

export interface TestAllServersResponse {
  results: Array<{
    serverId: string;
    name: string;
    success: boolean;
    error?: string;
  }>;
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

export interface ValidateOmdbKeyResponse {
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
  source: "tmdb" | "imdb" | "tvdb" | "title" | "tvmaze";
  id: string;
  owned: boolean;
  plexUrl?: string;
  plexServerName?: string;
  tmdbId?: number;
  imdbId?: string;
  tvdbId?: number;
  title?: string;
  year?: number;
  posterPath?: string | null;
  posterUrl?: string; // full URL (e.g. from TVDB) when posterPath unavailable
  seasonCount?: number;
  episodeCount?: number;
  showStatus?: string;
  collectionName?: string;
  collectionOwned?: number;
  collectionTotal?: number;
  tmdbRating?: number;
  imdbRating?: number;
  resolution?: string;
}

export interface TabMediaResponse {
  media: TabMediaInfo | null;
}

export interface PlexLookupResponse {
  found: boolean;
  mediaType?: "movie" | "show";
  source?: "tmdb" | "imdb" | "tvdb";
  id?: string;
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
  resolution?: string;
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
  resolution?: string;
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
