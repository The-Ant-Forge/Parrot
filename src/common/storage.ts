import type { PlexConfig, LibraryIndex } from "./types";

const CONFIG_KEY = "plexConfig";
const INDEX_KEY = "libraryIndex";

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
