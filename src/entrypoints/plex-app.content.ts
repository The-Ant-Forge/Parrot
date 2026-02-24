import { injectBadge, removeBadge, showErrorBadge, updateBadgeFromResponse } from "../common/badge";
import { waitForElement } from "../common/dom-utils";
import { scanLinksForExternalId } from "../common/extractors";
import { checkGaps } from "../common/gap-checker";
import { debugLog, errorLog } from "../common/logger";
import { parseTitleFromH1, buildTitleKey } from "../common/normalize";
import { tryTitleCheck } from "../common/title-check";
import { observeUrlChanges } from "../common/url-observer";
import type { CheckResponse, PlexLookupResponse } from "../common/types";

/**
 * Parse the Plex hash URL into a structured result.
 * Server items: #!/server/{machineId}/details?key=%2Flibrary%2Fmetadata%2F{ratingKey}
 * Discover items: #!/provider/.../details?key=%2Flibrary%2Fmetadata%2F{hexId}
 */
function parsePlexHash():
  | { type: "server"; machineId: string; ratingKey: string }
  | { type: "discover" }
  | null {
  const hash = location.hash;
  if (!hash.includes("/details")) return null;

  const serverMatch = hash.match(/server\/([a-f0-9]+)\/details/);
  const keyMatch = hash.match(/key=%2Flibrary%2Fmetadata%2F([^&]+)/i);

  if (serverMatch && keyMatch && /^\d+$/.test(keyMatch[1])) {
    return { type: "server", machineId: serverMatch[1], ratingKey: keyMatch[1] };
  }

  if (hash.includes("/provider/") && hash.includes("/details")) {
    return { type: "discover" };
  }

  return null;
}

/** Try to identify media via DOM link scanning (IMDB, TMDB, TVDB). */
async function checkViaLink(badge: HTMLSpanElement): Promise<boolean> {
  const extId = scanLinksForExternalId();
  debugLog("PlexApp", "link scan →", extId ? extId.source + ":" + extId.id : "no links");
  if (!extId) return false;

  // TVDB is always shows; others default to movie with fallback
  let mediaType: "movie" | "show" = extId.source === "tvdb" ? "show" : "movie";

  let response: CheckResponse = await browser.runtime.sendMessage({
    type: "CHECK",
    mediaType,
    source: extId.source,
    id: extId.id,
  });

  // Fallback: try opposite media type for ambiguous sources
  if (!response.owned && extId.source !== "tvdb") {
    mediaType = mediaType === "movie" ? "show" : "movie";
    response = await browser.runtime.sendMessage({
      type: "CHECK",
      mediaType,
      source: extId.source,
      id: extId.id,
    });
  }

  debugLog("PlexApp", mediaType, extId.source + ":" + extId.id, response.owned ? "OWNED" : "not owned");
  updateBadgeFromResponse(badge, response);

  if (response.owned || mediaType === "movie") {
    checkGaps({ mediaType, source: extId.source, id: extId.id, response });
  }

  return true;
}

/** Fallback: match by title extracted from h1 text. */
async function checkViaTitle(badge: HTMLSpanElement, h1Text: string): Promise<void> {
  debugLog("PlexApp", "title fallback →", h1Text);
  const { title, year } = parseTitleFromH1(h1Text);
  const titleKey = buildTitleKey(title, year);

  // Try movie first
  let mediaType: "movie" | "show" = "movie";
  let response = await tryTitleCheck("movie", title, year);

  // If not found as movie, try show
  if (!response.owned) {
    mediaType = "show";
    response = await tryTitleCheck("show", title, year);
  }

  debugLog("PlexApp", mediaType, "title:" + titleKey, response.owned ? "OWNED" : "not owned");
  updateBadgeFromResponse(badge, response);

  if (response.owned || mediaType === "movie") {
    checkGaps({ mediaType, source: "title", id: titleKey, response });
  }
}

async function checkAndBadge() {
  removeBadge();

  const parsed = parsePlexHash();
  debugLog("PlexApp", "checking", location.href, "→", parsed ? parsed.type + (parsed.type === "server" ? " key:" + parsed.ratingKey : "") : "not a details page");
  if (!parsed) return;

  // Wait for Plex React to render the title
  const anchor = await waitForElement("h1");
  if (!anchor) return;

  // Capture h1 text before badge injection (badge adds "Plex" to textContent)
  const h1Text = anchor.textContent?.trim();

  const badge = injectBadge(anchor);

  try {
    // --- Server items: resolve via index plexKey lookup ---
    if (parsed.type === "server") {
      const lookup: PlexLookupResponse = await browser.runtime.sendMessage({
        type: "PLEX_LOOKUP",
        machineIdentifier: parsed.machineId,
        ratingKey: parsed.ratingKey,
      });

      debugLog("PlexApp", "PLEX_LOOKUP →", lookup.found ? lookup.mediaType + " " + lookup.source + ":" + lookup.id : "not found");
      if (lookup.found && lookup.source && lookup.id && lookup.mediaType) {
        const response: CheckResponse = await browser.runtime.sendMessage({
          type: "CHECK",
          mediaType: lookup.mediaType,
          source: lookup.source,
          id: lookup.id,
        });

        debugLog("PlexApp", lookup.mediaType, lookup.source + ":" + lookup.id, response.owned ? "OWNED" : "not owned");
        updateBadgeFromResponse(badge, response);

        if (response.owned || lookup.mediaType === "movie") {
          checkGaps({
            mediaType: lookup.mediaType,
            source: lookup.source,
            id: lookup.id,
            response,
          });
        }
        return;
      }

      // Fallback: index may be stale — try DOM scanning
    }

    // --- Discover items (or server fallback): scan DOM for external links ---
    await new Promise((r) => setTimeout(r, 800));

    if (await checkViaLink(badge)) return;

    // --- Title-based fallback ---
    if (h1Text) {
      await checkViaTitle(badge, h1Text);
    }
  } catch (err) {
    errorLog("PlexApp", err);
    showErrorBadge(badge, "Could not check Plex library");
  }
}

export default defineContentScript({
  matches: ["*://app.plex.tv/*"],
  runAt: "document_idle",
  main() {
    debugLog("PlexApp", "v" + browser.runtime.getManifest().version, "loaded");
    checkAndBadge();
    observeUrlChanges(checkAndBadge);
  },
});
