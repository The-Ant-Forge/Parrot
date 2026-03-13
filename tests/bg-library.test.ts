import { describe, it, expect } from "vitest";
import { buildPlexUrl, resolveItemPlex, lookupItem } from "../src/entrypoints/bg/library";
import type { LibraryIndex, OwnedItem, PlexServerConfig } from "../src/common/types";

describe("buildPlexUrl", () => {
  it("generates correct Plex deep link", () => {
    const url = buildPlexUrl("abc123", "12345");
    expect(url).toBe(
      "https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F12345",
    );
  });
});

describe("resolveItemPlex", () => {
  const servers: PlexServerConfig[] = [
    { id: "s1", name: "Primary", serverUrl: "http://localhost:32400", token: "t1" },
    { id: "s2", name: "Secondary", serverUrl: "http://localhost:32401", token: "t2" },
  ];

  it("returns first matching server (priority order)", () => {
    const item: OwnedItem = {
      title: "Test Movie",
      year: 2020,
      plexKeys: { s1: "100", s2: "200" },
    };
    const result = resolveItemPlex(item, servers);
    expect(result?.serverName).toBe("Primary");
    expect(result?.url).toContain("s1");
  });

  it("falls back to second server if first has no key", () => {
    const item: OwnedItem = {
      title: "Test Movie",
      year: 2020,
      plexKeys: { s2: "200" },
    };
    const result = resolveItemPlex(item, servers);
    expect(result?.serverName).toBe("Secondary");
  });

  it("returns undefined if no server has the item", () => {
    const item: OwnedItem = {
      title: "Test Movie",
      year: 2020,
      plexKeys: { s3: "300" },
    };
    expect(resolveItemPlex(item, servers)).toBeUndefined();
  });
});

describe("lookupItem", () => {
  const index: LibraryIndex = {
    itemCount: 3,
    lastRefresh: Date.now(),
    items: [
      { title: "Movie A", year: 2020, plexKeys: { s1: "1" } },
      { title: "Show B", year: 2019, plexKeys: { s1: "2" }, tvdbId: 12345 },
      { title: "Movie C", year: 2021, plexKeys: { s1: "3" } },
    ],
    movies: {
      byTmdbId: { "550": 0, "551": 2 },
      byImdbId: { "tt0137523": 0 },
      byTitle: { "movie a|2020": 0, "movie a": 0, "movie c|2021": 2, "movie c": 2 },
    },
    shows: {
      byTvdbId: { "12345": 1 },
      byTmdbId: { "999": 1 },
      byImdbId: { "tt9999": 1 },
      byTitle: { "show b|2019": 1, "show b": 1 },
    },
  };

  it("looks up movie by TMDB ID", () => {
    const item = lookupItem(index, "movie", "tmdb", "550");
    expect(item?.title).toBe("Movie A");
  });

  it("looks up movie by IMDb ID", () => {
    const item = lookupItem(index, "movie", "imdb", "tt0137523");
    expect(item?.title).toBe("Movie A");
  });

  it("looks up show by TVDB ID", () => {
    const item = lookupItem(index, "show", "tvdb", "12345");
    expect(item?.title).toBe("Show B");
  });

  it("looks up show by TMDB ID", () => {
    const item = lookupItem(index, "show", "tmdb", "999");
    expect(item?.title).toBe("Show B");
  });

  it("looks up by title key with year", () => {
    const item = lookupItem(index, "movie", "title", "movie a|2020");
    expect(item?.title).toBe("Movie A");
  });

  it("widens title search from year-qualified to yearless", () => {
    // Year-qualified key "movie a|2025" doesn't exist, falls back to "movie a"
    const item = lookupItem(index, "movie", "title", "movie a|2025");
    expect(item?.title).toBe("Movie A");
  });

  it("returns undefined for missing items", () => {
    expect(lookupItem(index, "movie", "tmdb", "999999")).toBeUndefined();
    expect(lookupItem(index, "show", "tvdb", "00000")).toBeUndefined();
  });
});
