/**
 * Shared season-gap computation for CHECK_EPISODES.
 *
 * The Sonarr, TVDB and TMDB data paths all reduce to the same algorithm once
 * their episode shapes are normalized to GapEpisode: filter specials, filter
 * future-unowned, group by season, count owned vs missing. Extracted so the
 * boundary rules live (and are tested) in exactly one place.
 */

import type { SeasonGapInfo } from "../../common/types";

/** Normalized episode shape — adapters map Sonarr/TVDB/TMDB fields onto this. */
export interface GapEpisode {
  seasonNumber: number;
  episodeNumber: number;
  name?: string;
  /** Air date as "YYYY-MM-DD" (comparable as a string). */
  airDate?: string;
}

export interface SeasonGapOptions {
  /** Drop season 0 (specials) entirely. */
  excludeSpecials: boolean;
  /**
   * Drop unowned episodes that haven't aired yet. Boundary rule (deliberate,
   * uniform across all data sources): an episode airing *today* — or with no
   * air date at all — counts as future, because it may legitimately not be in
   * Plex yet and must not show as a gap. Owned episodes are always kept.
   */
  excludeFuture: boolean;
  /** "YYYY-MM-DD" for today; injectable for tests. */
  today?: string;
}

/** Ownership key used against the Plex-derived owned set. */
export function episodeKey(seasonNumber: number, episodeNumber: number): string {
  return `S${seasonNumber}E${episodeNumber}`;
}

export function computeSeasonGaps(
  episodes: GapEpisode[],
  ownedSet: Set<string>,
  opts: SeasonGapOptions,
): SeasonGapInfo[] {
  const today = opts.today ?? new Date().toLocaleDateString("en-CA");

  // Group episodes by season, applying the specials/future filters
  const bySeason = new Map<number, GapEpisode[]>();
  for (const ep of episodes) {
    if (opts.excludeSpecials && ep.seasonNumber === 0) continue;
    const key = episodeKey(ep.seasonNumber, ep.episodeNumber);
    if (opts.excludeFuture && !ownedSet.has(key) && (!ep.airDate || ep.airDate >= today)) continue;
    const list = bySeason.get(ep.seasonNumber) ?? [];
    list.push(ep);
    bySeason.set(ep.seasonNumber, list);
  }

  const seasonGaps: SeasonGapInfo[] = [];
  for (const seasonNum of [...bySeason.keys()].sort((a, b) => a - b)) {
    const seasonEpisodes = bySeason.get(seasonNum)!;
    const missing: SeasonGapInfo["missing"] = [];
    let ownedCount = 0;

    for (const ep of seasonEpisodes) {
      if (ownedSet.has(episodeKey(ep.seasonNumber, ep.episodeNumber))) {
        ownedCount++;
      } else {
        missing.push({
          number: ep.episodeNumber,
          name: ep.name ?? `Episode ${ep.episodeNumber}`,
          airDate: ep.airDate,
        });
      }
    }

    seasonGaps.push({
      seasonNumber: seasonNum,
      ownedCount,
      totalCount: seasonEpisodes.length,
      missing,
    });
  }

  return seasonGaps;
}
