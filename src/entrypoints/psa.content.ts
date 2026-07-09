import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { setupOwnershipListener } from "../common/check-helpers";
import { extractPsaFromUrl } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { titleCheckWithSlugFallback } from "../common/title-check";

async function checkAndBadge() {
  removeBadge();

  const info = extractPsaFromUrl(location.href);
  debugLog("PSA", "checking", location.href, "→", info ? info.mediaType + " slug:" + info.slug : "no match");
  if (!info) return;

  const anchor = document.querySelector("h1.post-title") ?? document.querySelector("h1");
  if (!anchor) return;

  // Capture h1 text BEFORE badge injection (badge adds "Plex" to textContent)
  const h1Text = anchor.textContent?.trim();

  const badge = injectBadge(anchor);

  try {
    const { response, titleKey } = await titleCheckWithSlugFallback(
      "PSA", info.mediaType, info.slug, h1Text,
    );
    debugLog("PSA", info.mediaType, "title:" + titleKey, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned || info.mediaType === "movie") {
      void checkGaps({
        mediaType: info.mediaType,
        source: "title",
        id: titleKey,
        response,
      });
    }

    setupOwnershipListener("PSA");
  } catch (err) {
    errorLog("PSA", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: [
    "*://psa.wf/movie/*",
    "*://psa.wf/tv-show/*",
  ],
  runAt: "document_idle",
  main() {
    debugLog("PSA", "v" + browser.runtime.getManifest().version, "loaded");
    void checkAndBadge();
  },
});
