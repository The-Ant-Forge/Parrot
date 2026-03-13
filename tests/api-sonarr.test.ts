import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger before importing sonarr module
vi.mock("../src/common/logger", () => ({
  debugLog: vi.fn(),
  errorLog: vi.fn(),
}));

let sonarrModule: typeof import("../src/api/sonarr");

beforeEach(async () => {
  vi.restoreAllMocks();
  // Mock browser.storage.local for proxy cache (returns empty = cache miss)
  vi.stubGlobal("browser", {
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } },
  });
  vi.resetModules();
  sonarrModule = await import("../src/api/sonarr");
});

function mockFetch(data: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  }));
}

function mockFetchError(error = "Network error") {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(error)));
}

describe("getSonarrShow", () => {
  it("returns show data on success", async () => {
    const show = {
      tvdbId: 81189,
      title: "Test Show",
      status: "Ended",
      episodes: [
        { tvdbShowId: 81189, tvdbId: 1, seasonNumber: 1, episodeNumber: 1, title: "Pilot" },
      ],
    };
    mockFetch(show);
    const result = await sonarrModule.getSonarrShow(81189);
    expect(result).toEqual(show);
    expect(fetch).toHaveBeenCalledWith(
      "https://skyhook.sonarr.tv/v1/tvdb/shows/en/81189",
      expect.anything(),
    );
  });

  it("returns null on HTTP error", async () => {
    mockFetch({}, 404);
    const result = await sonarrModule.getSonarrShow(99999);
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetchError();
    const result = await sonarrModule.getSonarrShow(81189);
    expect(result).toBeNull();
  });
});

describe("searchSonarrShow", () => {
  it("returns array of shows on success", async () => {
    const shows = [
      { tvdbId: 81189, title: "Test Show", status: "Ended", episodes: [] },
      { tvdbId: 81190, title: "Other Show", status: "Continuing", episodes: [] },
    ];
    mockFetch(shows);
    const result = await sonarrModule.searchSonarrShow("test");
    expect(result).toHaveLength(2);
    expect(result?.[0].tvdbId).toBe(81189);
  });

  it("encodes search query", async () => {
    mockFetch([]);
    await sonarrModule.searchSonarrShow("test show & more");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("term=test%20show%20%26%20more"),
      expect.anything(),
    );
  });

  it("returns null on fetch error", async () => {
    mockFetchError();
    const result = await sonarrModule.searchSonarrShow("test");
    expect(result).toBeNull();
  });
});

describe("circuit breaker integration", () => {
  it("opens circuit after 3 consecutive failures", async () => {
    mockFetch({}, 500);
    await sonarrModule.getSonarrShow(1);
    await sonarrModule.getSonarrShow(2);
    await sonarrModule.getSonarrShow(3);

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await sonarrModule.getSonarrShow(4);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
