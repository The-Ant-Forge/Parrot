/**
 * Shared logging utility gated by the debugLogging option.
 * When debug logging is off, the extension produces no console output.
 * When on, both debug info and errors are logged.
 */

import { getOptions } from "./storage";

let _debugEnabled: boolean | undefined;
let _debugCheckedAt = 0;
const DEBUG_TTL = 60_000; // re-check storage every 60 s

async function isDebugEnabled(): Promise<boolean> {
  const now = Date.now();
  if (_debugEnabled !== undefined && now - _debugCheckedAt < DEBUG_TTL) return _debugEnabled;
  try {
    const opts = await getOptions();
    _debugEnabled = opts.debugLogging;
  } catch {
    _debugEnabled = false;
  }
  _debugCheckedAt = now;
  return _debugEnabled;
}

function log(kind: "log" | "error", site: string, args: unknown[]): void {
  // Fire-and-forget by design: logging must never block or be awaitable.
  // The options read races the first few logs after a cold start; acceptable.
  void isDebugEnabled().then((enabled) => {
    if (enabled) console[kind](`Parrot ${site}:`, ...args);
  });
}

/** Log debug information (only when debugLogging is enabled). */
export function debugLog(site: string, ...args: unknown[]): void {
  log("log", site, args);
}

/** Log an error (only when debugLogging is enabled). */
export function errorLog(site: string, ...args: unknown[]): void {
  log("error", site, args);
}
