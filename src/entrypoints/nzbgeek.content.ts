import { injectBadge, removeBadge, updateBadgeFromResponse } from "../common/badge";
import type { CheckResponse } from "../common/types";

function getMediaType(): "movie" | "show" | null {
  const params = new URLSearchParams(location.search);
  if (params.has("movieid")) return "movie";
  if (params.has("tvid")) return "show";
  return null;
}

function findExternalId(): { source: "tmdb" | "imdb" | "tvdb"; id: string } | null {
  const links = document.querySelectorAll<HTMLAnchorElement>("a[href]");

  for (const link of links) {
    const href = link.href;

    // TMDB link: themoviedb.org/movie/{id} or /tv/{id}
    const tmdbMatch = href.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/);
    if (tmdbMatch) return { source: "tmdb", id: tmdbMatch[1] };

    // IMDb link: imdb.com/title/tt{id}
    const imdbMatch = href.match(/imdb\.com\/title\/(tt\d+)/);
    if (imdbMatch) return { source: "imdb", id: imdbMatch[1] };

    // TVDB link: thetvdb.com/series/{slug} or /series/{numericId}
    const tvdbNumeric = href.match(/thetvdb\.com\/.*?(\d{4,})/);
    if (tvdbNumeric) return { source: "tvdb", id: tvdbNumeric[1] };
  }

  return null;
}

function findTitleAnchor(): Element | null {
  return document.querySelector("span.overlay_title");
}

async function checkAndBadge() {
  removeBadge();

  const mediaType = getMediaType();
  if (!mediaType) return;

  const extId = findExternalId();
  console.log("Parrot NZBGeek:", mediaType, extId);
  if (!extId) return;

  const anchor = findTitleAnchor();
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    const response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType,
      source: extId.source,
      id: extId.id,
    });
    console.log("Parrot NZBGeek: response", response);
    updateBadgeFromResponse(badge, response);
  } catch {
    removeBadge();
  }
}

export default defineContentScript({
  matches: ["*://nzbgeek.info/geekseek.php*", "*://*.nzbgeek.info/geekseek.php*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
  },
});
