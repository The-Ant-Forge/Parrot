/**
 * fetch with an AbortController timeout.
 *
 * Every network call in Parrot should go through this (or implement the same
 * pattern locally, as the proxy clients do): a hung upstream otherwise blocks
 * its whole pipeline — the OMDb client once stalled rating delivery for the
 * browser-default ~300 s, and TVMaze sits directly in the CHECK hot path.
 *
 * Pick the timeout per operation: interactive lookups want ~10 s; a full
 * multi-thousand-item Plex library fetch needs far more (see plexFetch's 30 s).
 */

export const INTERACTIVE_TIMEOUT_MS = 10000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = INTERACTIVE_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
