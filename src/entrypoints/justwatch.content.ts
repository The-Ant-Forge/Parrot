import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { checkWithImdbFallback, setupOwnershipListener } from "../common/check-helpers";
import { waitForElement } from "../common/dom-utils";
import { extractJustWatchMediaType, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { parseTitleFromH1, buildTitleKey } from "../common/normalize";
import { tryTitleCheck } from "../common/title-check";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();

  const mediaType = extractJustWatchMediaType(location.pathname);
  debugLog("JustWatch", "checking", location.href, "→ type:", mediaType ?? "unknown");
  if (!mediaType) return;

  // Wait for dynamic page content to load
  const anchor = await waitForElement("h1");
  if (!anchor) return;

  // Brief delay for remaining DOM (links) to populate
  await new Promise((r) => setTimeout(r, 500));

  // Capture h1 text BEFORE badge injection (badge adds "Plex" to textContent)
  const h1Text = anchor.textContent?.trim();

  const badge = injectBadge(anchor);

  // Strategy 1: external ID (link scanning)
  const extId = scanLinksForExternalId({ sources: ["tmdb", "imdb", "tvdb", "tvmaze"] });
  debugLog("JustWatch", "strategy 1 (links) →", extId ? extId.source + ":" + extId.id : "no links");
  if (extId) {
    try {
      const initialResponse: CheckResponse = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType,
        source: extId.source,
        id: extId.id,
      });

      const { mediaType: resolvedType, response } = await checkWithImdbFallback(mediaType, extId.source, extId.id, initialResponse);

      debugLog("JustWatch", resolvedType, extId.source + ":" + extId.id, response.owned ? "OWNED" : "not owned");
      updateBadgeFromResponse(badge, response);

      if (response.owned || resolvedType === "movie") {
        checkGaps({
          mediaType: resolvedType,
          source: extId.source,
          id: extId.id,
          response,
        });
      }
      return;
    } catch (err) {
      errorLog("JustWatch", err);
      showErrorBadge(badge, "Could not check Plex library");
      return;
    }
  }

  // Strategy 2: title-based matching from h1 text
  debugLog("JustWatch", "strategy 2 (title) →", h1Text ?? "no h1 text");
  if (!h1Text) return;

  const { title, year } = parseTitleFromH1(h1Text);
  const titleKey = buildTitleKey(title, year);

  try {
    const response = await tryTitleCheck(mediaType, title, year);

    debugLog("JustWatch", mediaType, "title:" + titleKey, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned || mediaType === "movie") {
      checkGaps({
        mediaType,
        source: "title",
        id: titleKey,
        response,
      });
    }

    setupOwnershipListener("JustWatch");
  } catch (err) {
    errorLog("JustWatch", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.justwatch.com/*/movie/*", "*://*.justwatch.com/*/tv-show/*", "*://*.justwatch.com/*/tv-series/*"],
  runAt: "document_idle",
  main() {
    debugLog("JustWatch", "v" + browser.runtime.getManifest().version, "loaded");
    checkAndBadge();
    observeUrlChanges(checkAndBadge);
  },
});
