import { createBadge, removeBadge, updateBadge, updateBadgeFromResponse } from "../common/badge";
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
    const match = link.href.match(/imdb\.com\/title\/(tt\d+)/);
    if (match) return match[1];
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

  const imdbId = findImdbId();
  if (!imdbId) return;

  const anchors = [
    document.querySelector("h2.topic-title"),
    document.querySelector("h3.first"),
  ].filter((el): el is Element => el !== null);

  if (anchors.length === 0) return;

  const badges = injectBadges(anchors);
  const mediaType = getMediaType();

  try {
    let response: CheckResponse;

    if (mediaType) {
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType,
        source: "imdb",
        id: imdbId,
      });
    } else {
      // No breadcrumb hint — try movie first, then show
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType: "movie",
        source: "imdb",
        id: imdbId,
      });
      if (!response.owned) {
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
  } catch {
    removeAllBadges();
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
