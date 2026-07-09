import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleCheck, lookupWithCrossRefs } from "../src/entrypoints/bg/check";
import { getTvMazeExternals, lookupByImdb, lookupByTvdb } from "../src/api/tvmaze";
import { getRadarrMovieByImdb } from "../src/api/radarr";
import { findByImdbId, findByTvdbId } from "../src/api/tmdb";
import { DEFAULT_OPTIONS, type LibraryIndex, type Message, type PlexServerConfig } from "../src/common/types";

vi.mock("../src/api/tvmaze", () => ({
  getTvMazeExternals: vi.fn(),
  lookupByImdb: vi.fn(),
  lookupByTvdb: vi.fn(),
}));
vi.mock("../src/api/radarr", () => ({
  getRadarrMovieByImdb: vi.fn(),
}));
vi.mock("../src/api/tmdb", () => ({
  findByImdbId: vi.fn(),
  findByTvdbId: vi.fn(),
}));

const servers: PlexServerConfig[] = [
  { id: "s1", name: "Primary", serverUrl: "http://plex.local:32400", token: "t" },
];

const index: LibraryIndex = {
  itemCount: 2,
  movieCount: 1,
  showCount: 1,
  lastRefresh: Date.now(),
  items: [
    { title: "The Copper Meridian", year: 2018, plexKeys: { s1: "10" }, tmdbId: 100, imdbId: "tt0000100", resolution: "1080" },
    { title: "Harbor of Glass", year: 2020, plexKeys: { s1: "11" }, tvdbId: 555, tmdbId: 200, imdbId: "tt0000200" },
  ],
  movies: {
    byTmdbId: { "100": 0 },
    byImdbId: { "tt0000100": 0 },
    byTitle: { "the copper meridian|2018": 0, "the copper meridian": 0 },
  },
  shows: {
    byTvdbId: { "555": 1 },
    byTmdbId: { "200": 1 },
    byImdbId: { "tt0000200": 1 },
    byTitle: { "harbor of glass|2020": 1, "harbor of glass": 1 },
  },
};

const options = { ...DEFAULT_OPTIONS, tmdbApiKey: "tmdb-key" };

function check(mediaType: "movie" | "show", source: "tmdb" | "imdb" | "tvdb" | "title" | "tvmaze", id: string) {
  const message: Extract<Message, { type: "CHECK" }> = { type: "CHECK", mediaType, source, id };
  return handleCheck(message, index, options, servers);
}

beforeEach(() => {
  vi.mocked(getTvMazeExternals).mockReset();
  vi.mocked(lookupByImdb).mockReset().mockResolvedValue(null);
  vi.mocked(lookupByTvdb).mockReset().mockResolvedValue(null);
  vi.mocked(getRadarrMovieByImdb).mockReset().mockResolvedValue(null);
  vi.mocked(findByImdbId).mockReset().mockResolvedValue(null);
  vi.mocked(findByTvdbId).mockReset().mockResolvedValue(null);
});

describe("handleCheck — direct lookups", () => {
  it("finds a movie by TMDB id with Plex link, server name and resolution", async () => {
    const result = await check("movie", "tmdb", "100");
    expect(result.owned).toBe(true);
    expect(result.item?.title).toBe("The Copper Meridian");
    expect(result.plexServerName).toBe("Primary");
    expect(result.plexUrl).toContain("key=%2Flibrary%2Fmetadata%2F10");
    expect(result.resolution).toBe("1080p");
    expect(result.resolvedMediaType).toBeUndefined();
  });

  it("returns not-owned on a TMDB miss without calling any cross-ref", async () => {
    const result = await check("movie", "tmdb", "999999");
    expect(result).toEqual({ owned: false });
    expect(lookupByImdb).not.toHaveBeenCalled();
    expect(getRadarrMovieByImdb).not.toHaveBeenCalled();
    expect(findByImdbId).not.toHaveBeenCalled();
  });

  it("returns not-owned on a title miss without cross-refs", async () => {
    const result = await check("show", "title", "unknown show|1999");
    expect(result).toEqual({ owned: false });
    expect(findByImdbId).not.toHaveBeenCalled();
  });
});

describe("handleCheck — cross-references", () => {
  it("resolves a show IMDb miss via the TVMaze bridge (IMDb → TVDB)", async () => {
    vi.mocked(lookupByImdb).mockResolvedValue({ tvdbId: 555, imdbId: "tt7777777" });
    const result = await check("show", "imdb", "tt7777777");
    expect(result.owned).toBe(true);
    expect(result.item?.title).toBe("Harbor of Glass");
    expect(lookupByImdb).toHaveBeenCalledWith("tt7777777");
  });

  it("resolves a movie IMDb miss via the Radarr proxy (IMDb → TMDB)", async () => {
    vi.mocked(getRadarrMovieByImdb).mockResolvedValue({ TmdbId: 100, Title: "The Copper Meridian", Year: 2018 });
    const result = await check("movie", "imdb", "tt5555555");
    expect(result.owned).toBe(true);
    expect(result.item?.title).toBe("The Copper Meridian");
  });

  it("skips the Radarr cross-ref when community proxies are disabled", async () => {
    const message: Extract<Message, { type: "CHECK" }> = { type: "CHECK", mediaType: "movie", source: "imdb", id: "tt5555555" };
    await handleCheck(message, index, { ...options, useCommunityProxies: false }, servers);
    expect(getRadarrMovieByImdb).not.toHaveBeenCalled();
  });

  it("falls back to the TMDB API, constrained to the requested media type", async () => {
    vi.mocked(findByImdbId).mockResolvedValue(100);
    const result = await check("movie", "imdb", "tt5555555");
    expect(result.owned).toBe(true);
    expect(findByImdbId).toHaveBeenCalledWith("tmdb-key", "tt5555555", "movie");
  });

  it("skips the TMDB fallback without an API key", async () => {
    const message: Extract<Message, { type: "CHECK" }> = { type: "CHECK", mediaType: "show", source: "tvdb", id: "999" };
    const result = await handleCheck(message, index, { ...options, tmdbApiKey: "" }, servers);
    expect(result).toEqual({ owned: false });
    expect(findByTvdbId).not.toHaveBeenCalled();
  });

  it("survives a cross-ref throwing and tries the next one", async () => {
    vi.mocked(lookupByImdb).mockRejectedValue(new Error("TVMaze down"));
    vi.mocked(findByImdbId).mockResolvedValue(200);
    const result = await check("show", "imdb", "tt7777777");
    expect(result.owned).toBe(true);
    expect(result.item?.title).toBe("Harbor of Glass");
  });
});

