import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
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

  const tvdbId = extractTvdbId();
  debugLog("TVDB", "checking", location.href, "→", tvdbId ? "tvdb:" + tvdbId : "no ID");
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
    debugLog("TVDB", "show", "tvdb:" + tvdbId, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned) {
      checkGaps({
        mediaType: "show",
        source: "tvdb",
        id: tvdbId,
        response,
      });
    }
  } catch (err) {
    errorLog("TVDB", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.thetvdb.com/series/*"],
  runAt: "document_idle",
  main() {
    debugLog("TVDB", "v" + browser.runtime.getManifest().version, "loaded");
    checkAndBadge();

    // TVDB uses client-side routing (debounced)
    observeUrlChanges(checkAndBadge);
  },
});
