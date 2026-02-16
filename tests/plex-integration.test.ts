import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildLibraryIndex } from "../src/api/plex";
import type { PlexServerConfig } from "../src/common/types";

const server: PlexServerConfig = {
  id: "server-1",
  name: "Test Server",
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

    const index = await buildLibraryIndex([server]);

    // Item count
    expect(index.itemCount).toBe(3);
    expect(index.lastRefresh).toBeGreaterThan(0);

    // Movie lookups (two-step: map → index → items[])
    const cosmicIdx = index.movies.byTmdbId["550"];
    expect(cosmicIdx).toBeDefined();
    expect(index.items[cosmicIdx].title).toBe("Cosmic Drift");
    expect(index.items[cosmicIdx].plexKeys["server-1"]).toBe("101");

    expect(index.movies.byImdbId["tt0000550"]).toBeDefined();
    expect(index.movies.byImdbId["tt0000550"]).toBe(cosmicIdx);

    const nebulaIdx = index.movies.byTmdbId["999"];
    expect(nebulaIdx).toBeDefined();
    expect(index.items[nebulaIdx].title).toBe("Nebula Spark");

    // Show lookups
    const showIdx = index.shows.byTvdbId["81189"];
    expect(showIdx).toBeDefined();
    expect(index.items[showIdx].title).toBe("Starbound Chronicles");
    expect(index.items[showIdx].plexKeys["server-1"]).toBe("201");

    // All IDs point to the same item index
    expect(index.shows.byTmdbId["1234"]).toBe(showIdx);
    expect(index.shows.byImdbId["tt1111111"]).toBe(showIdx);
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

    const index = await buildLibraryIndex([server]);
    const idx = index.movies.byTmdbId["777"];
    const item = index.items[idx];

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

    const index = await buildLibraryIndex([server]);

    // Should have both a precise key (with year) and a fallback key (without)
    const idx = index.movies.byTitle["solar flare|2021"];
    expect(idx).toBeDefined();
    expect(index.movies.byTitle["solar flare"]).toBeDefined();
    expect(index.items[idx].plexKeys["server-1"]).toBe("400");
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

    const index = await buildLibraryIndex([server]);

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

    const index = await buildLibraryIndex([server]);

    expect(index.itemCount).toBe(1);
    // No TMDB/IMDb/TVDB entries (no GUIDs), but title-based lookup should work
    expect(Object.keys(index.movies.byTmdbId).length).toBe(0);
    const idx = index.movies.byTitle["mystery void|2023"];
    expect(idx).toBeDefined();
    expect(index.items[idx].plexKeys["server-1"]).toBe("600");
  });

  it("returns empty index for empty library", async () => {
    mockFetch
      .mockResolvedValueOnce(sectionsResponse([]));

    const index = await buildLibraryIndex([server]);

    expect(index.itemCount).toBe(0);
    expect(index.items.length).toBe(0);
    expect(Object.keys(index.movies.byTmdbId).length).toBe(0);
    expect(Object.keys(index.shows.byTvdbId).length).toBe(0);
  });

  it("merges items across multiple servers by shared ID", async () => {
    const server2: PlexServerConfig = {
      id: "server-2",
      name: "Remote NAS",
      serverUrl: "http://10.0.0.5:32400",
      token: "token-2",
    };

    mockFetch
      // Server 1: sections
      .mockResolvedValueOnce(
        sectionsResponse([{ key: "1", title: "Films", type: "movie" }]),
      )
      // Server 1: movies
      .mockResolvedValueOnce(
        plexResponse([
          {
            title: "Cosmic Drift",
            year: 2023,
            ratingKey: "101",
            Guid: [{ id: "tmdb://550" }],
          },
        ]),
      )
      // Server 2: sections
      .mockResolvedValueOnce(
        sectionsResponse([{ key: "1", title: "Movies", type: "movie" }]),
      )
      // Server 2: movies (same TMDB ID = same movie)
      .mockResolvedValueOnce(
        plexResponse([
          {
            title: "Cosmic Drift",
            year: 2023,
            ratingKey: "555",
            Guid: [{ id: "tmdb://550" }, { id: "imdb://tt0000550" }],
          },
        ]),
      );

    const index = await buildLibraryIndex([server, server2]);

    // Should be 1 item, not 2
    expect(index.itemCount).toBe(1);
    expect(index.items.length).toBe(1);

    // Both server plexKeys on the same item
    const idx = index.movies.byTmdbId["550"];
    const item = index.items[idx];
    expect(item.plexKeys["server-1"]).toBe("101");
    expect(item.plexKeys["server-2"]).toBe("555");

    // Enriched with imdbId from server 2
    expect(item.imdbId).toBe("tt0000550");
    expect(index.movies.byImdbId["tt0000550"]).toBe(idx);
  });

  it("keeps items separate when IDs differ", async () => {
    const server2: PlexServerConfig = {
      id: "server-2",
      name: "Remote NAS",
      serverUrl: "http://10.0.0.5:32400",
      token: "token-2",
    };

    mockFetch
      // Server 1
      .mockResolvedValueOnce(
        sectionsResponse([{ key: "1", title: "Films", type: "movie" }]),
      )
      .mockResolvedValueOnce(
        plexResponse([
          {
            title: "Cosmic Drift",
            year: 2023,
            ratingKey: "101",
            Guid: [{ id: "tmdb://550" }],
          },
        ]),
      )
      // Server 2
      .mockResolvedValueOnce(
        sectionsResponse([{ key: "1", title: "Movies", type: "movie" }]),
      )
      .mockResolvedValueOnce(
        plexResponse([
          {
            title: "Nebula Spark",
            year: 2020,
            ratingKey: "201",
            Guid: [{ id: "tmdb://999" }],
          },
        ]),
      );

    const index = await buildLibraryIndex([server, server2]);

    expect(index.itemCount).toBe(2);
    expect(index.items.length).toBe(2);
    expect(index.movies.byTmdbId["550"]).not.toBe(index.movies.byTmdbId["999"]);
  });

  it("returns empty index when no servers provided", async () => {
    const index = await buildLibraryIndex([]);

    expect(index.itemCount).toBe(0);
    expect(index.items.length).toBe(0);
  });
});
