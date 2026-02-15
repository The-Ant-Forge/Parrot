import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { removeCollectionPanel } from "../common/collection-panel";
import { removeEpisodePanel } from "../common/episode-panel";
import { extractImdbId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();
  removeCollectionPanel();
  removeEpisodePanel();

  const imdbId = extractImdbId(location.href);
  if (!imdbId) return;

  const anchor =
    document.querySelector('h1[data-testid="hero-title-block__title"]') ??
    document.querySelector("h1");

  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    // IMDb doesn't distinguish movie/show in URLs — try movie first, then show
    let mediaType: "movie" | "show" = "movie";
    let response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: "movie",
      source: "imdb",
      id: imdbId,
    });

    if (!response.owned) {
      mediaType = "show";
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType: "show",
        source: "imdb",
        id: imdbId,
      });
    }

    updateBadgeFromResponse(badge, response);

    // Gap detection for owned items
    if (response.owned) {
      const options = await getOptions();
      checkGaps({
        mediaType,
        source: "imdb",
        id: imdbId,
        anchor,
        response,
        expandPanels: options.expandPanels,
      });
    }
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
