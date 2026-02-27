import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractImdbId, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import type { CheckResponse } from "../common/types";

function getMediaType(): "movie" | "show" | null {
  const breadcrumb = document.querySelector("li.breadcrumb");
  if (!breadcrumb) return null;

  const text = breadcrumb.textContent?.toLowerCase() ?? "";
  if (text.includes("tv")) return "show";
  if (text.includes("movie")) return "movie";
  return null;
}

function findImdbId(): string | null {
  const links = document.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const link of links) {
    const id = extractImdbId(link.href);
    if (id) return id;
  }
  return null;
}

async function checkAndBadge() {
  removeBadge();

  // Waterfall: try IMDb first (most common on this site), then link scan
  const imdbId = findImdbId();
  let source: string | undefined;
  let id: string | undefined;
  let scanMediaType: "movie" | "show" | undefined;

  if (imdbId) {
    source = "imdb";
    id = imdbId;
    debugLog("NZBForYou", "checking", location.href, "→ imdb:" + imdbId);
  } else {
    // Fallback: scan for TMDB, TVDB, or TVMaze links
    const extId = scanLinksForExternalId();
    if (extId) {
      source = extId.source;
      id = extId.id;
      scanMediaType = extId.mediaType;
      debugLog("NZBForYou", "checking", location.href, "→ link scan:", extId.source + ":" + extId.id);
    } else {
      debugLog("NZBForYou", "checking", location.href, "→ no ID found");
      return;
    }
  }

  const anchor = document.querySelector("h3.first");
  if (!anchor) return;

  const badge = injectBadge(anchor);
  let resolvedType = getMediaType() ?? scanMediaType ?? null;

  try {
    let response: CheckResponse;

    if (resolvedType) {
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType: resolvedType,
        source,
        id,
      });
    } else {
      // No media type hint — try movie first, then show
      resolvedType = "movie";
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType: "movie",
        source,
        id,
      });
      if (!response.owned) {
        resolvedType = "show";
        response = await browser.runtime.sendMessage({
          type: "CHECK",
          mediaType: "show",
          source,
          id,
        });
      }
    }

    debugLog("NZBForYou", resolvedType, source + ":" + id, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    // Gap detection: always for movies (collection check), owned-only for shows
    if (resolvedType && (response.owned || resolvedType === "movie")) {
      checkGaps({
        mediaType: resolvedType,
        source,
        id,
        response,
      });
    }
  } catch (err) {
    errorLog("NZBForYou", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: [
    "*://nzbforyou.com/viewtopic.php*",
    "*://*.nzbforyou.com/viewtopic.php*",
  ],
  runAt: "document_idle",
  main() {
    debugLog("NZBForYou", "v" + browser.runtime.getManifest().version, "loaded");
    checkAndBadge();
  },
});
