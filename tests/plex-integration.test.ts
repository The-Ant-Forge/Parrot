import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildLibraryIndex } from "../src/api/plex";
import type { PlexConfig } from "../src/common/types";

const config: PlexConfig = {
  serverUrl: "http://192.168.1.100:32400",
  token: "test-token",
};

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function plexResponse(metadata: unknown[]) {
  return {
    ok: true,
    json: async () => ({ MediaContainer: { Metadata: metadata } }),
  };
}

function sectionsResponse(directories: unknown[]) {
  return {
    ok: true,
    json: async () => ({ MediaContainer: { Directory: directories } }),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("buildLibraryIndex", () => {
  it("builds index with mixed movies and shows", async () => {
    mockFetch
      // /library/sections
      .mockResolvedValueOnce(
        sectionsResponse([
          { key: "1", title: "Films", type: "movie" },
          { key: "2", title: "TV", type: "show" },
        ]),
      )
      // /library/sections/1/all (movies)
      .mockResolvedValueOnce(
        plexResponse([
          {
            title: "Cosmic Drift",
            year: 2023,
            ratingKey: "101",
            Guid: [{ id: "tmdb://550" }, { id: "imdb://tt0000550" }],
          },
          {
            title: "Nebula Spark",
            year: 2020,
            ratingKey: "102",
            Guid: [{ id: "tmdb://999" }],
          },
        ]),
      )
      // /library/sections/2/all (shows)
      .mockResolvedValueOnce(
        plexResponse([
          {
            title: "Starbound Chronicles",
            year: 2019,
            ratingKey: "201",
            Guid: [
              { id: "tvdb://81189" },
              { id: "tmdb://1234" },
              { id: "imdb://tt1111111" },
            ],
          },
        ]),
      );

    const index = await buildLibraryIndex(config);

    // Item count
    expect(index.itemCount).toBe(3);
    expect(index.lastRefresh).toBeGreaterThan(0);

    // Movie lookups
    expect(index.movies.byTmdbId["550"]).toBeDefined();
    expect(index.movies.byTmdbId["550"].title).toBe("Cosmic Drift");
    expect(index.movies.byTmdbId["550"].plexKey).toBe("101");
    expect(index.movies.byImdbId["tt0000550"]).toBeDefined();
    expect(index.movies.byTmdbId["999"]).toBeDefined();
    expect(index.movies.byTmdbId["999"].title).toBe("Nebula Spark");

    // Show lookups
    expect(index.shows.byTvdbId["81189"]).toBeDefined();
    expect(index.shows.byTvdbId["81189"].title).toBe("Starbound Chronicles");
    expect(index.shows.byTmdbId["1234"]).toBeDefined();
    expect(index.shows.byImdbId["tt1111111"]).toBeDefined();
    // All point to the same item
    expect(index.shows.byTvdbId["81189"].plexKey).toBe("201");
    expect(index.shows.byTmdbId["1234"].plexKey).toBe("201");
    expect(index.shows.byImdbId["tt1111111"].plexKey).toBe("201");
  });

  it("enriches OwnedItem with external IDs", async () => {
    mockFetch
      .mockResolvedValueOnce(
        sectionsResponse([{ key: "1", title: "Films", type: "movie" }]),
      )
      .mockResolvedValueOnce(
        plexResponse([
          {
            title: "Quantum Echo",
            year: 2022,
            ratingKey: "300",
            Guid: [
              { id: "tmdb://777" },
              { id: "imdb://tt7777777" },
              { id: "tvdb://55555" },
            ],
          },
        ]),
      );

    const index = await buildLibraryIndex(config);
    const item = index.movies.byTmdbId["777"];

    expect(item).toBeDefined();
    expect(item.tmdbId).toBe(777);
    expect(item.imdbId).toBe("tt7777777");
    expect(item.tvdbId).toBe(55555);
    expect(item.title).toBe("Quantum Echo");
    expect(item.year).toBe(2022);
  });

  it("builds title-based lookup maps", async () => {
    mockFetch
      .mockResolvedValueOnce(
        sectionsResponse([{ key: "1", title: "Films", type: "movie" }]),
      )
      .mockResolvedValueOnce(
        plexResponse([
          {
            title: "Solar Flare",
            year: 2021,
            ratingKey: "400",
            Guid: [{ id: "tmdb://111" }],
          },
        ]),
      );

    const index = await buildLibraryIndex(config);

    // Should have both a precise key (with year) and a fallback key (without)
    expect(index.movies.byTitle["solar flare|2021"]).toBeDefined();
    expect(index.movies.byTitle["solar flare"]).toBeDefined();
    expect(index.movies.byTitle["solar flare|2021"].plexKey).toBe("400");
  });

  it("filters non-movie/show library sections", async () => {
    mockFetch
      .mockResolvedValueOnce(
        sectionsResponse([
          { key: "1", title: "Films", type: "movie" },
          { key: "2", title: "Music", type: "artist" },
          { key: "3", title: "Photos", type: "photo" },
        ]),
      )
      // Only the movie section should be fetched
      .mockResolvedValueOnce(
        plexResponse([
          {
            title: "Aurora Prime",
            year: 2024,
            ratingKey: "500",
            Guid: [{ id: "tmdb://222" }],
          },
        ]),
      );

    const index = await buildLibraryIndex(config);

    expect(index.itemCount).toBe(1);
    // fetch called: sections + 1 movie section (music/photo filtered out)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("handles items with no guids", async () => {
    mockFetch
      .mockResolvedValueOnce(
        sectionsResponse([{ key: "1", title: "Films", type: "movie" }]),
      )
      .mockResolvedValueOnce(
        plexResponse([
          {
            title: "Mystery Void",
            year: 2023,
            ratingKey: "600",
            // No Guid array
          },
        ]),
      );

    const index = await buildLibraryIndex(config);

    expect(index.itemCount).toBe(1);
    // No TMDB/IMDb/TVDB entries (no GUIDs), but title-based lookup should work
    expect(Object.keys(index.movies.byTmdbId).length).toBe(0);
    expect(index.movies.byTitle["mystery void|2023"]).toBeDefined();
    expect(index.movies.byTitle["mystery void|2023"].plexKey).toBe("600");
  });

  it("returns empty index for empty library", async () => {
    mockFetch
      .mockResolvedValueOnce(sectionsResponse([]))

    const index = await buildLibraryIndex(config);

    expect(index.itemCount).toBe(0);
    expect(Object.keys(index.movies.byTmdbId).length).toBe(0);
    expect(Object.keys(index.shows.byTvdbId).length).toBe(0);
  });
});
