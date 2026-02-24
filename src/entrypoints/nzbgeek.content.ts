import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractNzbgeekMediaType, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import type { CheckResponse } from "../common/types";

function findTitleAnchor(): Element | null {
  return document.querySelector("span.overlay_title");
}

async function checkAndBadge() {
  removeBadge();

  const mediaType = extractNzbgeekMediaType(location.search);
  debugLog("NZBGeek", "checking", location.href, "→ type:", mediaType ?? "unknown");
  if (!mediaType) return;

  const extId = scanLinksForExternalId();
  debugLog("NZBGeek", "link scan →", extId ? extId.source + ":" + extId.id : "no links");
  if (!extId) return;

  const anchor = findTitleAnchor();
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    const response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType,
      source: extId.source,
      id: extId.id,
    });
    debugLog("NZBGeek", mediaType, extId.source + ":" + extId.id, response.owned ? "OWNED" : "not owned");
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
    errorLog("NZBGeek", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://nzbgeek.info/geekseek.php*", "*://*.nzbgeek.info/geekseek.php*"],
  runAt: "document_idle",
  main() {
    debugLog("NZBGeek", "v" + browser.runtime.getManifest().version, "loaded");
    checkAndBadge();
  },
});
