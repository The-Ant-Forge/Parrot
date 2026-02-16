import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractMetacriticMediaType, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { parseSlug, buildTitleKey } from "../common/normalize";
import { getOptions } from "../common/storage";
import type { CheckResponse } from "../common/types";
import type { ExternalIdFromLink } from "../common/extractors";

function findExternalId(): ExternalIdFromLink | null {
  // Try JSON-LD structured data
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

function extractSlug(): string | null {
  const match = location.pathname.match(/\/(?:movie|tv)\/([^/?#]+)/);
  return match ? match[1] : null;
}

async function checkAndBadge() {
  removeBadge();

  const mediaType = extractMetacriticMediaType(location.pathname);
  if (!mediaType) return;

  const anchor = document.querySelector("h1");
  if (!anchor) return;

  const badge = injectBadge(anchor);

  // Strategy 1: external ID (JSON-LD or page links)
  const extId = findExternalId();
  if (extId) {
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
      return;
    } catch {
      showErrorBadge(badge, "Could not check Plex library");
      return;
    }
  }

  // Strategy 2: title-based matching from URL slug
  const slug = extractSlug();
  if (!slug) return;

  const { title, year } = parseSlug(slug);
  const titleKey = buildTitleKey(title, year);

  try {
    let response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType,
      source: "title",
      id: titleKey,
    });

    // If year was present but no match, retry without year
    if (!response.owned && year) {
      const fallbackKey = buildTitleKey(title);
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType,
        source: "title",
        id: fallbackKey,
      });
    }

    updateBadgeFromResponse(badge, response);

    if (response.owned && response.item && (response.item.tmdbId || response.item.tvdbId)) {
      const options = await getOptions();
      checkGaps({
        mediaType,
        source: "title",
        id: titleKey,
        response,
        showCompletePanels: options.showCompletePanels,
      });
    }
  } catch {
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.metacritic.com/movie/*", "*://*.metacritic.com/tv/*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
  },
});
