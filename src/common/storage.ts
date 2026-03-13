import type { PlexServerConfig, LibraryIndex, ParrotOptions, EpisodeGapCacheEntry, SiteDefinition } from "./types";
import { DEFAULT_OPTIONS } from "./types";
import type { TMDBCollection } from "../api/tmdb";

const SERVERS_KEY = "plexServers";
const INDEX_KEY = "libraryIndex";
const OPTIONS_KEY = "parrotOptions";
const COLLECTION_CACHE_KEY = "tmdbCollections";
const EPISODE_GAP_CACHE_KEY = "episodeGaps";

const COLLECTION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const EPISODE_GAP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CollectionCacheEntry {
  data: TMDBCollection;
  fetchedAt: number;
}

type CollectionCache = Record<string, CollectionCacheEntry>;

// --- Plex server config (multi-server) ---

export async function getServers(): Promise<PlexServerConfig[]> {
  const result = await browser.storage.sync.get(SERVERS_KEY);
  return (result[SERVERS_KEY] as PlexServerConfig[]) ?? [];
}

export async function saveServers(servers: PlexServerConfig[]): Promise<void> {
  await browser.storage.sync.set({ [SERVERS_KEY]: servers });
}

export async function getLibraryIndex(): Promise<LibraryIndex | null> {
  const result = await browser.storage.local.get(INDEX_KEY);
  return (result[INDEX_KEY] as LibraryIndex) ?? null;
}

export async function saveLibraryIndex(index: LibraryIndex): Promise<void> {
  await browser.storage.local.set({ [INDEX_KEY]: index });
}

export async function getOptions(): Promise<ParrotOptions> {
  const result = await browser.storage.sync.get(OPTIONS_KEY);
  const stored = result[OPTIONS_KEY] as Partial<ParrotOptions> | undefined;
  return { ...DEFAULT_OPTIONS, ...stored };
}

export async function saveOptions(options: ParrotOptions): Promise<void> {
  await browser.storage.sync.set({ [OPTIONS_KEY]: options });
}

export async function getCachedCollection(collectionId: number): Promise<TMDBCollection | null> {
  const result = await browser.storage.local.get(COLLECTION_CACHE_KEY);
  const cache = (result[COLLECTION_CACHE_KEY] as CollectionCache) ?? {};
  const entry = cache[String(collectionId)];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > COLLECTION_TTL_MS) return null;
  return entry.data;
}

export async function saveCachedCollection(collection: TMDBCollection): Promise<void> {
  const result = await browser.storage.local.get(COLLECTION_CACHE_KEY);
  const cache = (result[COLLECTION_CACHE_KEY] as CollectionCache) ?? {};
  cache[String(collection.id)] = { data: collection, fetchedAt: Date.now() };
  await browser.storage.local.set({ [COLLECTION_CACHE_KEY]: cache });
}

// --- Episode gap cache ---

type EpisodeGapCache = Record<string, EpisodeGapCacheEntry>;

export async function getCachedEpisodeGaps(cacheKey: string): Promise<EpisodeGapCacheEntry | null> {
  const result = await browser.storage.local.get(EPISODE_GAP_CACHE_KEY);
  const cache = (result[EPISODE_GAP_CACHE_KEY] as EpisodeGapCache) ?? {};
  const entry = cache[cacheKey];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > EPISODE_GAP_TTL_MS) return null;
  return entry;
}

export async function saveCachedEpisodeGaps(entry: EpisodeGapCacheEntry): Promise<void> {
  const result = await browser.storage.local.get(EPISODE_GAP_CACHE_KEY);
  const cache = (result[EPISODE_GAP_CACHE_KEY] as EpisodeGapCache) ?? {};
  cache[entry.cacheKey] = entry;
  await browser.storage.local.set({ [EPISODE_GAP_CACHE_KEY]: cache });
}

export async function clearEpisodeGapCache(): Promise<void> {
  await browser.storage.local.remove(EPISODE_GAP_CACHE_KEY);
}

// --- Update check ---

const UPDATE_CHECK_KEY = "updateCheck";

export interface UpdateCheckResult {
  latestVersion: string;
  downloadUrl: string;
  checkedAt: number;
}

export async function getUpdateCheck(): Promise<UpdateCheckResult | null> {
  const result = await browser.storage.local.get(UPDATE_CHECK_KEY);
  return (result[UPDATE_CHECK_KEY] as UpdateCheckResult) ?? null;
}

export async function saveUpdateCheck(check: UpdateCheckResult): Promise<void> {
  await browser.storage.local.set({ [UPDATE_CHECK_KEY]: check });
}

// --- Proxy response cache (Radarr/Sonarr) ---

const PROXY_CACHE_KEY = "proxyCache";

interface ProxyCacheEntry {
  data: unknown;
  fetchedAt: number;
}

type ProxyCache = Record<string, ProxyCacheEntry>;

export async function getProxyCache<T>(key: string, ttlMs: number): Promise<T | null> {
  const result = await browser.storage.local.get(PROXY_CACHE_KEY);
  const cache = (result[PROXY_CACHE_KEY] as ProxyCache) ?? {};
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttlMs) return null;
  return entry.data as T;
}

export async function setProxyCache(key: string, data: unknown): Promise<void> {
  const result = await browser.storage.local.get(PROXY_CACHE_KEY);
  const cache = (result[PROXY_CACHE_KEY] as ProxyCache) ?? {};
  cache[key] = { data, fetchedAt: Date.now() };
  await browser.storage.local.set({ [PROXY_CACHE_KEY]: cache });
}

export async function clearProxyCache(): Promise<void> {
  await browser.storage.local.remove(PROXY_CACHE_KEY);
}

// --- Custom sites ---

const CUSTOM_SITES_KEY = "customSites";

export async function getCustomSites(): Promise<SiteDefinition[]> {
  const result = await browser.storage.sync.get(CUSTOM_SITES_KEY);
  return (result[CUSTOM_SITES_KEY] as SiteDefinition[]) ?? [];
}

export async function saveCustomSites(sites: SiteDefinition[]): Promise<void> {
  await browser.storage.sync.set({ [CUSTOM_SITES_KEY]: sites });
}
