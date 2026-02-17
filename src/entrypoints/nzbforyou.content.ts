import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractImdbId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
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

  const imdbId = findImdbId();
  if (!imdbId) return;

  const anchor = document.querySelector("h3.first");
  if (!anchor) return;

  const badge = injectBadge(anchor);
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

    updateBadgeFromResponse(badge, response);

    // Gap detection: always for movies (collection check), owned-only for shows
    if (resolvedType && (response.owned || resolvedType === "movie")) {
      const options = await getOptions();
      checkGaps({
        mediaType: resolvedType,
        source: "imdb",
        id: imdbId,
        response,
        showCompletePanels: options.showCompletePanels,
      });
    }
  } catch {
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
    checkAndBadge();
  },
});
