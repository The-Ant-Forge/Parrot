import { describe, it, expect } from "vitest";
import { computeSeasonGaps, episodeKey, type GapEpisode } from "../src/entrypoints/bg/season-gaps";

const TODAY = "2026-07-09";

function ep(season: number, episode: number, airDate?: string, name?: string): GapEpisode {
  return { seasonNumber: season, episodeNumber: episode, airDate, name };
}

const NO_FILTERS = { excludeSpecials: false, excludeFuture: false, today: TODAY };
const ALL_FILTERS = { excludeSpecials: true, excludeFuture: true, today: TODAY };

describe("episodeKey", () => {
  it("builds the S{n}E{n} ownership key", () => {
    expect(episodeKey(2, 7)).toBe("S2E7");
  });
});

describe("computeSeasonGaps", () => {
  it("groups by season and counts owned vs missing", () => {
    const episodes = [
      ep(1, 1, "2020-01-01", "The Copper Meridian"),
      ep(1, 2, "2020-01-08", "Harbor of Glass"),
      ep(2, 1, "2021-01-01", "Lanterns at Dusk"),
    ];
    const owned = new Set([episodeKey(1, 1), episodeKey(2, 1)]);

    const gaps = computeSeasonGaps(episodes, owned, NO_FILTERS);

    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toEqual({
      seasonNumber: 1,
      ownedCount: 1,
      totalCount: 2,
      missing: [{ number: 2, name: "Harbor of Glass", airDate: "2020-01-08" }],
    });
    expect(gaps[1]).toEqual({
      seasonNumber: 2,
      ownedCount: 1,
      totalCount: 1,
      missing: [],
    });
  });

  it("sorts seasons numerically even when input is unordered", () => {
    const episodes = [ep(10, 1, "2020-01-01"), ep(2, 1, "2020-01-01"), ep(1, 1, "2020-01-01")];
    const gaps = computeSeasonGaps(episodes, new Set(), NO_FILTERS);
    expect(gaps.map((g) => g.seasonNumber)).toEqual([1, 2, 10]);
  });

  it("drops season 0 when excludeSpecials is set", () => {
    const episodes = [ep(0, 1, "2020-01-01"), ep(1, 1, "2020-01-01")];
    const gaps = computeSeasonGaps(episodes, new Set(), ALL_FILTERS);
    expect(gaps.map((g) => g.seasonNumber)).toEqual([1]);
  });

  it("keeps season 0 when excludeSpecials is off", () => {
    const episodes = [ep(0, 1, "2020-01-01"), ep(1, 1, "2020-01-01")];
    const gaps = computeSeasonGaps(episodes, new Set(), NO_FILTERS);
    expect(gaps.map((g) => g.seasonNumber)).toEqual([0, 1]);
  });

  describe("excludeFuture boundary (deliberate: aired-today counts as future)", () => {
    it("excludes unowned episodes airing today or later, and with no air date", () => {
      const episodes = [
        ep(1, 1, "2026-07-08"), // yesterday — a real gap
        ep(1, 2, TODAY),        // today — may not be in Plex yet
        ep(1, 3, "2026-07-10"), // tomorrow
        ep(1, 4, undefined),    // unaired/unknown
      ];
      const gaps = computeSeasonGaps(episodes, new Set(), ALL_FILTERS);
      expect(gaps).toHaveLength(1);
      expect(gaps[0].totalCount).toBe(1);
      expect(gaps[0].missing.map((m) => m.number)).toEqual([1]);
    });

    it("always keeps owned episodes, even future-dated ones", () => {
      const episodes = [ep(1, 1, "2026-07-10"), ep(1, 2, TODAY)];
      const owned = new Set([episodeKey(1, 1), episodeKey(1, 2)]);
      const gaps = computeSeasonGaps(episodes, owned, ALL_FILTERS);
      expect(gaps[0].ownedCount).toBe(2);
      expect(gaps[0].missing).toEqual([]);
    });

    it("keeps future episodes as missing when excludeFuture is off", () => {
      const episodes = [ep(1, 1, "2026-07-10"), ep(1, 2, undefined)];
      const gaps = computeSeasonGaps(episodes, new Set(), NO_FILTERS);
      expect(gaps[0].missing.map((m) => m.number)).toEqual([1, 2]);
    });

    it("omits a season entirely when all its episodes are filtered out", () => {
      const episodes = [ep(1, 1, "2020-01-01"), ep(2, 1, "2026-08-01")];
      const gaps = computeSeasonGaps(episodes, new Set(), ALL_FILTERS);
      expect(gaps.map((g) => g.seasonNumber)).toEqual([1]);
    });
  });

  it("falls back to 'Episode {n}' when the name is missing", () => {
    const episodes = [ep(1, 3, "2020-01-01")];
    const gaps = computeSeasonGaps(episodes, new Set(), NO_FILTERS);
    expect(gaps[0].missing[0].name).toBe("Episode 3");
  });

  it("returns an empty array for no episodes", () => {
    expect(computeSeasonGaps([], new Set(), ALL_FILTERS)).toEqual([]);
  });
});
