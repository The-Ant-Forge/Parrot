import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTvMazeExternals, lookupByImdb, lookupByTvdb } from "../src/api/tvmaze";

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(data: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  }));
}

describe("getTvMazeExternals", () => {
  it("returns TVDB and IMDb IDs from externals", async () => {
    mockFetch({ externals: { thetvdb: 12345, imdb: "tt0000001" } });
    const result = await getTvMazeExternals("100");
    expect(result).toEqual({ tvdbId: 12345, imdbId: "tt0000001" });
  });

  it("returns nulls when externals are missing", async () => {
    mockFetch({ externals: { thetvdb: null, imdb: null } });
    const result = await getTvMazeExternals("100");
    expect(result).toEqual({ tvdbId: null, imdbId: null });
  });

  it("calls correct URL", async () => {
    mockFetch({ externals: {} });
    await getTvMazeExternals("42");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.tvmaze.com/shows/42",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch({}, 500);
    await expect(getTvMazeExternals("100")).rejects.toThrow("TVMaze API error: 500");
  });
});

describe("lookupByImdb", () => {
  it("returns externals when show found", async () => {
    mockFetch({ externals: { thetvdb: 999, imdb: "tt0000002" } });
    const result = await lookupByImdb("tt0000002");
    expect(result).toEqual({ tvdbId: 999, imdbId: "tt0000002" });
  });

  it("returns null on 404", async () => {
    mockFetch({}, 404);
    const result = await lookupByImdb("tt9999999");
    expect(result).toBeNull();
  });

  it("throws on other errors", async () => {
    mockFetch({}, 500);
    await expect(lookupByImdb("tt0000001")).rejects.toThrow("TVMaze lookup error: 500");
  });

  it("encodes IMDb ID in URL", async () => {
    mockFetch({ externals: {} });
    await lookupByImdb("tt0000001");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("imdb=tt0000001"),
      expect.anything(),
    );
  });
});

describe("lookupByTvdb", () => {
  it("returns externals when show found", async () => {
    mockFetch({ externals: { thetvdb: 12345, imdb: "tt0000003" } });
    const result = await lookupByTvdb("12345");
    expect(result).toEqual({ tvdbId: 12345, imdbId: "tt0000003" });
  });

  it("returns null on 404", async () => {
    mockFetch({}, 404);
    const result = await lookupByTvdb("99999");
    expect(result).toBeNull();
  });

  it("uses thetvdb query param", async () => {
    mockFetch({ externals: {} });
    await lookupByTvdb("12345");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("thetvdb=12345"),
      expect.anything(),
    );
  });
});
