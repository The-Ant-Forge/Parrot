import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMovie, getCollection, getTvShow, getTvSeason, findByTvdbId, findByImdbId, searchMovie, searchTv } from "../src/api/tmdb";

const API_KEY = "test-key";

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

describe("getMovie", () => {
  it("fetches movie details and returns them", async () => {
    const movie = { id: 550, title: "Some Film", belongs_to_collection: null };
    mockFetch(movie);
    const result = await getMovie(API_KEY, 550);
    expect(result).toEqual(movie);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/movie/550"),
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("includes api_key in URL", async () => {
    mockFetch({ id: 1 });
    await getMovie(API_KEY, 1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("api_key=test-key"),
      expect.anything(),
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch({}, 404);
    await expect(getMovie(API_KEY, 999)).rejects.toThrow("TMDB API error: 404");
  });
});

describe("getCollection", () => {
  it("returns collection with id, name, and parts", async () => {
    mockFetch({ id: 10, name: "Some Saga", parts: [{ id: 1, title: "Part One" }] });
    const result = await getCollection(API_KEY, 10);
    expect(result).toEqual({ id: 10, name: "Some Saga", parts: [{ id: 1, title: "Part One" }] });
  });
});

describe("getTvShow", () => {
  it("appends external_ids to request", async () => {
    mockFetch({ id: 100, name: "A Show", seasons: [] });
    await getTvShow(API_KEY, 100);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("append_to_response=external_ids"),
      expect.anything(),
    );
  });
});

describe("getTvSeason", () => {
  it("fetches correct season path", async () => {
    mockFetch({ season_number: 2, episodes: [] });
    await getTvSeason(API_KEY, 100, 2);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/tv/100/season/2"),
      expect.anything(),
    );
  });
});

describe("findByTvdbId", () => {
  it("returns TMDB ID when TV result found", async () => {
    mockFetch({ movie_results: [], tv_results: [{ id: 42 }] });
    const result = await findByTvdbId(API_KEY, "12345");
    expect(result).toBe(42);
  });

  it("returns null when no results", async () => {
    mockFetch({ movie_results: [], tv_results: [] });
    const result = await findByTvdbId(API_KEY, "99999");
    expect(result).toBeNull();
  });

  it("uses tvdb_id external source", async () => {
    mockFetch({ movie_results: [], tv_results: [] });
    await findByTvdbId(API_KEY, "12345");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("external_source=tvdb_id"),
      expect.anything(),
    );
  });
});

describe("findByImdbId", () => {
  it("returns movie ID when mediaType is movie", async () => {
    mockFetch({ movie_results: [{ id: 10 }], tv_results: [{ id: 20 }] });
    expect(await findByImdbId(API_KEY, "tt0000001", "movie")).toBe(10);
  });

  it("returns TV ID when mediaType is show", async () => {
    mockFetch({ movie_results: [{ id: 10 }], tv_results: [{ id: 20 }] });
    expect(await findByImdbId(API_KEY, "tt0000001", "show")).toBe(20);
  });

  it("prefers movie when no mediaType specified", async () => {
    mockFetch({ movie_results: [{ id: 10 }], tv_results: [{ id: 20 }] });
    expect(await findByImdbId(API_KEY, "tt0000001")).toBe(10);
  });

  it("falls back to TV when no movie and no mediaType", async () => {
    mockFetch({ movie_results: [], tv_results: [{ id: 20 }] });
    expect(await findByImdbId(API_KEY, "tt0000001")).toBe(20);
  });

  it("returns null when no results", async () => {
    mockFetch({ movie_results: [], tv_results: [] });
    expect(await findByImdbId(API_KEY, "tt0000001")).toBeNull();
  });

  it("returns null for movie type with no movie results", async () => {
    mockFetch({ movie_results: [], tv_results: [{ id: 20 }] });
    expect(await findByImdbId(API_KEY, "tt0000001", "movie")).toBeNull();
  });
});

describe("searchMovie", () => {
  it("returns first result ID", async () => {
    mockFetch({ results: [{ id: 550 }, { id: 551 }] });
    expect(await searchMovie(API_KEY, "Some Film")).toBe(550);
  });

  it("returns null when no results", async () => {
    mockFetch({ results: [] });
    expect(await searchMovie(API_KEY, "Nonexistent")).toBeNull();
  });

  it("includes year param when provided", async () => {
    mockFetch({ results: [] });
    await searchMovie(API_KEY, "Some Film", 2024);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("year=2024"),
      expect.anything(),
    );
  });

  it("encodes query parameter", async () => {
    mockFetch({ results: [] });
    await searchMovie(API_KEY, "Film & More");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("query=Film%20%26%20More"),
      expect.anything(),
    );
  });
});

describe("searchTv", () => {
  it("returns first result ID", async () => {
    mockFetch({ results: [{ id: 100 }] });
    expect(await searchTv(API_KEY, "Some Show")).toBe(100);
  });

  it("returns null when no results", async () => {
    mockFetch({ results: [] });
    expect(await searchTv(API_KEY, "Nonexistent")).toBeNull();
  });

  it("uses first_air_date_year param", async () => {
    mockFetch({ results: [] });
    await searchTv(API_KEY, "Some Show", 2025);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("first_air_date_year=2025"),
      expect.anything(),
    );
  });
});
