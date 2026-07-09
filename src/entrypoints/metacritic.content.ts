import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { checkWithImdbFallback, setupOwnershipListener } from "../common/check-helpers";
import { extractMetacriticMediaType, findExternalIdFromJsonLd } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { titleCheckWithSlugFallback } from "../common/title-check";
import type { CheckResponse } from "../common/types";

function extractSlug(): string | null {
  const match = location.pathname.match(/\/(?:movie|tv)\/([^/?#]+)/);
  return match ? match[1] : null;
}

async function checkAndBadge() {
  removeBadge();

  const mediaType = extractMetacriticMediaType(location.pathname);
  debugLog("Metacritic", "checking", location.href, "→ type:", mediaType ?? "unknown");
  if (!mediaType) return;

  const anchor = document.querySelector("h1");
  if (!anchor) return;

  // Capture h1 text BEFORE badge injection (badge adds "Plex" to textContent)
  const h1Text = anchor.textContent?.trim();

  const badge = injectBadge(anchor);

  // Strategy 1: external ID (JSON-LD or page links)
  const extId = findExternalIdFromJsonLd();
  debugLog("Metacritic", "strategy 1 (JSON-LD/links) →", extId ? extId.source + ":" + extId.id : "no external ID");
  if (extId) {
    try {
      const initialResponse: CheckResponse = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType,
        source: extId.source,
        id: extId.id,
      });

      const { mediaType: resolvedType, response } = checkWithImdbFallback(mediaType, extId.source, initialResponse);

      debugLog("Metacritic", resolvedType, extId.source + ":" + extId.id, response.owned ? "OWNED" : "not owned");
      updateBadgeFromResponse(badge, response);

      if (response.owned || resolvedType === "movie") {
        void checkGaps({
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

  // Strategy 2: title-based matching — merge slug + h1 for richest info
  const rawSlug = extractSlug();
  debugLog("Metacritic", "strategy 2 (slug) →", rawSlug ?? "no slug");
  if (!rawSlug) return;

  try {
    const { response, titleKey } = await titleCheckWithSlugFallback(
      "Metacritic", mediaType, rawSlug, h1Text,
    );
    debugLog("Metacritic", mediaType, "title:" + titleKey, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned || mediaType === "movie") {
      void checkGaps({
        mediaType,
        source: "title",
        id: titleKey,
        response,
      });
    }

    setupOwnershipListener("Metacritic");
  } catch (err) {
    errorLog("Metacritic", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.metacritic.com/movie/*", "*://*.metacritic.com/tv/*"],
  runAt: "document_idle",
  main() {
    debugLog("Metacritic", "v" + browser.runtime.getManifest().version, "loaded");
    void checkAndBadge();
  },
});
