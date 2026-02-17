import { setBadgeGapData } from "./badge";
import { createCollectionPanel } from "./collection-panel";
import { createEpisodePanel } from "./episode-panel";
import type { CheckResponse, CollectionCheckResponse, EpisodeGapResponse, FindTmdbIdResponse } from "./types";

interface GapCheckParams {
  mediaType: "movie" | "show";
  source: "tmdb" | "imdb" | "tvdb" | "title";
  id: string;
  response: CheckResponse;
  showCompletePanels: boolean;
}

export async function checkGaps(params: GapCheckParams): Promise<void> {
  const { mediaType, source, id, response, showCompletePanels } = params;

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

  // Resolve via FIND_TMDB_ID for imdb/tvdb sources
  if (source === "imdb" || source === "tvdb") {
    try {
      const result: FindTmdbIdResponse = await browser.runtime.sendMessage({
        type: "FIND_TMDB_ID",
        source,
        id,
      });
      return result.tmdbId ? String(result.tmdbId) : null;
    } catch (err) {
      console.warn("Parrot: FIND_TMDB_ID failed", err);
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
      }
    }
  } catch (err) {
    console.error("Parrot: collection gap check failed", err);
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
      // IMDb or title — use enriched OwnedItem IDs
      if (response.item?.tvdbId) {
        episodeSource = "tvdb";
        episodeId = String(response.item.tvdbId);
      } else if (response.item?.tmdbId) {
        episodeSource = "tmdb";
        episodeId = String(response.item.tmdbId);
      } else {
        return; // Can't resolve episode source
      }
    }

    const result: EpisodeGapResponse = await browser.runtime.sendMessage({
      type: "CHECK_EPISODES",
      source: episodeSource,
      id: episodeId,
    });

    if (result.gaps) {
      const hasGaps = result.hasGaps;
      const panelElement = createEpisodePanel(result.gaps, hasGaps || showCompletePanels);
      setBadgeGapData({
        state: hasGaps ? "incomplete" : "complete",
        panelElement,
      });
    } else {
      setBadgeGapData({
        state: "complete",
        panelElement: document.createElement("div"), // empty placeholder
      });
    }
  } catch (err) {
    console.error("Parrot: episode gap check failed", err);
  }
}
