import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { waitForElement } from "../common/dom-utils";
import { extractTraktMediaType, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  const mediaType = extractTraktMediaType(location.pathname);
  debugLog("TraktApp", "checking", location.href, "→ type:", mediaType ?? "unknown");
  if (!mediaType) return;

  // Wait for SvelteKit to render the title
  const anchor = await waitForElement("h1.short-title");
  if (!anchor) return;

  // Brief delay for remaining DOM (links) to populate
  await new Promise((r) => setTimeout(r, 500));

  const extId = scanLinksForExternalId();
  debugLog("TraktApp", "link scan →", extId ? extId.source + ":" + extId.id : "no links");
  if (!extId) return;

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

    debugLog("TraktApp", resolvedType, extId.source + ":" + extId.id, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned) {
      checkGaps({ mediaType: resolvedType, source: extId.source, id: extId.id, response });
    } else {
      // Not owned — always try movie collection check
      checkGaps({ mediaType: "movie", source: extId.source, id: extId.id, response });
    }
  } catch (err) {
    errorLog("TraktApp", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://app.trakt.tv/movies/*", "*://app.trakt.tv/shows/*"],
  runAt: "document_idle",
  main() {
    debugLog("TraktApp", "v" + browser.runtime.getManifest().version, "loaded");
    checkAndBadge();
    observeUrlChanges(checkAndBadge);
  },
});
