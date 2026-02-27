import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  const extId = scanLinksForExternalId({ sources: ["tmdb", "imdb", "tvdb", "tvmaze"] });
  debugLog("TVDBMovies", "checking", location.href, "→", extId ? extId.source + ":" + extId.id : "no links");
  if (!extId) return;

  const anchor = document.querySelector("h1");
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    const response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: "movie",
      source: extId.source,
      id: extId.id,
    });

    debugLog("TVDBMovies", "movie", extId.source + ":" + extId.id, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    checkGaps({
      mediaType: "movie",
      source: extId.source,
      id: extId.id,
      response,
    });
  } catch (err) {
    errorLog("TVDBMovies", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.thetvdb.com/movies/*"],
  runAt: "document_idle",
  main() {
    debugLog("TVDBMovies", "v" + browser.runtime.getManifest().version, "loaded");
    checkAndBadge();
    observeUrlChanges(checkAndBadge);
  },
});
