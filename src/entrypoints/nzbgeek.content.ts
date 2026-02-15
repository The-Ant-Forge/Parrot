import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { removeCollectionPanel } from "../common/collection-panel";
import { removeEpisodePanel } from "../common/episode-panel";
import { extractNzbgeekMediaType } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import type { CheckResponse } from "../common/types";

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
  removeCollectionPanel();
  removeEpisodePanel();

  const mediaType = extractNzbgeekMediaType(location.search);
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

    // Gap detection for owned items
    if (response.owned) {
      const options = await getOptions();
      checkGaps({
        mediaType,
        source: extId.source,
        id: extId.id,
        anchor,
        response,
        expandPanels: options.expandPanels,
      });
    }
  } catch {
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://nzbgeek.info/geekseek.php*", "*://*.nzbgeek.info/geekseek.php*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
  },
});
