import type { PlexConfig, LibraryIndex, ParrotOptions } from "./types";
import { DEFAULT_OPTIONS } from "./types";
import type { TMDBCollection } from "../api/tmdb";

const CONFIG_KEY = "plexConfig";
const INDEX_KEY = "libraryIndex";
const OPTIONS_KEY = "parrotOptions";
const COLLECTION_CACHE_KEY = "tmdbCollections";

const COLLECTION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CollectionCacheEntry {
  data: TMDBCollection;
  fetchedAt: number;
}

type CollectionCache = Record<string, CollectionCacheEntry>;

export async function getConfig(): Promise<PlexConfig | null> {
  const result = await browser.storage.sync.get(CONFIG_KEY);
  return (result[CONFIG_KEY] as PlexConfig) ?? null;
}

export async function saveConfig(config: PlexConfig): Promise<void> {
  await browser.storage.sync.set({ [CONFIG_KEY]: config });
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
