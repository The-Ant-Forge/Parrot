/**
 * Shared title-based CHECK logic with year fallback.
 * Used by content scripts that match by title (PSA, JustWatch, RT, Metacritic).
 */

import { debugLog } from "./logger";
import { buildTitleKey } from "./normalize";
import type { CheckResponse } from "./types";

/** Send a CHECK with title-based matching. */
export async function tryTitleCheck(
  mediaType: "movie" | "show",
  title: string,
  year: number | undefined,
): Promise<CheckResponse> {
  const titleKey = buildTitleKey(title, year);
  debugLog("TitleCheck", `trying ${mediaType} title:"${title}" year:${year ?? "none"} key:${titleKey}`);
  return await browser.runtime.sendMessage({
    type: "CHECK",
    mediaType,
    source: "title",
    id: titleKey,
  });
}
