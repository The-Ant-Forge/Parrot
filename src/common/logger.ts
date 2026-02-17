/**
 * Shared logging utility gated by the debugLogging option.
 * When debug logging is off, the extension produces no console output.
 * When on, both debug info and errors are logged.
 */

import { getOptions } from "./storage";

let _debugEnabled: boolean | undefined;

async function isDebugEnabled(): Promise<boolean> {
  if (_debugEnabled !== undefined) return _debugEnabled;
  try {
    const opts = await getOptions();
    _debugEnabled = opts.debugLogging;
  } catch {
    _debugEnabled = false;
  }
  return _debugEnabled;
}

/** Log debug information (only when debugLogging is enabled). */
export async function debugLog(site: string, ...args: unknown[]): Promise<void> {
  if (await isDebugEnabled()) {
    console.log(`Parrot ${site}:`, ...args);
  }
}

/** Log an error (only when debugLogging is enabled). */
export async function errorLog(site: string, ...args: unknown[]): Promise<void> {
  if (await isDebugEnabled()) {
    console.error(`Parrot ${site}:`, ...args);
  }
}
