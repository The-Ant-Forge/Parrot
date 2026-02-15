import { describe, it, expect } from "vitest";
import { extractExternalIds } from "../src/api/plex";

describe("extractExternalIds", () => {
  it("extracts TMDB ID from guid", () => {
    expect(extractExternalIds([{ id: "tmdb://550" }])).toEqual({ tmdbId: 550 });
  });

  it("extracts TVDB ID from guid", () => {
    expect(extractExternalIds([{ id: "tvdb://81189" }])).toEqual({ tvdbId: 81189 });
  });

  it("extracts IMDb ID from guid", () => {
    expect(extractExternalIds([{ id: "imdb://tt0137523" }])).toEqual({ imdbId: "tt0137523" });
  });

  it("extracts all IDs from multiple guids", () => {
    const guids = [
      { id: "tmdb://550" },
      { id: "imdb://tt0137523" },
      { id: "tvdb://81189" },
    ];
    expect(extractExternalIds(guids)).toEqual({
      tmdbId: 550,
      imdbId: "tt0137523",
      tvdbId: 81189,
    });
  });

  it("returns empty object for unrecognized guids", () => {
    expect(extractExternalIds([{ id: "local://abc" }])).toEqual({});
  });

  it("returns empty object for empty array", () => {
    expect(extractExternalIds([])).toEqual({});
  });

  it("handles guid with extra path segments", () => {
    expect(extractExternalIds([{ id: "tmdb://12345" }])).toEqual({ tmdbId: 12345 });
  });

  it("ignores malformed tmdb guid without number", () => {
    expect(extractExternalIds([{ id: "tmdb://abc" }])).toEqual({});
  });
});
