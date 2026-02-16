import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  const extId = scanLinksForExternalId();
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

    updateBadgeFromResponse(badge, response);

    if (response.owned) {
      const options = await getOptions();
      checkGaps({
        mediaType,
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
  matches: ["*://rargb.to/torrent/*", "*://*.rargb.to/torrent/*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
  },
});
