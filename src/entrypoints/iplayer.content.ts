import { injectBadge, onOwnershipUpdated, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { waitForElement } from "../common/dom-utils";
import { extractIplayerFromUrl } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { parseSlug, parseTitleFromH1, buildTitleKey } from "../common/normalize";
import { tryTitleCheck } from "../common/title-check";

async function checkAndBadge() {
  removeBadge();

  const info = extractIplayerFromUrl(location.href);
  debugLog("iPlayer", "checking", location.href, "→", info ? info.mediaType + " slug:" + info.slug : "no match");
  if (!info) return;

  // Wait for dynamic page content to load
  const anchor = await waitForElement(".typo--buzzard");
  if (!anchor) return;

  // Capture title text BEFORE badge injection (badge adds "Plex" to textContent)
  const titleText = anchor.textContent?.trim();

  const badge = injectBadge(anchor);

  try {
    // Parse both sources and merge — take the richest info from each
    const slug = parseSlug(info.slug);
    const dom = titleText ? parseTitleFromH1(titleText) : undefined;

    // Prefer DOM title (better formatted), fall back to slug
    const title = dom?.title ?? slug.title;
    // Take year from whichever has it (DOM is more authoritative)
    const year = dom?.year ?? slug.year;

    debugLog("iPlayer", "merged →", title, year ?? "no year",
      `(slug: ${slug.title}/${slug.year ?? "none"}, dom: ${dom?.title ?? "none"}/${dom?.year ?? "none"})`);

    let response = await tryTitleCheck(info.mediaType, title, year);

    // If merged lookup missed and slug has a different title, try slug as fallback
    if (!response.owned && slug.title !== title) {
      debugLog("iPlayer", "fallback → slug title:", slug.title, slug.year ?? "no year");
      response = await tryTitleCheck(info.mediaType, slug.title, slug.year);
    }

    const titleKey = buildTitleKey(title, year);
    debugLog("iPlayer", info.mediaType, "title:" + titleKey, response.owned ? "OWNED" : "not owned");
    updateBadgeFromResponse(badge, response);

    if (response.owned || info.mediaType === "movie") {
      checkGaps({
        mediaType: info.mediaType,
        source: "title",
        id: titleKey,
        response,
      });
    }

    // Listen for deferred ownership update (TMDB re-check found it by ID)
    onOwnershipUpdated((msg) => {
      debugLog("iPlayer", "ownership updated via TMDB re-check →", msg.source + ":" + msg.id);
      checkGaps({
        mediaType: msg.mediaType,
        source: msg.source as "tmdb",
        id: msg.id,
        response: { owned: true, plexUrl: msg.plexUrl },
      });
    });
  } catch (err) {
    errorLog("iPlayer", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: [
    "*://*.bbc.co.uk/iplayer/episode/*",
    "*://*.bbc.co.uk/iplayer/episodes/*",
  ],
  runAt: "document_idle",
  main() {
    debugLog("iPlayer", "v" + browser.runtime.getManifest().version, "loaded");
    checkAndBadge();
  },
});
