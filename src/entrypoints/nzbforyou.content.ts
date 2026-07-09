import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractImdbId, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import type { CheckResponse } from "../common/types";

function getMediaTypeFromBreadcrumb(): "movie" | "show" | null {
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
  let source: "imdb" | "tmdb" | "tvdb" | "tvmaze" | undefined;
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

  // Pick the initial mediaType:
  //   - non-IMDb scan sources carry an authoritative type (TVDB→show,
  //     TVMaze→show, TMDB→derived from the link path) — use it directly.
  //   - IMDb URLs don't say movie/show. We pass a breadcrumb-based hint
  //     as the initial guess; the background's `handleCheck` does a
  //     dual-lookup for IMDb sources and reports the resolved type via
  //     `response.resolvedMediaType`. No second CHECK needed.
  const initialType: "movie" | "show" = scanMediaType ?? getMediaTypeFromBreadcrumb() ?? "movie";

  try {
    const response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: initialType,
      source,
      id,
    });

    // For IMDb sources the background may have resolved the opposite type.
    // For other sources the URL-derived type is authoritative — don't flip it.
    const resolvedType: "movie" | "show" =
      source === "imdb" ? (response.resolvedMediaType ?? initialType) : initialType;

    debugLog("NZBForYou", resolvedType, source + ":" + id, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    // Gap detection: owned shows get episode check; movies always get
    // collection check (even when not owned, to surface partially-owned
    // collections).
    if (response.owned || resolvedType === "movie") {
      void checkGaps({ mediaType: resolvedType, source, id, response });
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
    void checkAndBadge();
  },
});
