/** Plex server connection settings (stored in browser.storage.sync as PlexServerConfig[]) */
export interface PlexServerConfig {
  id: string;           // machineIdentifier (stable Plex server ID)
  name: string;         // friendlyName from Plex API
  serverUrl: string;    // local/primary URL (e.g. http://192.168.1.100:32400)
  remoteUrl?: string;   // auto-fetched .plex.direct URL for remote access (optional)
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

/**
 * Bump when the index-building code changes shape or semantics (new lookup
 * maps, changed title normalization, etc.). An index stored by a different
 * version keeps serving lookups but triggers an immediate background rebuild
 * — otherwise users keep matching against keys built by the old algorithm
 * until the next scheduled auto-refresh.
 */
export const INDEX_SCHEMA_VERSION = 2;

/** Cached index of the user's Plex library (stored in browser.storage.local) */
export interface LibraryIndex {
  schemaVersion?: number;
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

/** A Plex library section (only movie/show sections are indexed) */
export interface PlexSection {
  key: string;
  title: string;
  type: "movie" | "show";
}

// --- Options (stored in browser.storage.sync) ---

export interface ParrotOptions {
  tmdbApiKey: string;
  tvdbApiKey: string;
  omdbApiKey: string;
  useCommunityProxies: boolean;
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
  useCommunityProxies: true,
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
      /**
       * Title source only: alternate title key (e.g. slug-derived) tried
       * server-side when the primary key misses. Keeps sites single-CHECK —
       * a second CHECK would race the first one's async enrichment.
       */
      altId?: string;
      /**
       * Title source only: the mediaType is a guess (e.g. Plex app pages);
       * retry the opposite type on miss and report it via resolvedMediaType.
       */
      ambiguousType?: boolean;
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
  | { type: "PLEX_LOOKUP"; machineIdentifier: string; ratingKey: string }
  | { type: "FETCH_REMOTE_URL"; token: string; machineIdentifier: string }
  | { type: "CHECK_FOR_UPDATE" };

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
  updateUrl?: string;        // release web page URL
  updateAssetUrl?: string;   // direct ZIP asset URL (when available)
}

export interface CheckResponse {
  owned: boolean;
  item?: OwnedItem;
  plexUrl?: string;
  plexServerName?: string;
  resolution?: string;
  /**
   * For IMDb sources (and ambiguousType title checks) where the requested
   * mediaType missed but the opposite type matched, this tells the caller
   * which type actually owned the item so it can pick the right
   * gap-detection path. Undefined when the requested type matched or
   * nothing matched.
   */
  resolvedMediaType?: "movie" | "show";
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
  rtRating?: number;          // 0-100 Rotten Tomatoes (movies via Radarr)
  metacriticRating?: number;  // 0-100 Metacritic (movies via Radarr)
  traktRating?: number;       // 0-10 Trakt (movies via Radarr)
  tvdbRating?: number;        // 0-10 TVDB (TV via Sonarr)
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

export interface FetchRemoteUrlResponse {
  remoteUrl: string | null;
  error?: string;
}

export interface CheckForUpdateResponse {
  updateAvailable: boolean;
  latestVersion?: string;
  currentVersion: string;
  updateUrl?: string;
  updateAssetUrl?: string;
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
