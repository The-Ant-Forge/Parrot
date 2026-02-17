import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  const extId = scanLinksForExternalId({ sources: ["tmdb", "imdb"] });
  if (!extId) return;

  const anchor =
    document.querySelector(".headline-1") ??
    document.querySelector("h1");
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    const response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: "movie",
      source: extId.source,
      id: extId.id,
    });

    updateBadgeFromResponse(badge, response);

    const options = await getOptions();
    checkGaps({
      mediaType: "movie",
      source: extId.source,
      id: extId.id,
      response,
      showCompletePanels: options.showCompletePanels,
    });
  } catch {
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.letterboxd.com/film/*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
  },
});
