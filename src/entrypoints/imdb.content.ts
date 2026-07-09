import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { setupOwnershipListener } from "../common/check-helpers";
import { extractImdbId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  const imdbId = extractImdbId(location.href);
  debugLog("IMDb", "checking", location.href, "→", imdbId ?? "no ID");
  if (!imdbId) return;

  const anchor =
    document.querySelector('h1[data-testid="hero-title-block__title"]') ??
    document.querySelector("h1");

  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    // IMDb URLs don't distinguish movie vs show. We send a single CHECK with
    // mediaType="movie" as a default; the background handles the ambiguity
    // by also checking the shows index if the movie lookup misses, and
    // reports the resolved type back via `resolvedMediaType`. Sending one
    // CHECK avoids the tabMedia race that two sequential CHECKs caused
    // (where the second's empty response could overwrite the first's
    // async ownership-flip).
    const response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: "movie",
      source: "imdb",
      id: imdbId,
    });
    const mediaType = response.resolvedMediaType ?? "movie";

    debugLog("IMDb", mediaType, "imdb:" + imdbId, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    // Gap detection: always for movies (collection check), owned-only for shows
    if (response.owned || mediaType === "movie") {
      void checkGaps({
        mediaType,
        source: "imdb",
        id: imdbId,
        response,
      });
    }
  } catch (err) {
    errorLog("IMDb", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.imdb.com/title/*"],
  runAt: "document_idle",
  main() {
    debugLog("IMDb", "v" + browser.runtime.getManifest().version, "loaded");
    // When background's async TMDB cross-ref resolves ownership later,
    // run gap detection with the resolved IDs.
    setupOwnershipListener("IMDb");
    void checkAndBadge();

    // IMDb uses client-side routing (debounced)
    observeUrlChanges(checkAndBadge);
  },
});
