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
      checkGaps({
        mediaType: "show",
        source: response.item?.tvdbId ? "tvdb" : response.item?.tmdbId ? "tmdb" : "tvdb",
        id: String(response.item?.tvdbId ?? response.item?.tmdbId ?? info.id),
        response,
      });
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
    checkAndBadge();
  },
});
