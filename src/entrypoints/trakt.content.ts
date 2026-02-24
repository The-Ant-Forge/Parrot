import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractTraktMediaType, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  // app.trakt.tv is handled by trakt-app.content.ts (SvelteKit SPA)
  if (location.hostname === "app.trakt.tv") return;

  const mediaType = extractTraktMediaType(location.pathname);
  debugLog("Trakt", "checking", location.href, "→ type:", mediaType ?? "unknown");
  if (!mediaType) return;

  const extId = scanLinksForExternalId();
  debugLog("Trakt", "link scan →", extId ? extId.source + ":" + extId.id : "no links");
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

    debugLog("Trakt", resolvedType, extId.source + ":" + extId.id, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned || resolvedType === "movie") {
      checkGaps({
        mediaType: resolvedType,
        source: extId.source,
        id: extId.id,
        response,
      });
    }
  } catch (err) {
    errorLog("Trakt", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.trakt.tv/movies/*", "*://*.trakt.tv/shows/*"],
  runAt: "document_idle",
  main() {
    debugLog("Trakt", "v" + browser.runtime.getManifest().version, "loaded");
    checkAndBadge();
    observeUrlChanges(checkAndBadge);
  },
});
