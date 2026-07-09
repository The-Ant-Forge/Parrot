/**
 * Shared content-script helpers for CHECK + gap detection patterns.
 *
 * Consolidates repeated logic across 8-12 content scripts:
 * - IMDb fallback (try opposite media type when source is IMDb)
 * - Gap check with movie fallback (always try collection check for unowned)
 * - Ownership update listener (deferred TMDB re-check → gap check)
 */

import { onOwnershipUpdated } from "./badge";
import { checkGaps, type GapSource } from "./gap-checker";
import { debugLog } from "./logger";
import type { CheckResponse } from "./types";

/**
 * IMDb fallback: promote the background's resolved media type if the
 * requested one was wrong. `handleCheck` does the dual-lookup server-side
 * for IMDb sources and reports the result via `response.resolvedMediaType`;
 * this helper just promotes that value to the caller. (It used to fire a
 * second CHECK itself, which raced the first CHECK's async enrichment in
 * `tabMediaCache` — the "popup shows Unknown while the badge is correct"
 * bug fixed in v1.22/v1.23.)
 */
export function checkWithImdbFallback(
  mediaType: "movie" | "show",
  source: string,
  response: CheckResponse,
): { mediaType: "movie" | "show"; response: CheckResponse } {
  if (response.owned || source !== "imdb") {
    return { mediaType, response };
  }
  if (response.resolvedMediaType && response.resolvedMediaType !== mediaType) {
    return { mediaType: response.resolvedMediaType, response };
  }
  return { mediaType, response };
}

/**
 * Gap check with movie fallback: if owned, check gaps with the resolved type;
 * if not owned, always check with "movie" to catch collection gaps.
 */
export function checkGapsWithFallback(
  mediaType: "movie" | "show",
  source: GapSource,
  id: string,
  response: CheckResponse,
): void {
  if (response.owned || mediaType === "movie") {
    void checkGaps({ mediaType, source, id, response });
  } else {
    void checkGaps({ mediaType: "movie", source, id, response });
  }
}

/**
 * Listen for deferred ownership updates (TMDB re-check resolved the item).
 * Triggers gap detection with the newly resolved ID.
 */
export function setupOwnershipListener(site: string): void {
  onOwnershipUpdated((msg) => {
    debugLog(site, "ownership updated via TMDB re-check →", msg.source + ":" + msg.id);
    void checkGaps({
      mediaType: msg.mediaType,
      source: msg.source as "tmdb",
      id: msg.id,
      response: { owned: true, plexUrl: msg.plexUrl },
    });
  });
}
