import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractRtMediaType, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import type { CheckResponse } from "../common/types";
import type { ExternalIdFromLink } from "../common/extractors";

function findExternalId(): ExternalIdFromLink | null {
  // Try JSON-LD structured data first
  const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of ldScripts) {
    try {
      const data = JSON.parse(script.textContent ?? "");
      const sameAs = Array.isArray(data.sameAs) ? data.sameAs : data.sameAs ? [data.sameAs] : [];
      for (const url of sameAs) {
        if (typeof url !== "string") continue;
        const imdbMatch = url.match(/imdb\.com\/title\/(tt\d+)/);
        if (imdbMatch) return { source: "imdb", id: imdbMatch[1] };
      }
    } catch {
      // invalid JSON-LD, skip
    }
  }

  // Fallback: scan DOM links
  return scanLinksForExternalId({ sources: ["tmdb", "imdb"] });
}

async function checkAndBadge() {
  removeBadge();

  const mediaType = extractRtMediaType(location.pathname);
  if (!mediaType) return;

  const extId = findExternalId();
  if (!extId) return;

  const anchor =
    document.querySelector('[data-qa="score-panel-title"]') ??
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
  matches: ["*://*.rottentomatoes.com/m/*", "*://*.rottentomatoes.com/tv/*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
  },
});
