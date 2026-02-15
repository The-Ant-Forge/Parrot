import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { removeCollectionPanel, injectCollectionPanel } from "../common/collection-panel";
import { removeEpisodePanel, injectEpisodePanel } from "../common/episode-panel";
import { extractTmdbFromUrl } from "../common/extractors";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse, CollectionCheckResponse, EpisodeGapResponse } from "../common/types";

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

    // Check for collection gaps (movies) or episode gaps (TV shows)
    if (info.mediaType === "movie") {
      checkCollection(info.id, anchor);
    } else if (info.mediaType === "show" && response.owned) {
      checkEpisodes(info.id, anchor);
    }
  } catch (err) {
    console.error("Parrot TMDB: error", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

async function checkCollection(tmdbMovieId: string, anchor: Element) {
  try {
    const response: CollectionCheckResponse = await browser.runtime.sendMessage({
      type: "CHECK_COLLECTION",
      tmdbMovieId,
    });

    if (response.hasCollection && response.collection && response.collection.missingMovies.length > 0) {
      console.log(
        `Parrot TMDB: collection "${response.collection.name}" — ${response.collection.ownedMovies.length}/${response.collection.totalMovies} owned`,
      );
      injectCollectionPanel(anchor, response.collection);
    }
  } catch (err) {
    console.error("Parrot TMDB: collection check failed", err);
  }
}

async function checkEpisodes(tmdbId: string, anchor: Element) {
  try {
    const response: EpisodeGapResponse = await browser.runtime.sendMessage({
      type: "CHECK_EPISODES",
      source: "tmdb",
      id: tmdbId,
    });

    if (response.hasGaps && response.gaps) {
      console.log(
        `Parrot TMDB: ${response.gaps.totalOwned}/${response.gaps.totalEpisodes} episodes, ${response.gaps.completeSeasons}/${response.gaps.totalSeasons} seasons complete`,
      );
      injectEpisodePanel(anchor, response.gaps);
    }
  } catch (err) {
    console.error("Parrot TMDB: episode check failed", err);
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
