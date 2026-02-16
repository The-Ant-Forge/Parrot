import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { removeCollectionPanel } from "../common/collection-panel";
import { removeEpisodePanel } from "../common/episode-panel";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

function extractTvdbId(): string | null {
  // TVDB numeric ID is not in the URL slug — find it in page links
  // Links like /series/81189/edit, /series/81189/artwork etc. contain the numeric ID
  const link = document.querySelector<HTMLAnchorElement>(
    'a[href*="/series/"][href$="/edit"], a[href*="/series/"][href$="/artwork"]',
  );
  if (link) {
    const match = link.href.match(/\/series\/(\d+)\//);
    if (match) return match[1];
  }

  // Fallback: look for any link with /series/{numericId}/
  const allLinks = document.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const a of allLinks) {
    const match = a.href.match(/\/series\/(\d+)\//);
    if (match) return match[1];
  }

  return null;
}

async function checkAndBadge() {
  removeBadge();
  removeCollectionPanel();
  removeEpisodePanel();

  const tvdbId = extractTvdbId();
  if (!tvdbId) return;

  const anchor = document.querySelector("h1");
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    const response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: "show",
      source: "tvdb",
      id: tvdbId,
    });
    updateBadgeFromResponse(badge, response);

    if (response.owned) {
      const options = await getOptions();
      checkGaps({
        mediaType: "show",
        source: "tvdb",
        id: tvdbId,
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
  matches: ["*://*.thetvdb.com/series/*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();

    // TVDB uses client-side routing (debounced)
    observeUrlChanges(checkAndBadge);
  },
});
