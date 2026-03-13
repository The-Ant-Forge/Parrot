import { describe, it, expect } from "vitest";
import { applyRadarrRatings, applyRadarrMetadata, applySonarrMetadata, hasAnyRatings } from "../src/entrypoints/bg/metadata";
import type { RadarrMovie, RadarrMovieRatings } from "../src/api/radarr";
import type { SonarrShow } from "../src/api/sonarr";
import type { TabMediaInfo } from "../src/common/types";

function emptyInfo(): TabMediaInfo {
  return { mediaType: "movie", source: "tmdb", id: "550", owned: false };
}

describe("applyRadarrRatings", () => {
  it("extracts all rating sources", () => {
    const info = emptyInfo();
    const ratings: RadarrMovieRatings = {
      Tmdb: { Value: 8.4, Count: 1000, Type: "user" },
      Imdb: { Value: 8.8, Count: 2000, Type: "user" },
      RottenTomatoes: { Value: 79, Count: 300, Type: "critic" },
      Metacritic: { Value: 66, Count: 50, Type: "critic" },
      Trakt: { Value: 8.5, Count: 500, Type: "user" },
    };
    applyRadarrRatings(info, ratings);
    expect(info.tmdbRating).toBe(8.4);
    expect(info.imdbRating).toBe(8.8);
    expect(info.rtRating).toBe(79);
    expect(info.metacriticRating).toBe(66);
    expect(info.traktRating).toBe(8.5);
  });

  it("handles zero values correctly (not dropped)", () => {
    const info = emptyInfo();
    const ratings: RadarrMovieRatings = {
      Tmdb: { Value: 0, Count: 0, Type: "user" },
      Imdb: { Value: 0, Count: 0, Type: "user" },
    };
    applyRadarrRatings(info, ratings);
    expect(info.tmdbRating).toBe(0);
    expect(info.imdbRating).toBe(0);
  });

  it("skips undefined rating sources", () => {
    const info = emptyInfo();
    const ratings: RadarrMovieRatings = {
      Tmdb: { Value: 7.5, Count: 100, Type: "user" },
    };
    applyRadarrRatings(info, ratings);
    expect(info.tmdbRating).toBe(7.5);
    expect(info.imdbRating).toBeUndefined();
  });
});

describe("applyRadarrMetadata", () => {
  it("copies title, year, IDs, and poster", () => {
    const info = emptyInfo();
    const movie: RadarrMovie = {
      TmdbId: 550,
      ImdbId: "tt0137523",
      Title: "Test Movie",
      Year: 1999,
      Images: [
        { CoverType: "Poster", Url: "https://img.example.com/poster.jpg" },
        { CoverType: "Fanart", Url: "https://img.example.com/fanart.jpg" },
      ],
      MovieRatings: {
        Tmdb: { Value: 8.4, Count: 1000, Type: "user" },
      },
    };
    applyRadarrMetadata(info, movie);
    expect(info.title).toBe("Test Movie");
    expect(info.year).toBe(1999);
    expect(info.tmdbId).toBe(550);
    expect(info.imdbId).toBe("tt0137523");
    expect(info.posterUrl).toBe("https://img.example.com/poster.jpg");
    expect(info.tmdbRating).toBe(8.4);
  });

  it("does not overwrite existing IDs", () => {
    const info = emptyInfo();
    info.tmdbId = 999;
    info.imdbId = "tt9999";
    const movie: RadarrMovie = {
      TmdbId: 550,
      ImdbId: "tt0137523",
      Title: "Test Movie",
      Year: 1999,
    };
    applyRadarrMetadata(info, movie);
    expect(info.tmdbId).toBe(999); // kept original
    expect(info.imdbId).toBe("tt9999"); // kept original
  });
});

describe("applySonarrMetadata", () => {
  it("copies show metadata", () => {
    const info: TabMediaInfo = { mediaType: "show", source: "tvdb", id: "81189", owned: true };
    const show: SonarrShow = {
      tvdbId: 81189,
      title: "Test Show",
      status: "Ended",
      firstAired: "2008-01-20",
      seasons: [
        { seasonNumber: 0 },
        { seasonNumber: 1 },
        { seasonNumber: 2 },
      ],
      episodes: [
        { tvdbShowId: 81189, tvdbId: 1, seasonNumber: 1, episodeNumber: 1, title: "Pilot" },
        { tvdbShowId: 81189, tvdbId: 2, seasonNumber: 1, episodeNumber: 2, title: "Second" },
      ],
      imdbId: "tt0903747",
      tmdbId: 1396,
      rating: { count: 1000, value: "9.5" },
      images: [
        { coverType: "poster", url: "https://img.example.com/poster.jpg" },
      ],
    };
    applySonarrMetadata(info, show);
    expect(info.title).toBe("Test Show");
    expect(info.year).toBe(2008);
    expect(info.showStatus).toBe("Ended");
    expect(info.seasonCount).toBe(2); // excludes season 0
    expect(info.episodeCount).toBe(2);
    expect(info.imdbId).toBe("tt0903747");
    expect(info.tmdbId).toBe(1396);
    expect(info.tvdbId).toBe(81189);
    expect(info.posterUrl).toBe("https://img.example.com/poster.jpg");
    expect(info.tvdbRating).toBe(9.5);
  });
});

describe("hasAnyRatings", () => {
  it("returns false when no ratings", () => {
    expect(hasAnyRatings(emptyInfo())).toBe(false);
  });

  it("returns true for any single rating", () => {
    const info = emptyInfo();
    info.tmdbRating = 7.5;
    expect(hasAnyRatings(info)).toBe(true);
  });

  it("returns true for zero rating value", () => {
    const info = emptyInfo();
    info.imdbRating = 0;
    expect(hasAnyRatings(info)).toBe(true);
  });
});
