import { describe, it, expect } from "vitest";
import {
  extractTmdbFromUrl,
  extractImdbId,
  extractTvmazeFromUrl,
  extractPsaFromUrl,
  extractNzbgeekMediaType,
  extractTraktMediaType,
  extractJustWatchMediaType,
  extractRtMediaType,
  extractMetacriticMediaType,
  extractIplayerFromUrl,
  parseKickassSlug,
  findImdbIdInText,
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

describe("extractTvmazeFromUrl", () => {
  it("extracts numeric show ID from TVMaze URL", () => {
    expect(extractTvmazeFromUrl("https://www.tvmaze.com/shows/61740/will-trent")).toEqual({
      id: "61740",
    });
  });

  it("handles URL without slug suffix", () => {
    expect(extractTvmazeFromUrl("https://www.tvmaze.com/shows/61740")).toEqual({
      id: "61740",
    });
  });

  it("handles URL without www subdomain", () => {
    expect(extractTvmazeFromUrl("https://tvmaze.com/shows/1/the-show")).toEqual({
      id: "1",
    });
  });

  it("returns null for non-show TVMaze pages", () => {
    expect(extractTvmazeFromUrl("https://www.tvmaze.com/episodes/12345")).toBeNull();
  });

  it("returns null for non-TVMaze URLs", () => {
    expect(extractTvmazeFromUrl("https://example.com/shows/61740")).toBeNull();
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

describe("extractIplayerFromUrl", () => {
  it("extracts movie (singular /episode/) with slug", () => {
    expect(extractIplayerFromUrl("https://www.bbc.co.uk/iplayer/episode/p0abc123/some-film")).toEqual({
      mediaType: "movie",
      slug: "some-film",
    });
  });

  it("extracts show (plural /episodes/) with slug", () => {
    expect(extractIplayerFromUrl("https://www.bbc.co.uk/iplayer/episodes/p0xyz789/some-series")).toEqual({
      mediaType: "show",
      slug: "some-series",
    });
  });

  it("returns null for non-iPlayer URL", () => {
    expect(extractIplayerFromUrl("https://example.com/iplayer/episode/p0abc123/slug")).toBeNull();
  });

  it("returns null for iPlayer URL without slug", () => {
    expect(extractIplayerFromUrl("https://www.bbc.co.uk/iplayer/episode/p0abc123")).toBeNull();
  });

  it("returns null for other BBC pages", () => {
    expect(extractIplayerFromUrl("https://www.bbc.co.uk/iplayer/categories")).toBeNull();
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

describe("parseKickassSlug", () => {
  it("parses a movie slug: title + year, ambiguous media type", () => {
    expect(parseKickassSlug("/the-specialist-1994-1080p-bluray-hevc-x265-5-1-bone-t6685416.html")).toEqual({
      title: "the specialist",
      year: 1994,
      mediaType: undefined,
    });
  });

  it("parses a show slug via the season marker", () => {
    expect(parseKickassSlug("/ms-x-2026-s01-1080p-web-dl-hevc-x265-5-1-bone-t6685457.html")).toEqual({
      title: "ms x",
      year: 2026,
      mediaType: "show",
    });
  });

  it("parses a multi-season range slug (first marker wins)", () => {
    expect(parseKickassSlug("/hitmen-2020-s01-s02-1080p-web-dl-hevc-x265-5-1-bone-t6685999.html")).toEqual({
      title: "hitmen",
      year: 2020,
      mediaType: "show",
    });
  });

  it("parses an sXXeXX marker", () => {
    expect(parseKickassSlug("/harbor-of-glass-s02e05-720p-hdtv-x264-t1.html")).toEqual({
      title: "harbor of glass",
      year: undefined,
      mediaType: "show",
    });
  });

  it("keeps edition noise after the year out of the title", () => {
    expect(parseKickassSlug("/transporter-2-2005-uncut-upscaled-bluray-2160p-hdr10-hevc-truehd-5-1-x265-e-t6685539.html")).toEqual({
      title: "transporter 2",
      year: 2005,
      mediaType: undefined,
    });
  });

  it("picks the last plausible year for numeric titles", () => {
    expect(parseKickassSlug("/2001-a-space-odyssey-1968-2160p-bluray-x265-t2.html")).toEqual({
      title: "2001 a space odyssey",
      year: 1968,
      mediaType: undefined,
    });
  });

  it("ignores implausible future-year tokens in the title", () => {
    expect(parseKickassSlug("/blade-runner-2049-2017-1080p-bluray-t3.html")).toEqual({
      title: "blade runner 2049",
      year: 2017,
      mediaType: undefined,
    });
  });

  it("falls back to cutting at the first noise token when there is no year", () => {
    expect(parseKickassSlug("/the-quiet-cartographer-1080p-webrip-x265-t4.html")).toEqual({
      title: "the quiet cartographer",
      year: undefined,
      mediaType: undefined,
    });
  });

  it("uses the whole slug when there is no year and no noise token", () => {
    expect(parseKickassSlug("/lanterns-of-meridian-bay-t5.html")).toEqual({
      title: "lanterns of meridian bay",
      year: undefined,
      mediaType: undefined,
    });
  });

  it("returns null for non-torrent-detail paths", () => {
    expect(parseKickassSlug("/browse")).toBeNull();
    expect(parseKickassSlug("/the-specialist-1994.html")).toBeNull();
    expect(parseKickassSlug("/community/thread-t123")).toBeNull();
  });
});

describe("findImdbIdInText", () => {
  it("finds an unlinked IMDb URL in text", () => {
    const text = "HEVC, Main 10@High\n\nhttps://www.imdb.com/title/tt0388482/\n\nscreens below";
    expect(findImdbIdInText(text)).toBe("tt0388482");
  });

  it("returns the first of several ids", () => {
    const text = "see imdb.com/title/tt0000001/ and imdb.com/title/tt0000002/";
    expect(findImdbIdInText(text)).toBe("tt0000001");
  });

  it("returns null when no IMDb URL is present", () => {
    expect(findImdbIdInText("Format: Matroska at 24.9 Mb/s tt is not an id")).toBeNull();
  });
});
