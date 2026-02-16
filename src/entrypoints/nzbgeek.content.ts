import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { removeCollectionPanel } from "../common/collection-panel";
import { removeEpisodePanel } from "../common/episode-panel";
import { extractNzbgeekMediaType, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import type { CheckResponse } from "../common/types";

function findTitleAnchor(): Element | null {
  return document.querySelector("span.overlay_title");
}

async function checkAndBadge() {
  removeBadge();
  removeCollectionPanel();
  removeEpisodePanel();

  const mediaType = extractNzbgeekMediaType(location.search);
  if (!mediaType) return;

  const extId = scanLinksForExternalId();
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
    updateBadgeFromResponse(badge, response);

    if (response.owned) {
      const options = await getOptions();
      checkGaps({
        mediaType,
        source: extId.source,
        id: extId.id,
        anchor,
        response,
        showCompletePanels: options.showCompletePanels,
      });
    }
  } catch {
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://nzbgeek.info/geekseek.php*", "*://*.nzbgeek.info/geekseek.php*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
  },
});
