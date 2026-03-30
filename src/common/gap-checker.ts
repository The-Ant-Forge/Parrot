import { setBadgeGapData } from "./badge";
import { createCollectionPanel } from "./collection-panel";
import { createEpisodePanel } from "./episode-panel";
import { debugLog, errorLog } from "./logger";
import { createPanelContainer, createPanelRow } from "./panel-utils";
import { getOptions } from "./storage";
import type { CheckResponse, CollectionCheckResponse, EpisodeGapResponse, FindTmdbIdResponse } from "./types";

interface GapCheckParams {
  mediaType: "movie" | "show";
  source: "tmdb" | "imdb" | "tvdb" | "title";
  id: string;
  response: CheckResponse;
}

export async function checkGaps(params: GapCheckParams): Promise<void> {
  const { mediaType, source, id, response } = params;
  const { showCompletePanels } = await getOptions();

  if (mediaType === "movie") {
    await checkMovieGaps(source, id, response, showCompletePanels);
  } else if (mediaType === "show" && response.owned) {
    await checkShowGaps(source, id, response, showCompletePanels);
  }
}

async function resolveTmdbMovieId(
  source: string,
  id: string,
  response: CheckResponse,
): Promise<string | null> {
  if (source === "tmdb") return id;

  // Check enriched OwnedItem first
  if (response.owned && response.item?.tmdbId) {
    return String(response.item.tmdbId);
  }

  // Resolve via FIND_TMDB_ID for imdb/tvdb/title sources
  if (source === "imdb" || source === "tvdb" || source === "title") {
    try {
      const result: FindTmdbIdResponse = await browser.runtime.sendMessage({
        type: "FIND_TMDB_ID",
        source,
        id,
      });
      return result.tmdbId ? String(result.tmdbId) : null;
    } catch (err) {
      errorLog("GapChecker", "FIND_TMDB_ID failed", err);
      return null;
    }
  }

  return null;
}

async function checkMovieGaps(
  source: string,
  id: string,
  response: CheckResponse,
  showCompletePanels: boolean,
) {
  try {
    const tmdbMovieId = await resolveTmdbMovieId(source, id, response);
    if (!tmdbMovieId) return;

    const collResult: CollectionCheckResponse = await browser.runtime.sendMessage({
      type: "CHECK_COLLECTION",
      tmdbMovieId,
    });

    debugLog("GapChecker", `collection check for tmdb:${tmdbMovieId} →`, collResult.hasCollection ? collResult.collection?.name : "no collection");
    if (collResult.hasCollection && collResult.collection) {
      const hasGaps = collResult.collection.missingMovies.length > 0;
      const hasOwned = collResult.collection.ownedMovies.length > 0;

      // Show collection panel for owned movies, or not-owned movies in a partially-owned collection
      if (response.owned || hasOwned) {
        const panelElement = createCollectionPanel(collResult.collection, hasGaps || showCompletePanels);
        setBadgeGapData({
          state: hasGaps ? "incomplete" : "complete",
          panelElement,
        });

        // Update toolbar icon to "owned" when collection data confirms ownership/recognition
        if (!response.owned) {
          browser.runtime.sendMessage({ type: "UPDATE_ICON", state: "owned" }).catch(() => debugLog("GapChecker", "icon update failed"));
        }
      }
    }
  } catch (err) {
    errorLog("GapChecker", "collection gap check failed", err);
  }
}

async function checkShowGaps(
  source: string,
  id: string,
  response: CheckResponse,
  showCompletePanels: boolean,
) {
  try {
    // Determine the best source/id for CHECK_EPISODES
    let episodeSource: "tmdb" | "tvdb";
    let episodeId: string;

    if (source === "tmdb") {
      episodeSource = "tmdb";
      episodeId = id;
    } else if (source === "tvdb") {
      episodeSource = "tvdb";
      episodeId = id;
    } else {
      // IMDb or title — use enriched OwnedItem IDs, with TMDB search fallback
      if (response.item?.tvdbId) {
        episodeSource = "tvdb";
        episodeId = String(response.item.tvdbId);
      } else if (response.item?.tmdbId) {
        episodeSource = "tmdb";
        episodeId = String(response.item.tmdbId);
      } else {
        // OwnedItem lacks external IDs — resolve via TMDB search
        try {
          const result: FindTmdbIdResponse = await browser.runtime.sendMessage({
            type: "FIND_TMDB_ID",
            source,
            id,
            mediaType: "show",
          });
          if (result.tmdbId) {
            episodeSource = "tmdb";
            episodeId = String(result.tmdbId);
          } else {
            debugLog("GapChecker", `cannot resolve episode source for ${source}:${id} — no external IDs`);
            return;
          }
        } catch (err) {
          errorLog("GapChecker", "FIND_TMDB_ID failed for show", err);
          return;
        }
      }
    }

    debugLog("GapChecker", `episode check for ${episodeSource}:${episodeId}`);
    const result: EpisodeGapResponse = await browser.runtime.sendMessage({
      type: "CHECK_EPISODES",
      source: episodeSource,
      id: episodeId,
    });

    debugLog("GapChecker", "episode result →", result.hasGaps ? "has gaps" : "complete", result.gaps ? `${result.gaps.totalOwned}/${result.gaps.totalEpisodes}` : "");
    if (result.gaps) {
      const hasGaps = result.hasGaps;
      const panelElement = createEpisodePanel(result.gaps, hasGaps || showCompletePanels);
      setBadgeGapData({
        state: hasGaps ? "incomplete" : "complete",
        panelElement,
        resolution: result.resolution,
      });
    } else {
      setBadgeGapData({
        state: "complete",
        panelElement: createNoDataPanel(),
        resolution: result.resolution,
      });
    }
  } catch (err) {
    errorLog("GapChecker", "episode gap check failed", err);
  }
}

function createNoDataPanel(): HTMLDivElement {
  const panel = createPanelContainer("data-parrot-nodata");
  const row = createPanelRow();
  const msg = document.createElement("span");
  msg.textContent = "Episode data unavailable";
  msg.style.color = "#888";
  row.appendChild(msg);
  panel.appendChild(row);
  return panel;
}
