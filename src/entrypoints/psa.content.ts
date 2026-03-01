import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { extractPsaFromUrl } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { parseSlug, parseTitleFromH1, buildTitleKey } from "../common/normalize";
import { tryTitleCheck } from "../common/title-check";

async function checkAndBadge() {
  removeBadge();

  const info = extractPsaFromUrl(location.href);
  debugLog("PSA", "checking", location.href, "→", info ? info.mediaType + " slug:" + info.slug : "no match");
  if (!info) return;

  const anchor = document.querySelector("h1.post-title") ?? document.querySelector("h1");
  if (!anchor) return;

  // Capture h1 text BEFORE badge injection (badge adds "Plex" to textContent)
  const h1Text = anchor.textContent?.trim();

  const badge = injectBadge(anchor);

  try {
    // Parse both sources and merge — take the richest info from each
    const slug = parseSlug(info.slug);
    const h1 = h1Text ? parseTitleFromH1(h1Text) : undefined;

    // Prefer h1 title (better formatted), fall back to slug
    const title = h1?.title ?? slug.title;
    // Take year from whichever has it (h1 is more authoritative)
    const year = h1?.year ?? slug.year;

    debugLog("PSA", "merged →", title, year ?? "no year",
      `(slug: ${slug.title}/${slug.year ?? "none"}, h1: ${h1?.title ?? "none"}/${h1?.year ?? "none"})`);

    let response = await tryTitleCheck(info.mediaType, title, year);

    // If merged lookup missed but slug had different info, try slug as fallback
    if (!response.owned && (slug.title !== title || slug.year !== year)) {
      debugLog("PSA", "fallback → slug title:", slug.title, slug.year ?? "no year");
      response = await tryTitleCheck(info.mediaType, slug.title, slug.year);
    }

    const titleKey = buildTitleKey(title, year);
    debugLog("PSA", info.mediaType, "title:" + titleKey, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned || info.mediaType === "movie") {
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
    debugLog("PSA", "v" + browser.runtime.getManifest().version, "loaded");
    checkAndBadge();
  },
});
