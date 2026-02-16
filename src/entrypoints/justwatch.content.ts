import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractJustWatchMediaType, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  const mediaType = extractJustWatchMediaType(location.pathname);
  if (!mediaType) return;

  const extId = scanLinksForExternalId({ sources: ["tmdb", "imdb"] });
  if (!extId) return;

  const anchor =
    document.querySelector(".title-block h1") ??
    document.querySelector("h1");
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    let resolvedType = mediaType;
    let response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType,
      source: extId.source,
      id: extId.id,
    });

    // IMDb fallback: try opposite media type
    if (!response.owned && extId.source === "imdb") {
      resolvedType = mediaType === "movie" ? "show" : "movie";
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType: resolvedType,
        source: "imdb",
        id: extId.id,
      });
    }

    updateBadgeFromResponse(badge, response);

    if (response.owned) {
      const options = await getOptions();
      checkGaps({
        mediaType: resolvedType,
        source: extId.source,
        id: extId.id,
        response,
        showCompletePanels: options.showCompletePanels,
      });
    }
  } catch {
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.justwatch.com/*/movie/*", "*://*.justwatch.com/*/tv-show/*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
    observeUrlChanges(checkAndBadge);
  },
});
