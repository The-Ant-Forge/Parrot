// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { scanLinksForExternalId } from "../src/common/extractors";

function addLink(href: string, parent: Element = document.body) {
  const a = document.createElement("a");
  a.href = href;
  parent.appendChild(a);
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("scanLinksForExternalId", () => {
  it("finds TMDB movie link", () => {
    addLink("https://www.themoviedb.org/movie/550-some-title");
    expect(scanLinksForExternalId()).toEqual({
      source: "tmdb",
      id: "550",
      mediaType: "movie",
    });
  });

  it("finds TMDB TV link", () => {
    addLink("https://www.themoviedb.org/tv/1399-some-show");
    expect(scanLinksForExternalId()).toEqual({
      source: "tmdb",
      id: "1399",
      mediaType: "show",
    });
  });

  it("finds IMDb link", () => {
    addLink("https://www.imdb.com/title/tt0137523/");
    expect(scanLinksForExternalId()).toEqual({
      source: "imdb",
      id: "tt0137523",
    });
  });

  it("finds TVDB series link", () => {
    addLink("https://thetvdb.com/series/12345/episodes");
    expect(scanLinksForExternalId()).toEqual({
      source: "tvdb",
      id: "12345",
      mediaType: "show",
    });
  });

  it("returns null when no matching links", () => {
    addLink("https://example.com/some-page");
    addLink("https://google.com");
    expect(scanLinksForExternalId()).toBeNull();
  });

  it("returns null when no links at all", () => {
    expect(scanLinksForExternalId()).toBeNull();
  });

  it("respects sources filter — tmdb+imdb only", () => {
    addLink("https://thetvdb.com/series/12345/episodes");
    addLink("https://www.imdb.com/title/tt9999999/");
    const result = scanLinksForExternalId({ sources: ["tmdb", "imdb"] });
    expect(result).toEqual({
      source: "imdb",
      id: "tt9999999",
    });
  });

  it("respects sources filter — skips tmdb when not included", () => {
    addLink("https://www.themoviedb.org/movie/550-some-title");
    const result = scanLinksForExternalId({ sources: ["imdb", "tvdb"] });
    expect(result).toBeNull();
  });

  it("prefers IMDb over TMDB when both present (authority order)", () => {
    addLink("https://www.themoviedb.org/movie/550-some-title");
    addLink("https://www.imdb.com/title/tt0137523/");
    expect(scanLinksForExternalId()).toEqual({
      source: "imdb",
      id: "tt0137523",
    });
  });

  it("prefers TVDB over TMDB when both present", () => {
    addLink("https://www.themoviedb.org/tv/1399-some-show");
    addLink("https://thetvdb.com/series/12345/episodes");
    expect(scanLinksForExternalId()).toEqual({
      source: "tvdb",
      id: "12345",
      mediaType: "show",
    });
  });

  it("prefers IMDb over TVDB when both present", () => {
    addLink("https://thetvdb.com/series/12345/episodes");
    addLink("https://www.imdb.com/title/tt0137523/");
    expect(scanLinksForExternalId()).toEqual({
      source: "imdb",
      id: "tt0137523",
    });
  });

  it("falls back to TMDB when it is the only source found", () => {
    addLink("https://www.themoviedb.org/movie/550-some-title");
    expect(scanLinksForExternalId()).toEqual({
      source: "tmdb",
      id: "550",
      mediaType: "movie",
    });
  });

  it("does not match TVDB slug URLs (non-numeric)", () => {
    addLink("https://thetvdb.com/series/some-show-name");
    expect(scanLinksForExternalId()).toBeNull();
  });

  it("finds old-style TVDB query parameter link", () => {
    addLink("http://www.thetvdb.com/?tab=series&id=121361");
    expect(scanLinksForExternalId()).toEqual({
      source: "tvdb",
      id: "121361",
      mediaType: "show",
    });
  });

  it("scopes scan to container — ignores links outside", () => {
    const container = document.createElement("div");
    container.id = "description";
    document.body.appendChild(container);
    // IMDb inside container, TMDB outside
    addLink("https://www.themoviedb.org/movie/8193-wrong-title");
    addLink("https://www.imdb.com/title/tt0374900/", container);
    expect(scanLinksForExternalId({ container })).toEqual({
      source: "imdb",
      id: "tt0374900",
    });
  });

  it("scoped container returns null when no links inside it", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    addLink("https://www.imdb.com/title/tt0137523/");
    expect(scanLinksForExternalId({ container })).toBeNull();
  });
});
