import { describe, it, expect, vi, beforeEach } from "vitest";
import { getImdbRating, validateOmdbKey } from "../src/api/omdb";

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

describe("getImdbRating", () => {
  it("returns rating as number when available", async () => {
    mockFetch({ Response: "True", imdbRating: "8.5" });
    expect(await getImdbRating("key", "tt0000001")).toBe(8.5);
  });

  it("returns null when Response is False", async () => {
    mockFetch({ Response: "False", Error: "Not found" });
    expect(await getImdbRating("key", "tt0000001")).toBeNull();
  });

  it("returns null when rating is N/A", async () => {
    mockFetch({ Response: "True", imdbRating: "N/A" });
    expect(await getImdbRating("key", "tt0000001")).toBeNull();
  });

  it("returns null when imdbRating is missing", async () => {
    mockFetch({ Response: "True" });
    expect(await getImdbRating("key", "tt0000001")).toBeNull();
  });

  it("returns null on non-ok response", async () => {
    mockFetch({}, 401);
    expect(await getImdbRating("key", "tt0000001")).toBeNull();
  });

  it("returns null for non-numeric rating", async () => {
    mockFetch({ Response: "True", imdbRating: "not-a-number" });
    expect(await getImdbRating("key", "tt0000001")).toBeNull();
  });

  it("encodes parameters in URL", async () => {
    mockFetch({ Response: "True", imdbRating: "7.0" });
    await getImdbRating("my&key", "tt0000001");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("apikey=my%26key"),
      expect.anything(),
    );
  });
});

describe("validateOmdbKey", () => {
  it("returns true for valid key", async () => {
    mockFetch({ Response: "True" });
    expect(await validateOmdbKey("valid-key")).toBe(true);
  });

  it("returns false for invalid key", async () => {
    mockFetch({ Response: "False", Error: "Invalid API key!" });
    expect(await validateOmdbKey("bad-key")).toBe(false);
  });

  it("returns false on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    expect(await validateOmdbKey("any-key")).toBe(false);
  });

  it("returns false on non-ok response", async () => {
    mockFetch({}, 500);
    expect(await validateOmdbKey("any-key")).toBe(false);
  });
});
