import { describe, it, expect } from "vitest";
import {
  extractTmdbFromUrl,
  extractImdbId,
  extractPsaFromUrl,
  extractNzbgeekMediaType,
  extractTraktMediaType,
  extractJustWatchMediaType,
  extractRtMediaType,
  extractMetacriticMediaType,
} from "../src/common/extractors";

describe("extractTmdbFromUrl", () => {
  it("extracts movie ID from standard TMDB movie URL", () => {
    expect(extractTmdbFromUrl("https://www.themoviedb.org/movie/550-some-title")).toEqual({
      mediaType: "movie",
      id: "550",
    });
  });

  it("extracts show ID from TMDB TV URL", () => {
    expect(extractTmdbFromUrl("https://www.themoviedb.org/tv/1399-some-show")).toEqual({
      mediaType: "show",
      id: "1399",
    });
  });

  it("handles TMDB URL with no slug suffix", () => {
    expect(extractTmdbFromUrl("https://www.themoviedb.org/movie/550")).toEqual({
      mediaType: "movie",
      id: "550",
    });
  });

  it("returns null for non-TMDB URL", () => {
    expect(extractTmdbFromUrl("https://example.com/movie/123")).toBeNull();
  });

  it("returns null for TMDB URL without numeric ID", () => {
    expect(extractTmdbFromUrl("https://www.themoviedb.org/movie/")).toBeNull();
  });

  it("returns null for TMDB person URL", () => {
    expect(extractTmdbFromUrl("https://www.themoviedb.org/person/287")).toBeNull();
  });
});

describe("extractImdbId", () => {
  it("extracts tt-prefixed ID from IMDb URL", () => {
    expect(extractImdbId("https://www.imdb.com/title/tt0137523/")).toBe("tt0137523");
  });

  it("handles IMDb URL with extra path segments", () => {
    expect(extractImdbId("https://www.imdb.com/title/tt0137523/reviews")).toBe("tt0137523");
  });

  it("returns null for non-IMDb URL", () => {
    expect(extractImdbId("https://example.com/title/tt0137523/")).toBeNull();
  });

  it("returns null for IMDb name/person URL", () => {
    expect(extractImdbId("https://www.imdb.com/name/nm0000093/")).toBeNull();
  });
});

describe("extractPsaFromUrl", () => {
  it("extracts movie slug", () => {
    expect(extractPsaFromUrl("https://psa.wf/movie/some-title-2024/")).toEqual({
      mediaType: "movie",
      slug: "some-title-2024",
    });
  });

  it("extracts TV show slug", () => {
    expect(extractPsaFromUrl("https://psa.wf/tv-show/another-show/")).toEqual({
      mediaType: "show",
      slug: "another-show",
    });
  });

  it("handles URL without trailing slash", () => {
    expect(extractPsaFromUrl("https://psa.wf/movie/the-title")).toEqual({
      mediaType: "movie",
      slug: "the-title",
    });
  });

  it("returns null for unmatched URL", () => {
    expect(extractPsaFromUrl("https://other.site/movie/something")).toBeNull();
  });

  it("returns null for PSA page URL", () => {
    expect(extractPsaFromUrl("https://psa.wf/about")).toBeNull();
  });
});

describe("extractNzbgeekMediaType", () => {
  it("returns movie for movieid param", () => {
    expect(extractNzbgeekMediaType("?movieid=550")).toBe("movie");
  });

  it("returns show for tvid param", () => {
    expect(extractNzbgeekMediaType("?tvid=1399")).toBe("show");
  });

  it("returns null when neither param present", () => {
    expect(extractNzbgeekMediaType("?q=search")).toBeNull();
  });

  it("returns null for empty search string", () => {
    expect(extractNzbgeekMediaType("")).toBeNull();
  });
});

describe("extractTraktMediaType", () => {
  it("returns movie for /movies/ path", () => {
    expect(extractTraktMediaType("/movies/some-film-2024")).toBe("movie");
  });

  it("returns show for /shows/ path", () => {
    expect(extractTraktMediaType("/shows/some-series")).toBe("show");
  });

  it("returns null for other paths", () => {
    expect(extractTraktMediaType("/people/someone")).toBeNull();
  });
});

describe("extractJustWatchMediaType", () => {
  it("returns movie for /movie/ path", () => {
    expect(extractJustWatchMediaType("/us/movie/some-film")).toBe("movie");
  });

  it("returns show for /tv-show/ path", () => {
    expect(extractJustWatchMediaType("/us/tv-show/some-series")).toBe("show");
  });

  it("returns show for /tv-series/ path", () => {
    expect(extractJustWatchMediaType("/uk/tv-series/some-series")).toBe("show");
  });

  it("returns null for other paths", () => {
    expect(extractJustWatchMediaType("/us/provider/netflix")).toBeNull();
  });
});

describe("extractRtMediaType", () => {
  it("returns movie for /m/ path", () => {
    expect(extractRtMediaType("/m/some_film")).toBe("movie");
  });

  it("returns show for /tv/ path", () => {
    expect(extractRtMediaType("/tv/some_series")).toBe("show");
  });

  it("returns null for other paths", () => {
    expect(extractRtMediaType("/celebrity/someone")).toBeNull();
  });
});

describe("extractMetacriticMediaType", () => {
  it("returns movie for /movie/ path", () => {
    expect(extractMetacriticMediaType("/movie/some-film-2026")).toBe("movie");
  });

  it("returns show for /tv/ path", () => {
    expect(extractMetacriticMediaType("/tv/some-series")).toBe("show");
  });

  it("returns null for other paths", () => {
    expect(extractMetacriticMediaType("/person/some-actor")).toBeNull();
  });
});
