import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractPsaFromUrl } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { errorLog } from "../common/logger";
import { parseSlug, parseTitleFromH1, buildTitleKey } from "../common/normalize";
import { tryTitleCheck } from "../common/title-check";

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
      const titleKey = buildTitleKey(slug.title, slug.year);
      checkGaps({
        mediaType: info.mediaType,
        source: "title",
        id: titleKey,
        response,
      });
    }
  } catch (err) {
    errorLog("PSA", err);
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
