import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractTmdbFromUrl } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  const info = extractTmdbFromUrl(location.href);
  debugLog("TMDB", "extracted", info, "from", location.href);
  if (!info) return;

  // TMDB title is inside the header section
  const anchor =
    document.querySelector("section.inner_content h2 a") ??
    document.querySelector("section.inner_content h2") ??
    document.querySelector(".title h2 a") ??
    document.querySelector(".title h2") ??
    document.querySelector("h2 a");

  debugLog("TMDB", "anchor element", anchor?.tagName, anchor?.className, anchor?.textContent?.trim().slice(0, 40));
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    const response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: info.mediaType,
      source: "tmdb",
      id: info.id,
    });
    debugLog("TMDB", "response", response);
    updateBadgeFromResponse(badge, response);

    if (response.owned || info.mediaType === "movie") {
      checkGaps({
        mediaType: info.mediaType,
        source: "tmdb",
        id: info.id,
        response,
      });
    }
  } catch (err) {
    errorLog("TMDB", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: [
    "*://*.themoviedb.org/movie/*",
    "*://*.themoviedb.org/tv/*",
  ],
  runAt: "document_idle",
  main() {
    checkAndBadge();

    // TMDB is an SPA — re-check on navigation (debounced)
    observeUrlChanges(checkAndBadge);
  },
});
