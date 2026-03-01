import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractMetacriticMediaType, findExternalIdFromJsonLd } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { parseSlug, parseTitleFromH1, buildTitleKey } from "../common/normalize";
import { tryTitleCheck } from "../common/title-check";
import type { CheckResponse } from "../common/types";

function extractSlug(): string | null {
  const match = location.pathname.match(/\/(?:movie|tv)\/([^/?#]+)/);
  return match ? match[1] : null;
}

async function checkAndBadge() {
  removeBadge();

  const mediaType = extractMetacriticMediaType(location.pathname);
  debugLog("Metacritic", "checking", location.href, "→ type:", mediaType ?? "unknown");
  if (!mediaType) return;

  const anchor = document.querySelector("h1");
  if (!anchor) return;

  // Capture h1 text BEFORE badge injection (badge adds "Plex" to textContent)
  const h1Text = anchor.textContent?.trim();

  const badge = injectBadge(anchor);

  // Strategy 1: external ID (JSON-LD or page links)
  const extId = findExternalIdFromJsonLd();
  debugLog("Metacritic", "strategy 1 (JSON-LD/links) →", extId ? extId.source + ":" + extId.id : "no external ID");
  if (extId) {
    try {
      let resolvedType = mediaType;
      let response: CheckResponse = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType,
        source: extId.source,
        id: extId.id,
      });

      // IMDb fallback: try opposite media type
      if (!response.owned && extId.source === "imdb") {
        resolvedType = mediaType === "movie" ? "show" : "movie";
        response = await browser.runtime.sendMessage({
          type: "CHECK",
          mediaType: resolvedType,
          source: "imdb",
          id: extId.id,
        });
      }

      debugLog("Metacritic", resolvedType, extId.source + ":" + extId.id, response.owned ? "OWNED" : "not owned");
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
      errorLog("Metacritic", err);
      showErrorBadge(badge, "Could not check Plex library");
      return;
    }
  }

  // Strategy 2: title-based matching — merge slug + h1 for richest info
  const rawSlug = extractSlug();
  debugLog("Metacritic", "strategy 2 (slug) →", rawSlug ?? "no slug");
  if (!rawSlug) return;

  const slug = parseSlug(rawSlug);
  const h1 = h1Text ? parseTitleFromH1(h1Text) : undefined;
  const title = h1?.title ?? slug.title;
  const year = h1?.year ?? slug.year;
  const titleKey = buildTitleKey(title, year);

  debugLog("Metacritic", "merged →", title, year ?? "no year",
    `(slug: ${slug.title}/${slug.year ?? "none"}, h1: ${h1?.title ?? "none"}/${h1?.year ?? "none"})`);

  try {
    let response = await tryTitleCheck(mediaType, title, year);

    // If merged lookup missed but slug had different info, try slug as fallback
    if (!response.owned && (slug.title !== title || slug.year !== year)) {
      debugLog("Metacritic", "fallback → slug title:", slug.title, slug.year ?? "no year");
      response = await tryTitleCheck(mediaType, slug.title, slug.year);
    }

    debugLog("Metacritic", mediaType, "title:" + titleKey, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned || mediaType === "movie") {
      checkGaps({
        mediaType,
        source: "title",
        id: titleKey,
        response,
      });
    }
  } catch (err) {
    errorLog("Metacritic", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.metacritic.com/movie/*", "*://*.metacritic.com/tv/*"],
  runAt: "document_idle",
  main() {
    debugLog("Metacritic", "v" + browser.runtime.getManifest().version, "loaded");
    checkAndBadge();
  },
});
