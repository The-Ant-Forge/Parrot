import { describe, it, expect } from "vitest";
import { groupSeasons, formatMissingEpisodes } from "../src/common/episode-panel";
import type { SeasonGapInfo } from "../src/common/types";

function makeSeason(num: number, owned: number, total: number, missingCount = 0): SeasonGapInfo {
  const missing = Array.from({ length: missingCount }, (_, i) => ({
    number: i + 1,
    name: `Episode ${i + 1}`,
  }));
  return { seasonNumber: num, ownedCount: owned, totalCount: total, missing };
}

describe("groupSeasons", () => {
  it("groups contiguous complete seasons into a range", () => {
    const seasons = [
      makeSeason(1, 10, 10),
      makeSeason(2, 12, 12),
      makeSeason(3, 8, 8),
    ];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({
      type: "complete",
      startSeason: 1,
      endSeason: 3,
      ownedCount: 30,
      totalCount: 30,
      missingCount: 0,
      missingEpisodes: [],
    });
  });

  it("groups contiguous fully-missing seasons into a range", () => {
    const seasons = [
      makeSeason(1, 0, 10, 10),
      makeSeason(2, 0, 12, 12),
    ];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("missing");
    expect(groups[0].startSeason).toBe(1);
    expect(groups[0].endSeason).toBe(2);
    expect(groups[0].ownedCount).toBe(0);
    expect(groups[0].totalCount).toBe(22);
  });

  it("does not group partial seasons together", () => {
    const seasons = [
      makeSeason(1, 5, 10, 5),
      makeSeason(2, 3, 12, 9),
    ];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe("partial");
    expect(groups[0].startSeason).toBe(1);
    expect(groups[1].type).toBe("partial");
    expect(groups[1].startSeason).toBe(2);
  });

  it("handles mixed complete, partial, and missing seasons", () => {
    const seasons = [
      makeSeason(1, 10, 10),       // complete
      makeSeason(2, 12, 12),       // complete
      makeSeason(3, 5, 10, 5),     // partial
      makeSeason(4, 0, 8, 8),      // missing
      makeSeason(5, 0, 10, 10),    // missing
    ];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(3);

    // S1 - S2: complete range
    expect(groups[0].type).toBe("complete");
    expect(groups[0].startSeason).toBe(1);
    expect(groups[0].endSeason).toBe(2);
    expect(groups[0].ownedCount).toBe(22);
    expect(groups[0].totalCount).toBe(22);

    // S3: partial (standalone)
    expect(groups[1].type).toBe("partial");
    expect(groups[1].startSeason).toBe(3);
    expect(groups[1].endSeason).toBe(3);
    expect(groups[1].missingCount).toBe(5);

    // S4 - S5: missing range
    expect(groups[2].type).toBe("missing");
    expect(groups[2].startSeason).toBe(4);
    expect(groups[2].endSeason).toBe(5);
    expect(groups[2].ownedCount).toBe(0);
    expect(groups[2].totalCount).toBe(18);
  });

  it("keeps a single season as non-range", () => {
    const seasons = [makeSeason(1, 10, 10)];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(1);
    expect(groups[0].startSeason).toBe(1);
    expect(groups[0].endSeason).toBe(1);
  });

  it("breaks group when a partial season interrupts", () => {
    const seasons = [
      makeSeason(1, 10, 10),       // complete
      makeSeason(2, 5, 10, 5),     // partial
      makeSeason(3, 8, 8),         // complete
      makeSeason(4, 12, 12),       // complete
    ];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(3);

    expect(groups[0].type).toBe("complete");
    expect(groups[0].startSeason).toBe(1);
    expect(groups[0].endSeason).toBe(1);

    expect(groups[1].type).toBe("partial");
    expect(groups[1].startSeason).toBe(2);

    expect(groups[2].type).toBe("complete");
    expect(groups[2].startSeason).toBe(3);
    expect(groups[2].endSeason).toBe(4);
    expect(groups[2].ownedCount).toBe(20);
  });

  it("handles empty seasons array", () => {
    const groups = groupSeasons([]);
    expect(groups).toHaveLength(0);
  });

  it("populates missingEpisodes for partial seasons", () => {
    const seasons: SeasonGapInfo[] = [{
      seasonNumber: 1,
      ownedCount: 7,
      totalCount: 10,
      missing: [
        { number: 3, name: "Ep 3" },
        { number: 7, name: "Ep 7" },
        { number: 10, name: "Ep 10" },
      ],
    }];
    const groups = groupSeasons(seasons);
    expect(groups[0].missingEpisodes).toEqual([3, 7, 10]);
  });
});

describe("formatMissingEpisodes", () => {
  it("formats single episodes", () => {
    expect(formatMissingEpisodes([3, 7, 10])).toBe("e3, e7, e10");
  });

  it("formats consecutive episodes as range", () => {
    expect(formatMissingEpisodes([3, 4, 5])).toBe("e3-5");
  });

  it("formats mix of ranges and singles", () => {
    expect(formatMissingEpisodes([1, 2, 3, 5, 8, 9])).toBe("e1-3, e5, e8-9");
  });

  it("handles single episode", () => {
    expect(formatMissingEpisodes([4])).toBe("e4");
  });

  it("handles empty array", () => {
    expect(formatMissingEpisodes([])).toBe("");
  });

  it("handles two consecutive episodes", () => {
    expect(formatMissingEpisodes([6, 7])).toBe("e6-7");
  });

  it("sorts unsorted input", () => {
    expect(formatMissingEpisodes([10, 3, 7])).toBe("e3, e7, e10");
  });
});
