import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger before importing radarr module
vi.mock("../src/common/logger", () => ({
  debugLog: vi.fn(),
  errorLog: vi.fn(),
}));

// Must re-import fresh for each test to reset circuit breaker state
let radarrModule: typeof import("../src/api/radarr");

beforeEach(async () => {
  vi.restoreAllMocks();
  // Mock browser.storage.local for proxy cache (returns empty = cache miss)
  vi.stubGlobal("browser", {
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } },
  });
  // Reset module to get fresh circuit breaker
  vi.resetModules();
  radarrModule = await import("../src/api/radarr");
});

function mockFetch(data: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  }));
}

function mockFetchError(error = "Network error") {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(error)));
}

describe("getRadarrMovie", () => {
  it("returns movie data on success", async () => {
    const movie = { TmdbId: 550, Title: "Test Movie", Year: 1999, MovieRatings: {} };
    mockFetch(movie);
    const result = await radarrModule.getRadarrMovie(550);
    expect(result).toEqual(movie);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.radarr.video/v1/movie/550",
      expect.anything(),
    );
  });

  it("returns null on HTTP error", async () => {
    mockFetch({}, 404);
    const result = await radarrModule.getRadarrMovie(999);
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetchError();
    const result = await radarrModule.getRadarrMovie(550);
    expect(result).toBeNull();
  });
});

describe("getRadarrMovieByImdb", () => {
  it("returns movie data for IMDb ID", async () => {
    const movie = { TmdbId: 550, ImdbId: "tt0137523", Title: "Test", Year: 1999 };
    mockFetch([movie]); // IMDb endpoint returns an array
    const result = await radarrModule.getRadarrMovieByImdb("tt0137523");
    expect(result).toEqual(movie);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.radarr.video/v1/movie/imdb/tt0137523",
      expect.anything(),
    );
  });

  it("encodes special characters in IMDb ID", async () => {
    mockFetch({});
    await radarrModule.getRadarrMovieByImdb("tt0137523&foo");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("tt0137523%26foo"),
      expect.anything(),
    );
  });
});

describe("getRadarrCollection", () => {
  it("returns collection data", async () => {
    const coll = { TmdbId: 10, Title: "Test Collection", Movies: [] };
    mockFetch(coll);
    const result = await radarrModule.getRadarrCollection(10);
    expect(result).toEqual(coll);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.radarr.video/v1/movie/collection/10",
      expect.anything(),
    );
  });
});

describe("searchRadarrMovie", () => {
  it("returns first result from search", async () => {
    const movies = [
      { TmdbId: 1, Title: "First", Year: 2020 },
      { TmdbId: 2, Title: "Second", Year: 2021 },
    ];
    mockFetch(movies);
    const result = await radarrModule.searchRadarrMovie("test");
    expect(result?.TmdbId).toBe(1);
  });

  it("includes year parameter when provided", async () => {
    mockFetch([{ TmdbId: 1, Title: "Test", Year: 2020 }]);
    await radarrModule.searchRadarrMovie("test", 2020);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("year=2020"),
      expect.anything(),
    );
  });

  it("returns null for empty results", async () => {
    mockFetch([]);
    const result = await radarrModule.searchRadarrMovie("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when fetch fails", async () => {
    mockFetchError();
    const result = await radarrModule.searchRadarrMovie("test");
    expect(result).toBeNull();
  });
});

describe("circuit breaker integration", () => {
  it("opens circuit after 3 consecutive failures", async () => {
    mockFetch({}, 500);
    await radarrModule.getRadarrMovie(1);
    await radarrModule.getRadarrMovie(2);
    await radarrModule.getRadarrMovie(3);

    // Circuit should now be open — fetch should not be called again
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await radarrModule.getRadarrMovie(4);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resets circuit on success", async () => {
    mockFetch({}, 500);
    await radarrModule.getRadarrMovie(1);
    await radarrModule.getRadarrMovie(2);

    // Success resets count
    mockFetch({ TmdbId: 3, Title: "Test", Year: 2020 });
    await radarrModule.getRadarrMovie(3);

    // One more failure should not trip
    mockFetch({}, 500);
    await radarrModule.getRadarrMovie(4);

    // fetch should still be called (circuit not open)
    expect(fetch).toHaveBeenCalled();
  });
});
