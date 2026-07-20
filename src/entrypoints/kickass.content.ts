import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractImdbId, findImdbIdInText, parseKickassSlug } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { buildTitleKey } from "../common/normalize";
import { tryTitleCheck } from "../common/title-check";
import type { CheckResponse } from "../common/types";

/** IMDb id from an anchor anywhere on the page (the "good pages"). */
function findImdbLink(): string | null {
  const links = document.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const link of links) {
    const id = extractImdbId(link.href);
    if (id) return id;
  }
  return null;
}

async function checkAndBadge() {
  removeBadge();

  const slug = parseKickassSlug(location.pathname);
  debugLog("Kickass", "checking", location.href, "→",
    slug ? `${slug.mediaType ?? "ambiguous"} "${slug.title}" ${slug.year ?? "no year"}` : "not a torrent page");
  if (!slug) return;

  const anchor = document.querySelector("h1");
  if (!anchor) return;

  const badge = injectBadge(anchor);

  // Season marker in the release name is the only authoritative type signal;
  // without it the type is ambiguous and resolved server-side (IMDb dual
  // lookup / ambiguousType title check).
  const markerType = slug.mediaType;

  try {
    // Waterfall 1+2: IMDb — as a link, else as plain text inside the
    // description block (#desc excludes the title and comments).
    const imdbId = findImdbLink() ?? findImdbIdInText(document.getElementById("desc")?.textContent ?? "");

    let response: CheckResponse;
    let mediaType: "movie" | "show";
    let source: "imdb" | "title";
    let id: string;

    if (imdbId) {
      source = "imdb";
      id = imdbId;
      const initialType = markerType ?? "movie";
      debugLog("Kickass", "imdb:" + imdbId, "initial type:", initialType);
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType: initialType,
        source,
        id,
      });
      // The background retries the opposite type for IMDb misses and reports
      // the actual match; a slug season marker stays authoritative.
      mediaType = markerType ?? response.resolvedMediaType ?? initialType;
    } else {
      // Waterfall 3: title parsed from the release slug
      source = "title";
      response = await tryTitleCheck(markerType ?? "movie", slug.title, slug.year, {
        ambiguousType: markerType === undefined,
      });
      mediaType = markerType ?? response.resolvedMediaType ?? "movie";
      id = buildTitleKey(slug.title, slug.year);
    }

    debugLog("Kickass", mediaType, source + ":" + id, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned || mediaType === "movie") {
      void checkGaps({ mediaType, source, id, response });
    }
  } catch (err) {
    errorLog("Kickass", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: [
    "*://kickasstorrents.to/*-t*.html",
    "*://*.kickasstorrents.to/*-t*.html",
  ],
  runAt: "document_idle",
  main() {
    debugLog("Kickass", "v" + browser.runtime.getManifest().version, "loaded");
    void checkAndBadge();
  },
});
