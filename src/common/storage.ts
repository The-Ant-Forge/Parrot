import type { PlexServerConfig, LibraryIndex, ParrotOptions, EpisodeGapCacheEntry, SiteDefinition } from "./types";
import { DEFAULT_OPTIONS } from "./types";
import type { TMDBCollection } from "../api/tmdb";

const SERVERS_KEY = "plexServers";
const INDEX_KEY = "libraryIndex";
const OPTIONS_KEY = "parrotOptions";
// Legacy single-blob cache keys (pre per-key storage) — removed on update
export const LEGACY_COLLECTION_CACHE_KEY = "tmdbCollections";
export const LEGACY_EPISODE_GAP_CACHE_KEY = "episodeGaps";
// Per-key cache prefixes (read-modify-write-free, like the proxy cache's pc:*)
const COLLECTION_PREFIX = "cc:";
const EPISODE_GAP_PREFIX = "eg:";

const COLLECTION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const EPISODE_GAP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CollectionCacheEntry {
  data: TMDBCollection;
  fetchedAt: number;
}

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
  const key = COLLECTION_PREFIX + String(collectionId);
  const result = await browser.storage.local.get(key);
  const entry = result[key] as CollectionCacheEntry | undefined;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > COLLECTION_TTL_MS) return null;
  return entry.data;
}

export async function saveCachedCollection(collection: TMDBCollection): Promise<void> {
  const key = COLLECTION_PREFIX + String(collection.id);
  await browser.storage.local.set({ [key]: { data: collection, fetchedAt: Date.now() } });
}

// --- Episode gap cache ---

export async function getCachedEpisodeGaps(cacheKey: string): Promise<EpisodeGapCacheEntry | null> {
  const key = EPISODE_GAP_PREFIX + cacheKey;
  const result = await browser.storage.local.get(key);
  const entry = result[key] as EpisodeGapCacheEntry | undefined;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > EPISODE_GAP_TTL_MS) return null;
  return entry;
}

export async function saveCachedEpisodeGaps(entry: EpisodeGapCacheEntry): Promise<void> {
  const key = EPISODE_GAP_PREFIX + entry.cacheKey;
  await browser.storage.local.set({ [key]: entry });
}

export async function clearEpisodeGapCache(): Promise<void> {
  const all = await browser.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter((k) => k.startsWith(EPISODE_GAP_PREFIX));
  // Also drop the pre-per-key blob if it's still around from an old version
  keysToRemove.push(LEGACY_EPISODE_GAP_CACHE_KEY);
  await browser.storage.local.remove(keysToRemove);
}

// --- Update check ---

const UPDATE_CHECK_KEY = "updateCheck";

export interface UpdateCheckResult {
  latestVersion: string;
  downloadUrl: string;       // release web page URL (github.com/.../releases/tag/v1.x.y)
  assetUrl?: string;         // direct ZIP asset URL when available
  checkedAt: number;
}

export async function getUpdateCheck(): Promise<UpdateCheckResult | null> {
  const result = await browser.storage.local.get(UPDATE_CHECK_KEY);
  return (result[UPDATE_CHECK_KEY] as UpdateCheckResult) ?? null;
}

export async function saveUpdateCheck(check: UpdateCheckResult): Promise<void> {
  await browser.storage.local.set({ [UPDATE_CHECK_KEY]: check });
}

// --- Proxy response cache (Radarr/Sonarr) — per-key storage ---

const PROXY_PREFIX = "pc:";

interface ProxyCacheEntry {
  data: unknown;
  fetchedAt: number;
}

export async function getProxyCache<T>(key: string, ttlMs: number): Promise<T | null> {
  const storageKey = PROXY_PREFIX + key;
  const result = await browser.storage.local.get(storageKey);
  const entry = result[storageKey] as ProxyCacheEntry | undefined;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttlMs) return null;
  return entry.data as T;
}

export async function setProxyCache(key: string, data: unknown): Promise<void> {
  const storageKey = PROXY_PREFIX + key;
  await browser.storage.local.set({ [storageKey]: { data, fetchedAt: Date.now() } });
}

export async function clearProxyCache(): Promise<void> {
  const all = await browser.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter(k => k.startsWith(PROXY_PREFIX));
  if (keysToRemove.length > 0) await browser.storage.local.remove(keysToRemove);
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
