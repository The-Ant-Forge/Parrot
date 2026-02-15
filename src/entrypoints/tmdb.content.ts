import { injectBadge, removeBadge, updateBadgeFromResponse } from "../common/badge";
import { removeCollectionPanel, injectCollectionPanel } from "../common/collection-panel";
import type { CheckResponse, CollectionCheckResponse } from "../common/types";

function extractFromUrl(url: string) {
  const match = url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
  if (!match) return null;
  return {
    mediaType: match[1] === "movie" ? "movie" : "show",
    id: match[2],
  } as const;
}

async function checkAndBadge() {
  removeBadge();
  removeCollectionPanel();

  const info = extractFromUrl(location.href);
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

    // Check for collection gaps (movies only)
    if (info.mediaType === "movie") {
      checkCollection(info.id, anchor);
    }
  } catch (err) {
    console.error("Parrot TMDB: error", err);
    removeBadge();
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

export default defineContentScript({
  matches: [
    "*://*.themoviedb.org/movie/*",
    "*://*.themoviedb.org/tv/*",
  ],
  runAt: "document_idle",
  main() {
    checkAndBadge();

    // TMDB is an SPA — re-check on navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        checkAndBadge();
      }
    }).observe(document.body, { childList: true, subtree: true });
  },
});
