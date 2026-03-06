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
 * IMDb fallback: if CHECK returned not-owned and source is "imdb",
 * retry with the opposite media type (IMDb URLs are ambiguous).
 *
 * Returns the (possibly updated) mediaType and response.
 */
export async function checkWithImdbFallback(
  mediaType: "movie" | "show",
  source: string,
  id: string,
  response: CheckResponse,
): Promise<{ mediaType: "movie" | "show"; response: CheckResponse }> {
  if (response.owned || source !== "imdb") {
    return { mediaType, response };
  }
  const opposite: "movie" | "show" = mediaType === "movie" ? "show" : "movie";
  const retry: CheckResponse = await browser.runtime.sendMessage({
    type: "CHECK",
    mediaType: opposite,
    source: "imdb",
    id,
  });
  if (retry.owned) return { mediaType: opposite, response: retry };
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
