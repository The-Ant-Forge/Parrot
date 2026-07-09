import { describe, it, expect } from "vitest";
import { evaluateCollection, filterCollectionParts, type CollectionPart } from "../src/entrypoints/bg/collection";
import type { LibraryIndex, PlexServerConfig } from "../src/common/types";

const TODAY = "2026-07-09";

const servers: PlexServerConfig[] = [
  { id: "s1", name: "Primary", serverUrl: "http://plex.local:32400", token: "t" },
];

/** Index owning TMDB movie ids 100 and 101. */
const index: LibraryIndex = {
  itemCount: 2,
  movieCount: 2,
  showCount: 0,
  lastRefresh: Date.now(),
  items: [
    { title: "The Copper Meridian", year: 2018, plexKeys: { s1: "10" } },
    { title: "Harbor of Glass", year: 2020, plexKeys: { s1: "11" } },
  ],
  movies: {
    byTmdbId: { "100": 0, "101": 1 },
    byImdbId: {},
    byTitle: {},
  },
  shows: { byTvdbId: {}, byTmdbId: {}, byImdbId: {}, byTitle: {} },
};

function part(tmdbId: number, title: string, year?: number, releaseDate?: string): CollectionPart {
  return { tmdbId, title, year, releaseDate };
}

const trilogy = [
  part(100, "The Copper Meridian", 2018, "2018-05-01"),
  part(101, "Harbor of Glass", 2020, "2020-05-01"),
  part(102, "Lanterns at Dusk", 2023, "2023-05-01"),
];

const defaultOpts = { excludeFuture: true, minCollectionSize: 2, minOwned: 2 };

describe("filterCollectionParts", () => {
  it("keeps everything when excludeFuture is off", () => {
    const parts = [part(1, "A", 2030, "2030-01-01")];
    expect(filterCollectionParts(parts, { excludeFuture: false }, TODAY)).toHaveLength(1);
  });

  it("drops future releases by releaseDate, keeping released-today", () => {
    const parts = [
      part(1, "Past", undefined, "2026-07-08"),
      part(2, "Today", undefined, TODAY),
      part(3, "Future", undefined, "2026-07-10"),
    ];
    const kept = filterCollectionParts(parts, { excludeFuture: true }, TODAY);
    expect(kept.map((p) => p.title)).toEqual(["Past", "Today"]);
  });

  it("falls back to year when releaseDate is missing, and keeps undated parts", () => {
    const parts = [
      part(1, "Old", 2020),
      part(2, "NextYear", 2027),
      part(3, "Undated"),
    ];
    const kept = filterCollectionParts(parts, { excludeFuture: true }, TODAY);
    expect(kept.map((p) => p.title)).toEqual(["Old", "Undated"]);
  });
});

describe("evaluateCollection", () => {
  it("partitions owned and missing movies against the index", () => {
    const result = evaluateCollection("Meridian Saga", trilogy, index, servers, defaultOpts, TODAY);

    expect(result.hasCollection).toBe(true);
    expect(result.collection?.totalMovies).toBe(3);
    expect(result.collection?.ownedMovies.map((m) => m.title)).toEqual([
      "The Copper Meridian",
      "Harbor of Glass",
    ]);
    expect(result.collection?.missingMovies).toEqual([
      { title: "Lanterns at Dusk", releaseDate: "2023-05-01", tmdbId: 102 },
    ]);
  });

  it("resolves Plex deep links for owned movies", () => {
    const result = evaluateCollection("Meridian Saga", trilogy, index, servers, defaultOpts, TODAY);
    expect(result.collection?.ownedMovies[0].plexUrl).toContain("key=%2Flibrary%2Fmetadata%2F10");
  });

  it("rejects collections smaller than minCollectionSize after filtering", () => {
    const parts = [
      part(100, "The Copper Meridian", 2018, "2018-05-01"),
      part(103, "Future Sequel", 2027, "2027-05-01"),
    ];
    const result = evaluateCollection("Meridian Saga", parts, index, servers, defaultOpts, TODAY);
    expect(result).toEqual({ hasCollection: false });
  });

  it("rejects collections owning fewer than minOwned", () => {
    const result = evaluateCollection("Meridian Saga", trilogy, index, servers,
      { ...defaultOpts, minOwned: 3 }, TODAY);
    expect(result).toEqual({ hasCollection: false });
  });

  it("treats a null index as owning nothing", () => {
    const result = evaluateCollection("Meridian Saga", trilogy, null, servers,
      { ...defaultOpts, minOwned: 0 }, TODAY);
    expect(result.collection?.ownedMovies).toEqual([]);
    expect(result.collection?.missingMovies).toHaveLength(3);
  });
});
