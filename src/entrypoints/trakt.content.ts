import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { removeCollectionPanel } from "../common/collection-panel";
import { removeEpisodePanel } from "../common/episode-panel";
import { extractTraktMediaType, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();
  removeCollectionPanel();
  removeEpisodePanel();

  const mediaType = extractTraktMediaType(location.pathname);
  if (!mediaType) return;

  const extId = scanLinksForExternalId();
  if (!extId) return;

  const anchor = document.querySelector("h1");
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
        anchor,
        response,
        showCompletePanels: options.showCompletePanels,
      });
    }
  } catch {
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.trakt.tv/movies/*", "*://*.trakt.tv/shows/*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
    observeUrlChanges(checkAndBadge);
  },
});
