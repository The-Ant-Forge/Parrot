import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  // Scope link scan to #description to avoid sidebar/related-content links
  const desc = document.getElementById("description");
  const extId = scanLinksForExternalId(desc ? { container: desc } : undefined);
  debugLog("RARGB", "checking", location.href, "→", extId ? extId.source + ":" + extId.id : "no links");
  if (!extId) return;

  const anchor = document.querySelector("h1");
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    let mediaType = extId.mediaType ?? "movie";
    let response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType,
      source: extId.source,
      id: extId.id,
    });

    // IMDb fallback: try show if movie missed
    if (!response.owned && extId.source === "imdb") {
      mediaType = "show";
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType: "show",
        source: "imdb",
        id: extId.id,
      });
    }

    debugLog("RARGB", mediaType, extId.source + ":" + extId.id, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned || mediaType === "movie") {
      checkGaps({
        mediaType,
        source: extId.source,
        id: extId.id,
        response,
      });
    }
  } catch (err) {
    errorLog("RARGB", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://rargb.to/torrent/*", "*://*.rargb.to/torrent/*"],
  runAt: "document_idle",
  main() {
    debugLog("RARGB", "v" + browser.runtime.getManifest().version, "loaded");
    checkAndBadge();
  },
});
