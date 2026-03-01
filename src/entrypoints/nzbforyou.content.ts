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
      // Breadcrumb hint missed — try opposite media type
      if (!response.owned) {
        const opposite = resolvedType === "movie" ? "show" : "movie";
        const altResponse: CheckResponse = await browser.runtime.sendMessage({
          type: "CHECK",
          mediaType: opposite,
          source,
          id,
        });
        if (altResponse.owned) {
          resolvedType = opposite;
          response = altResponse;
        }
      }
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

    // Gap detection: owned shows get episode check; movies always get collection check.
    // NZBForYou breadcrumbs can misidentify type, so for unowned items always try
    // movie collection check too (checkGaps handles movie vs show logic internally).
    if (resolvedType && response.owned) {
      checkGaps({ mediaType: resolvedType, source, id, response });
    } else {
      // Not owned — always try movie collection check
      checkGaps({ mediaType: "movie", source, id, response });
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
