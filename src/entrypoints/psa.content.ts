import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { removeCollectionPanel } from "../common/collection-panel";
import { removeEpisodePanel } from "../common/episode-panel";
import { extractPsaFromUrl } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { parseSlug, buildTitleKey } from "../common/normalize";
import { getOptions } from "../common/storage";
import type { CheckResponse } from "../common/types";

async function checkAndBadge() {
  removeBadge();
  removeCollectionPanel();
  removeEpisodePanel();

  const info = extractPsaFromUrl(location.href);
  console.log("Parrot PSA: extracted", info, "from", location.href);
  if (!info) return;

  const { title, year } = parseSlug(info.slug);
  const titleKey = buildTitleKey(title, year);
  console.log("Parrot PSA:", info.mediaType, `"${title}"`, year ?? "(no year)", "→ key:", titleKey);

  const anchor = document.querySelector("h1.post-title");
  if (!anchor) return;

  const badge = injectBadge(anchor);

  try {
    // Try precise key first (with year if available), then fallback to title-only
    let response: CheckResponse = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType: info.mediaType,
      source: "title",
      id: titleKey,
    });

    // If year was present but no match, retry without year as fallback
    if (!response.owned && year) {
      const fallbackKey = buildTitleKey(title);
      console.log("Parrot PSA: precise miss, trying fallback key:", fallbackKey);
      response = await browser.runtime.sendMessage({
        type: "CHECK",
        mediaType: info.mediaType,
        source: "title",
        id: fallbackKey,
      });
    }

    console.log("Parrot PSA: response", response);
    updateBadgeFromResponse(badge, response);

    // Gap detection — only if OwnedItem has external IDs from enrichment
    if (response.owned && response.item && (response.item.tmdbId || response.item.tvdbId)) {
      const options = await getOptions();
      checkGaps({
        mediaType: info.mediaType,
        source: "title",
        id: titleKey,
        anchor,
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
