/**
 * Shared title-based CHECK logic with year fallback.
 * Used by content scripts that match by title (PSA, JustWatch, RT, Metacritic).
 */

import { debugLog } from "./logger";
import { buildTitleKey } from "./normalize";
import type { CheckResponse } from "./types";

/** Send a CHECK with title-based matching, retrying without year if no match. */
export async function tryTitleCheck(
  mediaType: "movie" | "show",
  title: string,
  year: number | undefined,
): Promise<CheckResponse> {
  const titleKey = buildTitleKey(title, year);
  debugLog("TitleCheck", `trying ${mediaType} title:"${title}" year:${year ?? "none"} key:${titleKey}`);
  let response: CheckResponse = await browser.runtime.sendMessage({
    type: "CHECK",
    mediaType,
    source: "title",
    id: titleKey,
  });

  // If year was present but no match, retry without year
  if (!response.owned && year) {
    debugLog("TitleCheck", `retrying without year → key:${buildTitleKey(title)}`);
    const fallbackKey = buildTitleKey(title);
    response = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType,
      source: "title",
      id: fallbackKey,
    });
  }

  return response;
}
