import { createBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { removeCollectionPanel } from "../common/collection-panel";
import { removeEpisodePanel } from "../common/episode-panel";
import { extractImdbId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import type { CheckResponse } from "../common/types";

const BADGE_ATTR = "data-parrot-badge";

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

function removeAllBadges() {
  document.querySelectorAll(`[${BADGE_ATTR}]`).forEach((el) => el.remove());
}

function injectBadges(anchors: Element[]): HTMLSpanElement[] {
  return anchors.map((anchor) => {
    const badge = createBadge();
    anchor.appendChild(badge);
    return badge;
  });
}

async function checkAndBadge() {
  removeAllBadges();
  removeCollectionPanel();
  removeEpisodePanel();

  const imdbId = findImdbId();
  if (!imdbId) return;

  const anchors = [
    document.querySelector("h2.topic-title"),
    document.querySelector("h3.first"),
  ].filter((el): el is Element => el !== null);

  if (anchors.length === 0) return;

  const badges = injectBadges(anchors);
  let resolvedType = getMediaType();

  try {
    let response: CheckResponse;

    if (resolvedType) {
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType: resolvedType,
        source: "imdb",
        id: imdbId,
      });
    } else {
      // No breadcrumb hint — try movie first, then show
      resolvedType = "movie";
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType: "movie",
        source: "imdb",
        id: imdbId,
      });
      if (!response.owned) {
        resolvedType = "show";
        response = await browser.runtime.sendMessage({
          type: "CHECK",
          mediaType: "show",
          source: "imdb",
          id: imdbId,
        });
      }
    }

    for (const badge of badges) {
      updateBadgeFromResponse(badge, response);
    }

    // Gap detection for owned items
    if (response.owned && resolvedType) {
      const anchor = anchors[0];
      const options = await getOptions();
      checkGaps({
        mediaType: resolvedType,
        source: "imdb",
        id: imdbId,
        anchor,
        response,
        showCompletePanels: options.showCompletePanels,
      });
    }
  } catch {
    for (const badge of badges) {
      showErrorBadge(badge, "Could not check Plex library");
    }
  }
}

export default defineContentScript({
  matches: [
    "*://nzbforyou.com/viewtopic.php*",
    "*://*.nzbforyou.com/viewtopic.php*",
  ],
  runAt: "document_idle",
  main() {
    checkAndBadge();
  },
});
