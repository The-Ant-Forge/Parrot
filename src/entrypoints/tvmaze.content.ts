import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractTvmazeFromUrl } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  const info = extractTvmazeFromUrl(location.href);
  debugLog("TVMaze", "checking", location.href, "→", info ? "tvmaze:" + info.id : "no ID");
  if (!info) return;

  const anchor = document.querySelector("header.columns h1") ?? document.querySelector("h1");
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    const response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: "show",
      source: "tvmaze",
      id: info.id,
    });
    debugLog("TVMaze", "show", "tvmaze:" + info.id, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned) {
      // Gap check needs a TVDB or TMDB id. When the owned item carries
      // neither (e.g. it matched via the IMDb map), skip rather than pass
      // the TVMaze id under a false source — a numeric collision with a
      // real TVDB id would render another show's episode panel.
      if (response.item?.tvdbId) {
        void checkGaps({ mediaType: "show", source: "tvdb", id: String(response.item.tvdbId), response });
      } else if (response.item?.tmdbId) {
        void checkGaps({ mediaType: "show", source: "tmdb", id: String(response.item.tmdbId), response });
      } else {
        debugLog("TVMaze", "owned item has no TVDB/TMDB id — skipping gap check");
      }
    }
  } catch (err) {
    errorLog("TVMaze", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.tvmaze.com/shows/*", "*://tvmaze.com/shows/*"],
  runAt: "document_idle",
  main() {
    debugLog("TVMaze", "v" + browser.runtime.getManifest().version, "loaded");
    void checkAndBadge();
  },
});
