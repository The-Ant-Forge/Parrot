import type { PlexConfig, LibraryIndex, ParrotOptions } from "./types";
import { DEFAULT_OPTIONS } from "./types";

const CONFIG_KEY = "plexConfig";
const INDEX_KEY = "libraryIndex";
const OPTIONS_KEY = "parrotOptions";

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
