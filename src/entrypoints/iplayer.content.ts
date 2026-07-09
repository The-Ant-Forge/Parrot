import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { setupOwnershipListener } from "../common/check-helpers";
import { waitForElement } from "../common/dom-utils";
import { extractIplayerFromUrl } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { titleCheckWithSlugFallback } from "../common/title-check";

async function checkAndBadge() {
  removeBadge();

  const info = extractIplayerFromUrl(location.href);
  debugLog("iPlayer", "checking", location.href, "→", info ? info.mediaType + " slug:" + info.slug : "no match");
  if (!info) return;

  // Wait for dynamic page content to load
  const anchor = await waitForElement(".typo--buzzard");
  if (!anchor) return;

  // Capture title text BEFORE badge injection (badge adds "Plex" to textContent)
  const titleText = anchor.textContent?.trim();

  const badge = injectBadge(anchor);

  try {
    const { response, titleKey } = await titleCheckWithSlugFallback(
      "iPlayer", info.mediaType, info.slug, titleText,
    );
    debugLog("iPlayer", info.mediaType, "title:" + titleKey, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned || info.mediaType === "movie") {
      void checkGaps({
        mediaType: info.mediaType,
        source: "title",
        id: titleKey,
        response,
      });
    }

    setupOwnershipListener("iPlayer");
  } catch (err) {
    errorLog("iPlayer", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: [
    "*://*.bbc.co.uk/iplayer/episode/*",
    "*://*.bbc.co.uk/iplayer/episodes/*",
  ],
  runAt: "document_idle",
  main() {
    debugLog("iPlayer", "v" + browser.runtime.getManifest().version, "loaded");
    void checkAndBadge();
  },
});
