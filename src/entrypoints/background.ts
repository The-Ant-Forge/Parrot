import { getConfig, getLibraryIndex, saveLibraryIndex, getOptions, saveOptions, getCachedCollection, saveCachedCollection, getCachedEpisodeGaps, saveCachedEpisodeGaps } from "../common/storage";
import { testConnection, buildLibraryIndex, fetchShowEpisodes } from "../api/plex";
import { getMovie, getCollection, getTvShow, getTvSeason, findByTvdbId, findByImdbId } from "../api/tmdb";
import { getSeriesEpisodes, validateTvdbKey } from "../api/tvdb";
import type {
  Message,
  CheckResponse,
  CollectionCheckResponse,
  EpisodeGapResponse,
  SeasonGapInfo,
  EpisodeGapCacheEntry,
  StatusResponse,
  TestConnectionResponse,
  BuildIndexResponse,
  ValidateTmdbKeyResponse,
  ValidateTvdbKeyResponse,
  OptionsResponse,
  SaveOptionsResponse,
  ClearCacheResponse,
  FindTmdbIdResponse,
  StorageUsageResponse,
  TabMediaInfo,
  TabMediaResponse,
  LibraryIndex,
  OwnedItem,
} from "../common/types";

let cachedIndex: LibraryIndex | null = null;
const tabMediaCache = new Map<number, TabMediaInfo>();

const SESSION_KEY = "tabMedia";
const MAX_SESSION_ENTRIES = 20;

async function persistTabMedia(tabId: number, info: TabMediaInfo) {
  tabMediaCache.set(tabId, info);
  try {
    const stored: Record<string, TabMediaInfo> =
      (await browser.storage.session.get(SESSION_KEY))[SESSION_KEY] ?? {};
    stored[String(tabId)] = info;
    // Limit entries
    const keys = Object.keys(stored);
    if (keys.length > MAX_SESSION_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_SESSION_ENTRIES)) {
        delete stored[k];
      }
    }
    await browser.storage.session.set({ [SESSION_KEY]: stored });
  } catch {
    // session storage not available (e.g. Firefox MV2 fallback)
  }
}

async function getTabMedia(tabId: number): Promise<TabMediaInfo | null> {
  const cached = tabMediaCache.get(tabId);
  if (cached) return cached;
  try {
    const stored: Record<string, TabMediaInfo> =
      (await browser.storage.session.get(SESSION_KEY))[SESSION_KEY] ?? {};
    const info = stored[String(tabId)];
    if (info) {
      tabMediaCache.set(tabId, info);
      return info;
    }
  } catch {
    // session storage not available
  }
  return null;
}

async function removeTabMedia(tabId: number) {
  tabMediaCache.delete(tabId);
  try {
    const stored: Record<string, TabMediaInfo> =
      (await browser.storage.session.get(SESSION_KEY))[SESSION_KEY] ?? {};
    delete stored[String(tabId)];
    await browser.storage.session.set({ [SESSION_KEY]: stored });
  } catch {
    // session storage not available
  }
}

async function loadIndex(): Promise<LibraryIndex | null> {
  if (!cachedIndex) {
    cachedIndex = await getLibraryIndex();
    if (cachedIndex) {
      const movieTmdb = Object.keys(cachedIndex.movies.byTmdbId).length;
      const movieImdb = Object.keys(cachedIndex.movies.byImdbId).length;
      const showTvdb = Object.keys(cachedIndex.shows.byTvdbId).length;
      const showTmdb = Object.keys(cachedIndex.shows.byTmdbId).length;
      const showImdb = Object.keys(cachedIndex.shows.byImdbId).length;
      console.log(
        `Parrot: loaded index from storage — movies: ${movieTmdb} tmdb / ${movieImdb} imdb, shows: ${showTvdb} tvdb / ${showTmdb} tmdb / ${showImdb} imdb`,
      );
    } else {
      console.log("Parrot: no index found in storage");
    }
  }
  return cachedIndex;
}

function buildPlexUrl(machineIdentifier: string, plexKey: string): string {
  return `https://app.plex.tv/desktop/#!/server/${machineIdentifier}/details?key=%2Flibrary%2Fmetadata%2F${plexKey}`;
}

