/**
 * Shared content-script helpers for CHECK + gap detection patterns.
 *
 * Consolidates repeated logic across 8-12 content scripts:
 * - IMDb fallback (try opposite media type when source is IMDb)
 * - Gap check with movie fallback (always try collection check for unowned)
 * - Ownership update listener (deferred TMDB re-check → gap check)
 */

import { onOwnershipUpdated } from "./badge";
import { checkGaps } from "./gap-checker";
import { debugLog } from "./logger";
import type { CheckResponse } from "./types";

/**
 * IMDb fallback: promote the background's resolved media type if the
 * requested one was wrong. Previously this helper fired a second CHECK
 * to retry with the opposite media type, but that caused a race in
 * `tabMediaCache` — the second response (typically owned:false with
 * empty metadata) could overwrite the first CHECK's async TMDB cross-ref
 * flip, leaving the popup showing "Unknown" while the badge was correct.
 *
 * Since v1.22, `handleCheck` does the dual-lookup server-side for IMDb
 * sources and reports the result via `response.resolvedMediaType`, so
 * this helper just promotes that value to the caller. No second CHECK,
 * no race. Kept as a sync function to preserve the existing call sites
 * but the signature stays Promise-returning for backward compatibility.
 */
export async function checkWithImdbFallback(
  mediaType: "movie" | "show",
  source: string,
  _id: string,
  response: CheckResponse,
): Promise<{ mediaType: "movie" | "show"; response: CheckResponse }> {
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
  source: string,
  id: string,
  response: CheckResponse,
): void {
  if (response.owned || mediaType === "movie") {
    checkGaps({ mediaType, source, id, response });
  } else {
    checkGaps({ mediaType: "movie", source, id, response });
  }
}

/**
 * Listen for deferred ownership updates (TMDB re-check resolved the item).
 * Triggers gap detection with the newly resolved ID.
 */
export function setupOwnershipListener(site: string): void {
  onOwnershipUpdated((msg) => {
    debugLog(site, "ownership updated via TMDB re-check →", msg.source + ":" + msg.id);
    checkGaps({
      mediaType: msg.mediaType,
      source: msg.source as "tmdb",
      id: msg.id,
      response: { owned: true, plexUrl: msg.plexUrl },
    });
  });
}
