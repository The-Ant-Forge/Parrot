import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractMetacriticMediaType, findExternalIdFromJsonLd } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { errorLog } from "../common/logger";
import { parseSlug, buildTitleKey } from "../common/normalize";
import { tryTitleCheck } from "../common/title-check";
import type { CheckResponse } from "../common/types";

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
  const extId = findExternalIdFromJsonLd();
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

      if (response.owned || resolvedType === "movie") {
        checkGaps({
          mediaType: resolvedType,
          source: extId.source,
          id: extId.id,
          response,
        });
      }
      return;
    } catch (err) {
      errorLog("Metacritic", err);
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
    const response = await tryTitleCheck(mediaType, title, year);

    updateBadgeFromResponse(badge, response);

    if (response.owned || mediaType === "movie") {
      checkGaps({
        mediaType,
        source: "title",
        id: titleKey,
        response,
      });
    }
  } catch (err) {
    errorLog("Metacritic", err);
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
