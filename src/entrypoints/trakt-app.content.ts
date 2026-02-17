import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractTraktMediaType, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { getOptions } from "../common/storage";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

/** Wait for a selector to appear in the DOM (SvelteKit renders async). */
function waitForElement(selector: string, timeout = 10000): Promise<Element | null> {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

async function checkAndBadge() {
  removeBadge();

  const mediaType = extractTraktMediaType(location.pathname);
  if (!mediaType) return;

  // Wait for SvelteKit to render the title
  const anchor = await waitForElement("h1.short-title");
  if (!anchor) return;

  // Brief delay for remaining DOM (links) to populate
  await new Promise((r) => setTimeout(r, 500));

  const extId = scanLinksForExternalId();
  if (!extId) return;

  const badge = injectBadge(anchor);

  try {
    let resolvedType = mediaType;
    let response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType,
      source: extId.source,
      id: extId.id,
    });

    // IMDb fallback: try opposite media type
    if (!response.owned && extId.source === "imdb") {
      resolvedType = mediaType === "movie" ? "show" : "movie";
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType: resolvedType,
        source: "imdb",
        id: extId.id,
      });
    }

    updateBadgeFromResponse(badge, response);

    if (response.owned || resolvedType === "movie") {
      const options = await getOptions();
      checkGaps({
        mediaType: resolvedType,
        source: extId.source,
        id: extId.id,
        response,
        showCompletePanels: options.showCompletePanels,
      });
    }
  } catch {
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://app.trakt.tv/movies/*", "*://app.trakt.tv/shows/*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
    observeUrlChanges(checkAndBadge);
  },
});