describe("handleCheck — IMDb dual lookup", () => {
  it("retries a movie IMDb miss as a show and reports resolvedMediaType", async () => {
    const result = await check("movie", "imdb", "tt0000200"); // owned as a show
    expect(result.owned).toBe(true);
    expect(result.item?.title).toBe("Harbor of Glass");
    expect(result.resolvedMediaType).toBe("show");
  });

  it("does not set resolvedMediaType when the requested type matches", async () => {
    const result = await check("movie", "imdb", "tt0000100");
    expect(result.owned).toBe(true);
    expect(result.resolvedMediaType).toBeUndefined();
  });
});

describe("handleCheck — TVMaze source", () => {
  it("resolves via TVMaze externals to a TVDB match", async () => {
    vi.mocked(getTvMazeExternals).mockResolvedValue({ tvdbId: 555, imdbId: null });
    const result = await check("show", "tvmaze", "42");
    expect(result.owned).toBe(true);
    expect(result.item?.title).toBe("Harbor of Glass");
  });

  it("falls through externals → IMDb map → TMDB find", async () => {
    vi.mocked(getTvMazeExternals).mockResolvedValue({ tvdbId: null, imdbId: "tt7777777" });
    vi.mocked(findByImdbId).mockResolvedValue(200);
    const result = await check("show", "tvmaze", "42");
    expect(result.owned).toBe(true);
    expect(findByImdbId).toHaveBeenCalledWith("tmdb-key", "tt7777777", "show");
  });

  it("returns not-owned when the TVMaze API fails", async () => {
    vi.mocked(getTvMazeExternals).mockRejectedValue(new Error("down"));
    const result = await check("show", "tvmaze", "42");
    expect(result).toEqual({ owned: false });
  });
});

describe("handleCheck — title alt key and ambiguous type (server-side retries)", () => {
  function titleCheck(extra: { mediaType?: "movie" | "show"; id: string; altId?: string; ambiguousType?: boolean }) {
    const message: Extract<Message, { type: "CHECK" }> = {
      type: "CHECK",
      mediaType: extra.mediaType ?? "movie",
      source: "title",
      id: extra.id,
      altId: extra.altId,
      ambiguousType: extra.ambiguousType,
    };
    return handleCheck(message, index, options, servers);
  }

  it("falls back to the alternate title key when the primary misses", async () => {
    const result = await titleCheck({ id: "the copper meridian movie|2018", altId: "the copper meridian|2018" });
    expect(result.owned).toBe(true);
    expect(result.item?.title).toBe("The Copper Meridian");
  });

  it("prefers the primary key over the alternate", async () => {
    const result = await titleCheck({ id: "the copper meridian", altId: "some other key" });
    expect(result.owned).toBe(true);
  });

  it("retries the opposite media type only when ambiguousType is set", async () => {
    const plain = await titleCheck({ mediaType: "movie", id: "harbor of glass|2020" });
    expect(plain).toEqual({ owned: false });

    const ambiguous = await titleCheck({ mediaType: "movie", id: "harbor of glass|2020", ambiguousType: true });
    expect(ambiguous.owned).toBe(true);
    expect(ambiguous.item?.title).toBe("Harbor of Glass");
    expect(ambiguous.resolvedMediaType).toBe("show");
  });

  it("combines the opposite type with the alternate key", async () => {
    const result = await titleCheck({
      mediaType: "movie",
      id: "harbor of glass tv|2020",
      altId: "harbor of glass|2020",
      ambiguousType: true,
    });
    expect(result.owned).toBe(true);
    expect(result.resolvedMediaType).toBe("show");
  });

  it("returns not-owned when both keys miss both types", async () => {
    const result = await titleCheck({ id: "unknown|2001", altId: "also unknown", ambiguousType: true });
    expect(result).toEqual({ owned: false });
  });
});

describe("lookupWithCrossRefs", () => {
  it("prefers the direct index hit over any cross-ref", async () => {
    const item = await lookupWithCrossRefs(index, options, "show", "tvdb", "555");
    expect(item?.title).toBe("Harbor of Glass");
    expect(lookupByTvdb).not.toHaveBeenCalled();
  });

  it("uses the TVDB → IMDb direction of the TVMaze bridge", async () => {
    vi.mocked(lookupByTvdb).mockResolvedValue({ tvdbId: 999, imdbId: "tt0000200" });
    const item = await lookupWithCrossRefs(index, options, "show", "tvdb", "999");
    expect(item?.title).toBe("Harbor of Glass");
    expect(lookupByTvdb).toHaveBeenCalledWith("999");
  });
});