async function handleCheck(
  message: Extract<Message, { type: "CHECK" }>,
  index: LibraryIndex,
): Promise<CheckResponse> {
  const { mediaType, source, id } = message;

  let item: OwnedItem | undefined;

  if (source === "title") {
    // Title-based lookup: id is a normalized key (e.g. "some title|2025")
    const map = mediaType === "movie" ? index.movies.byTitle : index.shows.byTitle;
    item = map[id];
  } else if (mediaType === "movie") {
    const map =
      source === "tmdb"
        ? index.movies.byTmdbId
        : index.movies.byImdbId;
    item = map[id];
  } else {
    const map =
      source === "tvdb"
        ? index.shows.byTvdbId
        : source === "tmdb"
          ? index.shows.byTmdbId
          : index.shows.byImdbId;
    item = map[id];
  }

  if (!item) return { owned: false };

  // Build deep link if machineIdentifier is available
  const config = await getConfig();
  const plexUrl = config?.machineIdentifier
    ? buildPlexUrl(config.machineIdentifier, item.plexKey)
    : undefined;

  return { owned: true, item, plexUrl };
}

type IconState = "owned" | "not-owned" | "inactive";

const ICON_COLORS: Record<IconState, { bg: string; border: string; letter: string }> = {
  owned: { bg: "#1a1a1a", border: "#ebaf00", letter: "#ffffff" },
  "not-owned": { bg: "#3a3a3a", border: "#888888", letter: "#888888" },
  inactive: { bg: "#cccccc", border: "#999999", letter: "#666666" },
};

function roundedRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawIcon(size: number, state: IconState): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const c = ICON_COLORS[state];

  // Rounded rectangle background
  const borderWidth = Math.max(1, Math.round(size * 0.08));
  const radius = Math.round(size * 0.18);
  const inset = borderWidth / 2;

  roundedRect(ctx, inset, inset, size - borderWidth, size - borderWidth, radius);
  ctx.fillStyle = c.bg;
  ctx.fill();
  ctx.strokeStyle = c.border;
  ctx.lineWidth = borderWidth;
  ctx.stroke();

  // "P" letter centered
  const fontSize = Math.round(size * 0.6);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = c.letter;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("P", size / 2, size / 2 + size * 0.04);

  return ctx.getImageData(0, 0, size, size);
}

function getIconImageData(state: IconState): Record<string, ImageData> {
  return {
    "16": drawIcon(16, state),
    "32": drawIcon(32, state),
    "48": drawIcon(48, state),
    "128": drawIcon(128, state),
  };
}

async function fetchTabMetadata(tabId: number, info: TabMediaInfo) {
  try {
    const options = await getOptions();
    if (!options.tmdbApiKey) return;

    // Resolve TMDB ID if not already known
    let tmdbId = info.tmdbId;
    if (!tmdbId && info.source === "imdb") {
      tmdbId = (await findByImdbId(options.tmdbApiKey, info.id)) ?? undefined;
    } else if (!tmdbId && info.source === "tvdb") {
      tmdbId = (await findByTvdbId(options.tmdbApiKey, info.id)) ?? undefined;
    }
    if (tmdbId) info.tmdbId = tmdbId;

    if (!tmdbId) return;

    if (info.mediaType === "movie") {
      const details = await getMovie(options.tmdbApiKey, tmdbId);
      info.title = details.title;
      info.year = details.release_date ? parseInt(details.release_date.slice(0, 4)) : undefined;
      info.posterPath = details.poster_path;

      // Collection summary
      if (details.belongs_to_collection) {
        try {
          const collId = details.belongs_to_collection.id;
          let collection = await getCachedCollection(collId);
          if (!collection) {
            collection = await getCollection(options.tmdbApiKey, collId);
            await saveCachedCollection(collection);
          }
          const index = await loadIndex();
          let ownedCount = 0;
          for (const part of collection.parts) {
            if (index?.movies.byTmdbId[String(part.id)]) ownedCount++;
          }
          info.collectionName = collection.name;
          info.collectionOwned = ownedCount;
          info.collectionTotal = collection.parts.length;
        } catch (err) {
          console.error("Parrot: collection summary fetch failed", err);
        }
      }
    } else {
      const details = await getTvShow(options.tmdbApiKey, tmdbId);
      info.title = details.name;
      info.posterPath = details.poster_path ?? null;
      info.seasonCount = details.number_of_seasons;
      info.episodeCount = details.number_of_episodes;
      info.showStatus = details.status;
    }
    persistTabMedia(tabId, info);
  } catch (err) {
    console.error("Parrot: metadata fetch failed", err);
  }
}

