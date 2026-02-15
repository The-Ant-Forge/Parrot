import { injectBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import type { CheckResponse } from "../common/types";

function findExternalId(): {
  source: "tmdb" | "imdb" | "tvdb";
  id: string;
  mediaType: "movie" | "show";
} | null {
  const links = document.querySelectorAll<HTMLAnchorElement>("a[href]");

  for (const link of links) {
    const href = link.href;

    // TMDB link: themoviedb.org/movie/{id} or /tv/{id}
    const tmdbMatch = href.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
    if (tmdbMatch) {
      return {
        source: "tmdb",
        id: tmdbMatch[2],
        mediaType: tmdbMatch[1] === "movie" ? "movie" : "show",
      };
    }

    // TVDB link: always a show
    const tvdbNumeric = href.match(/thetvdb\.com\/.*?(\d{4,})/);
    if (tvdbNumeric) {
      return { source: "tvdb", id: tvdbNumeric[1], mediaType: "show" };
    }

    // IMDb link: imdb.com/title/tt{id} — could be movie or show
    const imdbMatch = href.match(/imdb\.com\/title\/(tt\d+)/);
    if (imdbMatch) {
      return { source: "imdb", id: imdbMatch[1], mediaType: "movie" };
    }
  }

  return null;
}

async function checkAndBadge() {
  removeBadge();

  const extId = findExternalId();
  if (!extId) return;

  const anchor = document.querySelector("h1");
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    let response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: extId.mediaType,
      source: extId.source,
      id: extId.id,
    });

    // IMDb doesn't distinguish movie/show — try show if movie missed
    if (!response.owned && extId.source === "imdb") {
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType: "show",
        source: "imdb",
        id: extId.id,
      });
    }

    updateBadgeFromResponse(badge, response);
  } catch {
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://rargb.to/torrent/*", "*://*.rargb.to/torrent/*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
  },
});
