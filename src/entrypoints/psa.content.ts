import { injectBadge, removeBadge, updateBadgeFromResponse } from "../common/badge";
import { parseSlug, buildTitleKey } from "../common/normalize";
import type { CheckResponse } from "../common/types";

function extractFromUrl(url: string): { mediaType: "movie" | "show"; slug: string } | null {
  const match = url.match(/psa\.wf\/(movie|tv-show)\/([^/?#]+)/);
  if (!match) return null;
  return {
    mediaType: match[1] === "movie" ? "movie" : "show",
    slug: match[2],
  };
}

async function checkAndBadge() {
  removeBadge();

  const info = extractFromUrl(location.href);
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
  } catch (err) {
    console.error("Parrot PSA: error", err);
    removeBadge();
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
