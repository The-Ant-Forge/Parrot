import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractTvmazeFromUrl } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  const info = extractTvmazeFromUrl(location.href);
  if (!info) return;

  const anchor = document.querySelector("header.columns h1") ?? document.querySelector("h1");
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    const response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: "show",
      source: "tvmaze",
      id: info.id,
    });
    updateBadgeFromResponse(badge, response);

    if (response.owned) {
      const options = await getOptions();
      checkGaps({
        mediaType: "show",
        source: response.item?.tvdbId ? "tvdb" : response.item?.tmdbId ? "tmdb" : "tvdb",
        id: String(response.item?.tvdbId ?? response.item?.tmdbId ?? info.id),
        response,
        showCompletePanels: options.showCompletePanels,
      });
    }
  } catch {
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.tvmaze.com/shows/*", "*://tvmaze.com/shows/*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
  },
});
