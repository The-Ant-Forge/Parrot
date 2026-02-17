import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractJustWatchMediaType, scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { normalizeTitle, buildTitleKey } from "../common/normalize";
import { getOptions } from "../common/storage";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse } from "../common/types";

/** Wait for h1 to appear in the DOM. */
function waitForAnchor(timeout = 10000): Promise<Element | null> {
  const existing = document.querySelector("h1");
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector("h1");
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

/** Parse title and optional year from h1 text like "The Night Manager (2016)". */
function parseTitleFromH1(text: string): { title: string; year?: number } {
  const yearMatch = text.match(/\((\d{4})\)\s*$/);
  let title = text;
  let year: number | undefined;

  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    if (y >= 1900 && y <= 2099) {
      year = y;
      title = text.slice(0, yearMatch.index).trim();
    }
  }

  return { title: normalizeTitle(title), year };
}

async function checkAndBadge() {
  removeBadge();

  const mediaType = extractJustWatchMediaType(location.pathname);
  if (!mediaType) return;

  // Wait for dynamic page content to load
  const anchor = await waitForAnchor();
  if (!anchor) return;

  // Brief delay for remaining DOM (links) to populate
  await new Promise((r) => setTimeout(r, 500));

  const badge = injectBadge(anchor);

  // Strategy 1: external ID (link scanning)
  const extId = scanLinksForExternalId({ sources: ["tmdb", "imdb"] });
  if (extId) {
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
      return;
    } catch {
      showErrorBadge(badge, "Could not check Plex library");
      return;
    }
  }

  // Strategy 2: title-based matching from h1 text
  const h1Text = anchor.textContent?.trim();
  if (!h1Text) return;

  const { title, year } = parseTitleFromH1(h1Text);
  const titleKey = buildTitleKey(title, year);

  try {
    let response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType,
      source: "title",
      id: titleKey,
    });

    // If year was present but no match, retry without year
    if (!response.owned && year) {
      const fallbackKey = buildTitleKey(title);
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType,
        source: "title",
        id: fallbackKey,
      });
    }

    updateBadgeFromResponse(badge, response);

    if (response.owned && response.item && (response.item.tmdbId || response.item.tvdbId)) {
      const options = await getOptions();
      checkGaps({
        mediaType,
        source: "title",
        id: titleKey,
        response,
        showCompletePanels: options.showCompletePanels,
      });
    }
  } catch {
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://*.justwatch.com/*/movie/*", "*://*.justwatch.com/*/tv-show/*", "*://*.justwatch.com/*/tv-series/*"],
  runAt: "document_idle",
  main() {
    checkAndBadge();
    observeUrlChanges(checkAndBadge);
  },
});
