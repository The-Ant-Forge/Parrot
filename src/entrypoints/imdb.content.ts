import { injectBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractImdbId } from "../common/extractors";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  const imdbId = extractImdbId(location.href);
  if (!imdbId) return;

  const anchor =
    document.querySelector('h1[data-testid="hero-title-block__title"]') ??
    document.querySelector("h1");

  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    // IMDb doesn't distinguish movie/show in URLs — try movie first, then show
    const movieResult: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: "movie",
      source: "imdb",
      id: imdbId,
    });

    if (movieResult.owned) {
      updateBadgeFromResponse(badge, movieResult);
      return;
    }

    const showResult: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: "show",
      source: "imdb",
      id: imdbId,
    });

    updateBadgeFromResponse(badge, showResult);
  } catch {
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.imdb.com/title/*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();

    // IMDb uses client-side routing (debounced)
    observeUrlChanges(checkAndBadge);
  },
});
