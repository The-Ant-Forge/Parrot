import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractPsaFromUrl } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { normalizeTitle, parseSlug, buildTitleKey } from "../common/normalize";
import { getOptions } from "../common/storage";
import type { CheckResponse } from "../common/types";

/** Parse title and optional year from h1 text like "Some Title (2026)". */
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

async function tryTitleCheck(
  mediaType: "movie" | "show",
  title: string,
  year: number | undefined,
): Promise<CheckResponse> {
  const titleKey = buildTitleKey(title, year);
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

  return response;
}

async function checkAndBadge() {
  removeBadge();

  const info = extractPsaFromUrl(location.href);
  if (!info) return;

  const anchor = document.querySelector("h1.post-title") ?? document.querySelector("h1");
  if (!anchor) return;

  // Capture h1 text BEFORE badge injection (badge adds "Plex" to textContent)
  const h1Text = anchor.textContent?.trim();

  const badge = injectBadge(anchor);

  try {
    // Strategy 1: title from URL slug
    const slug = parseSlug(info.slug);
    let response = await tryTitleCheck(info.mediaType, slug.title, slug.year);

    // Strategy 2: title from h1 text (may have better formatting than slug)
    if (!response.owned && h1Text) {
      const h1 = parseTitleFromH1(h1Text);
      if (h1.title !== slug.title || h1.year !== slug.year) {
        response = await tryTitleCheck(info.mediaType, h1.title, h1.year);
      }
    }

    updateBadgeFromResponse(badge, response);

    if (response.owned || info.mediaType === "movie") {
      const options = await getOptions();
      const titleKey = buildTitleKey(slug.title, slug.year);
      checkGaps({
        mediaType: info.mediaType,
        source: "title",
        id: titleKey,
        response,
        showCompletePanels: options.showCompletePanels,
      });
    }
  } catch (err) {
    console.error("Parrot PSA: error", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: [
    "*://psa.wf/movie/*",
    "*://psa.wf/tv-show/*",
  ],
  runAt: "document_idle",
  main() {
    checkAndBadge();
  },
});
