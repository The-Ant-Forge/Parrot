import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { removeCollectionPanel } from "../common/collection-panel";
import { removeEpisodePanel } from "../common/episode-panel";
import { extractTmdbFromUrl } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();
  removeCollectionPanel();
  removeEpisodePanel();

  const info = extractTmdbFromUrl(location.href);
  console.log("Parrot TMDB: extracted", info, "from", location.href);
  if (!info) return;

  // TMDB title is inside the header section
  const anchor =
    document.querySelector("section.inner_content h2 a") ??
    document.querySelector("section.inner_content h2") ??
    document.querySelector(".title h2 a") ??
    document.querySelector(".title h2") ??
    document.querySelector("h2 a");

  console.log("Parrot TMDB: anchor element", anchor?.tagName, anchor?.className, anchor?.textContent?.trim().slice(0, 40));
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    const response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: info.mediaType,
      source: "tmdb",
      id: info.id,
    });
    console.log("Parrot TMDB: response", response);
    updateBadgeFromResponse(badge, response);

    const options = await getOptions();
    checkGaps({
      mediaType: info.mediaType,
      source: "tmdb",
      id: info.id,
      anchor,
      response,
      showCompletePanels: options.showCompletePanels,
    });
  } catch (err) {
    console.error("Parrot TMDB: error", err);
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
