import { describe, it, expect } from "vitest";
import { normalizeTitle, buildTitleKey, parseSlug, parseTitleFromH1 } from "../src/common/normalize";

describe("normalizeTitle", () => {
  it("lowercases text", () => {
    expect(normalizeTitle("The Great Adventure")).toBe("the great adventure");
  });

  it("converts hyphens to spaces", () => {
    expect(normalizeTitle("some-title-here")).toBe("some title here");
  });

  it("strips punctuation", () => {
    expect(normalizeTitle("Hello, World!")).toBe("hello world");
  });

  it("preserves numbers", () => {
    expect(normalizeTitle("Ocean's 11")).toBe("oceans 11");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeTitle("too   many    spaces")).toBe("too many spaces");
  });

  it("trims whitespace", () => {
    expect(normalizeTitle("  padded  ")).toBe("padded");
  });

  it("handles empty string", () => {
    expect(normalizeTitle("")).toBe("");
  });

  it("converts accented characters to ASCII equivalents", () => {
    expect(normalizeTitle("Amélie")).toBe("amelie");
  });

  it("handles multiple diacritics", () => {
    expect(normalizeTitle("Crème Brûlée")).toBe("creme brulee");
  });

  it("handles Nordic characters", () => {
    expect(normalizeTitle("Rökkurró")).toBe("rokkurro");
  });
});

describe("buildTitleKey", () => {
  it("returns normalized title without year", () => {
    expect(buildTitleKey("The Title")).toBe("the title");
  });

  it("appends year when provided", () => {
    expect(buildTitleKey("The Title", 2024)).toBe("the title|2024");
  });

  it("normalizes before building key", () => {
    expect(buildTitleKey("Some-Title!", 2020)).toBe("some title|2020");
  });
});

describe("parseSlug", () => {
  it("parses slug with trailing year", () => {
    expect(parseSlug("some-title-2024")).toEqual({ title: "some title", year: 2024 });
  });

  it("parses slug without year", () => {
    expect(parseSlug("some-title")).toEqual({ title: "some title", year: undefined });
  });

  it("ignores year below 1900", () => {
    expect(parseSlug("title-1800")).toEqual({ title: "title 1800", year: undefined });
  });

  it("ignores year above 2099", () => {
    expect(parseSlug("title-2100")).toEqual({ title: "title 2100", year: undefined });
  });

  it("accepts boundary year 1900", () => {
    expect(parseSlug("old-film-1900")).toEqual({ title: "old film", year: 1900 });
  });

  it("accepts boundary year 2099", () => {
    expect(parseSlug("future-film-2099")).toEqual({ title: "future film", year: 2099 });
  });

  it("handles single-word slug", () => {
    expect(parseSlug("standalone")).toEqual({ title: "standalone", year: undefined });
  });

  it("parses underscore-separated slug with year", () => {
    expect(parseSlug("the_housemaid_2025")).toEqual({ title: "the housemaid", year: 2025 });
  });

  it("parses underscore-separated slug without year", () => {
    expect(parseSlug("cross")).toEqual({ title: "cross", year: undefined });
  });

  it("parses mixed underscore slug", () => {
    expect(parseSlug("some_long_title")).toEqual({ title: "some long title", year: undefined });
  });
});

describe("parseTitleFromH1", () => {
  it("extracts title without year", () => {
    expect(parseTitleFromH1("The Great Adventure")).toEqual({
      title: "the great adventure",
      year: undefined,
    });
  });

  it("extracts title with year in parentheses", () => {
    expect(parseTitleFromH1("The Great Adventure (2024)")).toEqual({
      title: "the great adventure",
      year: 2024,
    });
  });

  it("ignores year outside valid range", () => {
    expect(parseTitleFromH1("Title (1800)")).toEqual({
      title: "title 1800",
      year: undefined,
    });
  });

  it("handles year with trailing whitespace", () => {
    expect(parseTitleFromH1("Title (2020)  ")).toEqual({
      title: "title",
      year: 2020,
    });
  });

  it("normalizes accented characters", () => {
    expect(parseTitleFromH1("Amélie (2001)")).toEqual({
      title: "amelie",
      year: 2001,
    });
  });

  it("handles title with parentheses that aren't years", () => {
    expect(parseTitleFromH1("Title (Extended Cut)")).toEqual({
      title: "title extended cut",
      year: undefined,
    });
  });
});