async function setTabIcon(tabId: number, state: IconState) {
  try {
    await browser.action.setIcon({ imageData: getIconImageData(state), tabId });
  } catch (err) {
    console.error("Parrot: failed to set tab icon", err);
  }
}

export default defineBackground(() => {
  // Set default inactive icon on startup
  try {
    browser.action.setIcon({ imageData: getIconImageData("inactive") });
  } catch (err) {
    console.error("Parrot: failed to set default icon", err);
  }

  // Index is lazy-loaded on first CHECK via loadIndex()
  // Users refresh manually via popup or options page

  browser.runtime.onMessage.addListener(
    (message: Message, _sender, sendResponse) => {
      (async () => {
        switch (message.type) {
          case "TEST_CONNECTION": {
            const result: TestConnectionResponse = await testConnection(
              message.config,
            );
            sendResponse(result);
            break;
          }

          case "BUILD_INDEX": {
            const config = await getConfig();
            if (!config) {
              sendResponse({
                success: false,
                error: "Not configured",
              } satisfies BuildIndexResponse);
              break;
            }
            try {
              const index = await buildLibraryIndex(config);
              await saveLibraryIndex(index);
              cachedIndex = index;
              sendResponse({
                success: true,
                itemCount: index.itemCount,
              } satisfies BuildIndexResponse);
            } catch (err) {
              sendResponse({
                success: false,
                error: String(err),
              } satisfies BuildIndexResponse);
            }
            break;
          }

          case "GET_STATUS": {
            const config = await getConfig();
            const index = await loadIndex();
            const statusOptions = await getOptions();
            // Count unique items by plexKey to avoid duplicates across maps
            let movieCount = 0;
            let showCount = 0;
            if (index) {
              const movieKeys = new Set<string>();
              for (const item of Object.values(index.movies.byTmdbId)) movieKeys.add(item.plexKey);
              for (const item of Object.values(index.movies.byImdbId)) movieKeys.add(item.plexKey);
              for (const item of Object.values(index.movies.byTitle)) movieKeys.add(item.plexKey);
              movieCount = movieKeys.size;

              const showKeys = new Set<string>();
              for (const item of Object.values(index.shows.byTvdbId)) showKeys.add(item.plexKey);
              for (const item of Object.values(index.shows.byTmdbId)) showKeys.add(item.plexKey);
              for (const item of Object.values(index.shows.byImdbId)) showKeys.add(item.plexKey);
              for (const item of Object.values(index.shows.byTitle)) showKeys.add(item.plexKey);
              showCount = showKeys.size;
            }
            sendResponse({
              configured: !!config,
              lastRefresh: index?.lastRefresh ?? null,
              itemCount: index?.itemCount ?? 0,
              movieCount,
              showCount,
              tmdbConfigured: !!statusOptions.tmdbApiKey,
              tvdbConfigured: !!statusOptions.tvdbApiKey,
            } satisfies StatusResponse);
            break;
          }

          case "CHECK": {
            const tabId = _sender.tab?.id;
            const index = await loadIndex();
            if (!index) {
              console.log("Parrot CHECK: no index loaded, returning not owned");
              if (tabId) await setTabIcon(tabId, "not-owned");
              sendResponse({ owned: false } satisfies CheckResponse);
              break;
            }
            const result = await handleCheck(message, index);
            console.log(
              `Parrot CHECK: ${message.mediaType} ${message.source}:${message.id} → ${result.owned ? "OWNED" : "not owned"}`,
              result.owned ? result.item : "",
            );
            if (tabId) await setTabIcon(tabId, result.owned ? "owned" : "not-owned");

            // Cache tab media info for popup dashboard
            if (tabId) {
              const mediaInfo: TabMediaInfo = {
                mediaType: message.mediaType,
                source: message.source,
                id: message.id,
                owned: result.owned,
                plexUrl: result.plexUrl,
                tmdbId: result.item?.tmdbId ?? (message.source === "tmdb" ? parseInt(message.id) : undefined),
                imdbId: result.item?.imdbId ?? (message.source === "imdb" ? message.id : undefined),
                tvdbId: result.item?.tvdbId ?? (message.source === "tvdb" ? parseInt(message.id) : undefined),
                title: result.item?.title,
                year: result.item?.year,
              };
              persistTabMedia(tabId, mediaInfo);
              // Fire-and-forget metadata fetch
              fetchTabMetadata(tabId, mediaInfo);
            }

            sendResponse(result);
            break;
          }

          case "GET_OPTIONS": {
            const options = await getOptions();
            sendResponse({ options } satisfies OptionsResponse);
            break;
          }

          case "SAVE_OPTIONS": {
            await saveOptions(message.options);
            sendResponse({ success: true } satisfies SaveOptionsResponse);
            break;
          }

          case "VALIDATE_TMDB_KEY": {
            try {
              const res = await fetch(
                `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(message.apiKey)}`,
                { headers: { Accept: "application/json" } },
              );
              if (res.ok) {
                sendResponse({ valid: true } satisfies ValidateTmdbKeyResponse);
              } else if (res.status === 401) {
                sendResponse({ valid: false, error: "Invalid API key" } satisfies ValidateTmdbKeyResponse);
              } else {
                sendResponse({ valid: false, error: `TMDB returned ${res.status}` } satisfies ValidateTmdbKeyResponse);
              }
            } catch {
              sendResponse({ valid: false, error: "Could not reach TMDB — check your connection" } satisfies ValidateTmdbKeyResponse);
            }
            break;
          }

          case "VALIDATE_TVDB_KEY": {
            try {
              const valid = await validateTvdbKey(message.apiKey);
              if (valid) {
                sendResponse({ valid: true } satisfies ValidateTvdbKeyResponse);
              } else {
                sendResponse({ valid: false, error: "Invalid API key" } satisfies ValidateTvdbKeyResponse);
              }
            } catch {
              sendResponse({ valid: false, error: "Could not reach TVDB — check your connection" } satisfies ValidateTvdbKeyResponse);
            }
            break;
          }

          case "CLEAR_CACHE": {
            await browser.storage.local.clear();
            cachedIndex = null;
            console.log("Parrot: cache cleared");
            sendResponse({ success: true } satisfies ClearCacheResponse);
            break;
          }

          case "GET_TAB_MEDIA": {
            const media = await getTabMedia(message.tabId);
            sendResponse({ media } satisfies TabMediaResponse);
            break;
          }

          case "GET_STORAGE_USAGE": {
            try {
              const bytesUsed = await browser.storage.local.getBytesInUse(null);
              sendResponse({
                bytesUsed,
                quota: (browser.storage.local as unknown as { QUOTA_BYTES?: number }).QUOTA_BYTES ?? 10_485_760,
              } satisfies StorageUsageResponse);
            } catch {
              // Fallback: estimate from index size
              const index = await loadIndex();
              const bytesUsed = index ? JSON.stringify(index).length : 0;
              sendResponse({
                bytesUsed,
                quota: null,
              } satisfies StorageUsageResponse);
            }
            break;
          }

          case "CHECK_EPISODES": {
            try {
              const options = await getOptions();
              const useTvdb = message.source === "tvdb" && !!options.tvdbApiKey;

              // Need at least one API key
              if (!useTvdb && !options.tmdbApiKey) {
                sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
                break;
              }

              // Look up show in library index
              const index = await loadIndex();
              if (!index) {
                sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
                break;
              }

              const showMap =
                message.source === "tmdb"
                  ? index.shows.byTmdbId
                  : index.shows.byTvdbId;
              const ownedShow: OwnedItem | undefined = showMap[message.id];
              if (!ownedShow) {
                sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
                break;
              }

              // Build cache key based on source
              const cacheKey = `${message.source}:${message.id}`;

              // Check cache
              const cached = await getCachedEpisodeGaps(cacheKey);
              if (cached) {
                console.log(`Parrot EPISODES: cache hit for ${cacheKey}`);
                sendResponse({
                  hasGaps: cached.seasons.some((s) => s.missing.length > 0),
                  gaps: {
                    showTitle: cached.showTitle,
                    totalOwned: cached.totalOwned,
                    totalEpisodes: cached.totalEpisodes,
                    completeSeasons: cached.completeSeasons,
                    totalSeasons: cached.totalSeasons,
                    seasons: cached.seasons,
                  },
                } satisfies EpisodeGapResponse);
                break;
              }

              // Fetch Plex episodes (transient — not stored)
              const config = await getConfig();
              if (!config) {
                sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
                break;
              }
              const plexEpisodes = await fetchShowEpisodes(config, ownedShow.plexKey);
              const ownedSet = new Set(
                plexEpisodes.map((ep) => `S${ep.seasonNumber}E${ep.episodeNumber}`),
              );

              const today = new Date().toISOString().split("T")[0];
              let seasonGaps: SeasonGapInfo[];
              let showTitle: string;

              if (useTvdb) {
                // --- TVDB path: one paginated call for all episodes ---
                const allEpisodes = await getSeriesEpisodes(options.tvdbApiKey, message.id);
                showTitle = ownedShow.title;

                // Group episodes by season
                const bySeason = new Map<number, typeof allEpisodes>();
                for (const ep of allEpisodes) {
                  if (options.excludeSpecials && ep.seasonNumber === 0) continue;
                  if (options.excludeFuture && (!ep.aired || ep.aired >= today)) continue;
                  const list = bySeason.get(ep.seasonNumber) ?? [];
                  list.push(ep);
                  bySeason.set(ep.seasonNumber, list);
                }

                seasonGaps = [];
                const sortedSeasons = [...bySeason.keys()].sort((a, b) => a - b);

                for (const seasonNum of sortedSeasons) {
                  const episodes = bySeason.get(seasonNum)!;
                  const missing: SeasonGapInfo["missing"] = [];
                  let ownedCount = 0;

                  for (const ep of episodes) {
                    const key = `S${ep.seasonNumber}E${ep.number}`;
                    if (ownedSet.has(key)) {
                      ownedCount++;
                    } else {
                      missing.push({
                        number: ep.number,
                        name: ep.name ?? `Episode ${ep.number}`,
                        airDate: ep.aired ?? undefined,
                      });
                    }
                  }

                  seasonGaps.push({
                    seasonNumber: seasonNum,
                    ownedCount,
                    totalCount: episodes.length,
                    missing,
                  });
                }

                console.log(`Parrot EPISODES: using TVDB for ${message.id}`);
              } else {
                // --- TMDB path: per-season fetching ---
                let tmdbId: number;
                if (message.source === "tmdb") {
                  tmdbId = parseInt(message.id);
                } else {
                  const found = await findByTvdbId(options.tmdbApiKey, message.id);
                  if (!found) {
                    console.log(`Parrot EPISODES: could not find TMDB ID for TVDB ${message.id}`);
                    sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
                    break;
                  }
                  tmdbId = found;
                }

                const tvShow = await getTvShow(options.tmdbApiKey, tmdbId);
                showTitle = tvShow.name;

                let seasons = tvShow.seasons;
                if (options.excludeSpecials) {
                  seasons = seasons.filter((s) => s.season_number !== 0);
                }

                seasonGaps = [];

                for (const season of seasons) {
                  if (season.episode_count === 0) continue;

                  const tmdbSeason = await getTvSeason(options.tmdbApiKey, tmdbId, season.season_number);
                  let episodes = tmdbSeason.episodes;

                  if (options.excludeFuture) {
                    episodes = episodes.filter((ep) => ep.air_date && ep.air_date < today);
                  }

                  if (episodes.length === 0) continue;

                  const missing: SeasonGapInfo["missing"] = [];
                  let ownedCount = 0;

                  for (const ep of episodes) {
                    const key = `S${season.season_number}E${ep.episode_number}`;
                    if (ownedSet.has(key)) {
                      ownedCount++;
                    } else {
                      missing.push({
                        number: ep.episode_number,
                        name: ep.name,
                        airDate: ep.air_date ?? undefined,
                      });
                    }
                  }

                  seasonGaps.push({
                    seasonNumber: season.season_number,
                    ownedCount,
                    totalCount: episodes.length,
                    missing,
                  });
                }

                console.log(`Parrot EPISODES: using TMDB for ${message.id}`);
              }

              const totalOwned = seasonGaps.reduce((sum, s) => sum + s.ownedCount, 0);
              const totalEpisodes = seasonGaps.reduce((sum, s) => sum + s.totalCount, 0);
              const completeSeasons = seasonGaps.filter((s) => s.missing.length === 0).length;
              const hasAnyGaps = seasonGaps.some((s) => s.missing.length > 0);

              // Cache the result
              const cacheEntry: EpisodeGapCacheEntry = {
                showTitle,
                cacheKey,
                seasons: seasonGaps,
                totalOwned,
                totalEpisodes,
                completeSeasons,
                totalSeasons: seasonGaps.length,
                fetchedAt: Date.now(),
              };
              await saveCachedEpisodeGaps(cacheEntry);

              console.log(
                `Parrot EPISODES: ${showTitle} — ${totalOwned}/${totalEpisodes} episodes, ${completeSeasons}/${seasonGaps.length} seasons complete`,
              );

              sendResponse({
                hasGaps: hasAnyGaps,
                gaps: {
                  showTitle,
                  totalOwned,
                  totalEpisodes,
                  completeSeasons,
                  totalSeasons: seasonGaps.length,
                  seasons: seasonGaps,
                },
              } satisfies EpisodeGapResponse);
            } catch (err) {
              console.error("Parrot: episode check failed", err);
              sendResponse({ hasGaps: false } satisfies EpisodeGapResponse);
            }
            break;
          }

          case "FIND_TMDB_ID": {
            try {
              const options = await getOptions();
              if (!options.tmdbApiKey) {
                sendResponse({ tmdbId: null } satisfies FindTmdbIdResponse);
                break;
              }
              const resolver = message.source === "imdb" ? findByImdbId : findByTvdbId;
              const tmdbId = await resolver(options.tmdbApiKey, message.id);
              sendResponse({ tmdbId } satisfies FindTmdbIdResponse);
            } catch (err) {
              console.error("Parrot: FIND_TMDB_ID failed", err);
              sendResponse({ tmdbId: null } satisfies FindTmdbIdResponse);
            }
            break;
          }

          case "CHECK_COLLECTION": {
            try {
              const options = await getOptions();
              if (!options.tmdbApiKey) {
                sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
                break;
              }

              const movieId = parseInt(message.tmdbMovieId);
              const movieData = await getMovie(options.tmdbApiKey, movieId);
              if (!movieData.belongs_to_collection) {
                sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
                break;
              }

              const collectionId = movieData.belongs_to_collection.id;

              // Check cache first
              let collection = await getCachedCollection(collectionId);
              if (!collection) {
                collection = await getCollection(options.tmdbApiKey, collectionId);
                await saveCachedCollection(collection);
              }

              // Filter parts based on options
              const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
              let parts = collection.parts;
              if (options.excludeFuture) {
                parts = parts.filter((m) => m.release_date && m.release_date < today);
              }

              // Check size filters
              if (parts.length < options.minCollectionSize) {
                sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
                break;
              }

              // Check ownership against library index
              const index = await loadIndex();
              const config = await getConfig();
              const ownedMovies: { title: string; year?: number; plexUrl?: string }[] = [];
              const missingMovies: { title: string; releaseDate?: string; tmdbId: number }[] = [];

              for (const part of parts) {
                const tmdbId = String(part.id);
                const ownedItem: OwnedItem | undefined = index?.movies.byTmdbId[tmdbId];

                if (ownedItem) {
                  const plexUrl = config?.machineIdentifier
                    ? buildPlexUrl(config.machineIdentifier, ownedItem.plexKey)
                    : undefined;
                  ownedMovies.push({
                    title: part.title,
                    year: part.release_date ? parseInt(part.release_date.slice(0, 4)) : undefined,
                    plexUrl,
                  });
                } else {
                  missingMovies.push({
                    title: part.title,
                    releaseDate: part.release_date || undefined,
                    tmdbId: part.id,
                  });
                }
              }

              // Apply minOwned filter
              if (ownedMovies.length < options.minOwned) {
                sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
                break;
              }

              console.log(
                `Parrot COLLECTION: ${collection.name} — ${ownedMovies.length}/${parts.length} owned, ${missingMovies.length} missing`,
              );

              sendResponse({
                hasCollection: true,
                collection: {
                  name: collection.name,
                  totalMovies: parts.length,
                  ownedMovies,
                  missingMovies,
                },
              } satisfies CollectionCheckResponse);
            } catch (err) {
              console.error("Parrot: collection check failed", err);
              sendResponse({ hasCollection: false } satisfies CollectionCheckResponse);
            }
            break;
          }
        }
      })();
      return true; // keep message channel open for async response
    },
  );

  // Clean up stale tab media cache entries
  browser.tabs.onRemoved.addListener((tabId) => {
    removeTabMedia(tabId);
  });
});
