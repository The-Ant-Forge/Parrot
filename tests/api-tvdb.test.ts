import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSeriesEpisodes, getSeriesDetails, _resetTokenCache } from "../src/api/tvdb";

beforeEach(() => {
  vi.restoreAllMocks();
  _resetTokenCache();
});

function response(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

function loginResponse(token = "token-1") {
  return response({ data: { token } });
}

function episodesResponse(episodes: unknown[]) {
  return response({ data: { episodes } });
}

function ep(season: number, number: number, name = `Ep ${number}`, aired = "2020-01-01") {
  return { seasonNumber: season, number, name, aired };
}

/** Extract the Authorization header from a recorded fetch call. */
function authHeader(call: unknown[]): string {
  return (call[1] as { headers: { Authorization: string } }).headers.Authorization;
}

describe("tvdb login flow", () => {
  it("logs in once and reuses the bearer token across calls", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(loginResponse("abc"))
      .mockResolvedValueOnce(episodesResponse([ep(1, 1)]))
      .mockResolvedValueOnce(episodesResponse([ep(1, 2)]));
    vi.stubGlobal("fetch", fetchMock);

    await getSeriesEpisodes("key", "42");
    await getSeriesEpisodes("key", "42");

    // 1 login + 2 episode fetches (no re-login for the second call)
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toContain("/login");
    expect(authHeader(fetchMock.mock.calls[1])).toBe("Bearer abc");
    expect(authHeader(fetchMock.mock.calls[2])).toBe("Bearer abc");
  });

  it("re-logs in and retries once when the token has expired (401)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(loginResponse("stale"))
      .mockResolvedValueOnce(response({}, 401)) // expired token
      .mockResolvedValueOnce(loginResponse("fresh"))
      .mockResolvedValueOnce(episodesResponse([ep(2, 5, "The Copper Meridian")]));
    vi.stubGlobal("fetch", fetchMock);

    const episodes = await getSeriesEpisodes("key", "42");

    expect(episodes).toEqual([
      { seasonNumber: 2, number: 5, name: "The Copper Meridian", aired: "2020-01-01" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][0]).toContain("/login");
    expect(authHeader(fetchMock.mock.calls[3])).toBe("Bearer fresh");
  });

  it("throws on invalid API key (login 401)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 401)));
    await expect(getSeriesEpisodes("bad-key", "42")).rejects.toThrow("Invalid TVDB API key");
  });

  it("throws when login response has no token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data: {} })));
    await expect(getSeriesEpisodes("key", "42")).rejects.toThrow("no token in response");
  });

  it("throws on non-401 API errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(response({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getSeriesEpisodes("key", "42")).rejects.toThrow("TVDB API error: 500");
  });
});

describe("getSeriesEpisodes pagination", () => {
  it("fetches subsequent pages while a page is full (500) and stops on a short page", async () => {
    const fullPage = Array.from({ length: 500 }, (_, i) => ep(1, i + 1));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(episodesResponse(fullPage))
      .mockResolvedValueOnce(episodesResponse([ep(2, 1), ep(2, 2)]));
    vi.stubGlobal("fetch", fetchMock);

    const episodes = await getSeriesEpisodes("key", "42");

    expect(episodes).toHaveLength(502);
    expect(fetchMock.mock.calls[1][0]).toContain("page=0");
    expect(fetchMock.mock.calls[2][0]).toContain("page=1");
  });

  it("stops when a full page is followed by an empty page", async () => {
    const fullPage = Array.from({ length: 500 }, (_, i) => ep(1, i + 1));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(episodesResponse(fullPage))
      .mockResolvedValueOnce(episodesResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const episodes = await getSeriesEpisodes("key", "42");

    expect(episodes).toHaveLength(500);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns empty for a series with no episodes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(episodesResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    expect(await getSeriesEpisodes("key", "42")).toEqual([]);
  });

  it("skips episodes missing season or episode numbers", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(episodesResponse([
        ep(1, 1),
        { seasonNumber: null, number: 2, name: "x", aired: null },
        { seasonNumber: 1, number: null, name: "y", aired: null },
      ]));
    vi.stubGlobal("fetch", fetchMock);

    const episodes = await getSeriesEpisodes("key", "42");
    expect(episodes).toHaveLength(1);
  });
});

describe("getSeriesDetails", () => {
  it("maps the series payload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(response({
        data: { name: "Harbor of Glass", image: "https://img/x.jpg", year: "2019", status: { name: "Continuing" } },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const details = await getSeriesDetails("key", "42");
    expect(details).toEqual({
      name: "Harbor of Glass",
      image: "https://img/x.jpg",
      year: "2019",
      status: { name: "Continuing" },
    });
  });
});
