import { describe, it, expect } from "vitest";
import { isNewerVersion, pickZipAssetUrl } from "../src/entrypoints/bg/version";

describe("isNewerVersion", () => {
  it("returns true when latest major is higher", () => {
    expect(isNewerVersion("2.0.0", "1.0.0")).toBe(true);
  });

  it("returns true when latest minor is higher", () => {
    expect(isNewerVersion("1.2.0", "1.1.0")).toBe(true);
  });

  it("returns true when latest patch is higher", () => {
    expect(isNewerVersion("1.1.2", "1.1.1")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isNewerVersion("1.2.3", "1.2.3")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(false);
  });

  it("handles different segment counts", () => {
    expect(isNewerVersion("1.2", "1.1.9")).toBe(true);
    expect(isNewerVersion("1.0", "1.0.1")).toBe(false);
  });

  it("handles real Parrot version format (Major.A.B)", () => {
    expect(isNewerVersion("1.16.2", "1.16.1")).toBe(true);
    expect(isNewerVersion("1.17.0", "1.16.15")).toBe(true);
    expect(isNewerVersion("1.16.1", "1.16.1")).toBe(false);
  });
});

describe("pickZipAssetUrl", () => {
  it("returns undefined for missing assets", () => {
    expect(pickZipAssetUrl(undefined)).toBeUndefined();
  });

  it("returns undefined for empty list", () => {
    expect(pickZipAssetUrl([])).toBeUndefined();
  });

  it("prefers a Chrome-named zip when available", () => {
    const assets = [
      { name: "parrot-1.20.0-firefox.zip", browser_download_url: "https://example.com/firefox.zip", content_type: "application/zip" },
      { name: "parrot-1.20.0-chrome.zip", browser_download_url: "https://example.com/chrome.zip", content_type: "application/zip" },
    ];
    expect(pickZipAssetUrl(assets)).toBe("https://example.com/chrome.zip");
  });

  it("falls back to any zip when no Chrome zip exists", () => {
    const assets = [
      { name: "source.tar.gz", browser_download_url: "https://example.com/source.tar.gz", content_type: "application/gzip" },
      { name: "parrot-1.20.0.zip", browser_download_url: "https://example.com/parrot.zip", content_type: "application/zip" },
    ];
    expect(pickZipAssetUrl(assets)).toBe("https://example.com/parrot.zip");
  });

  it("returns undefined when no zip exists at all", () => {
    const assets = [
      { name: "source.tar.gz", browser_download_url: "https://example.com/source.tar.gz", content_type: "application/gzip" },
    ];
    expect(pickZipAssetUrl(assets)).toBeUndefined();
  });
});
