import { describe, it, expect } from "vitest";
import { normalizeTitle, buildTitleKey, parseSlug } from "../src/common/normalize";

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
