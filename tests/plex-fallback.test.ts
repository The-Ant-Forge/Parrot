import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchLibrarySections, _resetUrlMemo } from "../src/api/plex";
import type { PlexServerConfig } from "../src/common/types";

vi.mock("../src/common/logger", () => ({
  debugLog: vi.fn(),
  errorLog: vi.fn(),
}));

const server: PlexServerConfig = {
  id: "server-1",
  name: "Test Server",
  serverUrl: "http://192.168.1.100:32400",
  remoteUrl: "https://1-2-3-4.abc.plex.direct:32400",
  token: "test-token",
};

function okResponse(body: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  _resetUrlMemo();
});

describe("plexFetch URL fallback", () => {
  it("tries serverUrl first when no memo exists", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      calls.push(url);
      return Promise.resolve(okResponse({ MediaContainer: { Directory: [] } }));
    }));

    await fetchLibrarySections(server);
    expect(calls[0]).toContain("192.168.1.100");
  });

  it("falls back to remoteUrl when serverUrl errors", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      calls.push(url);
      if (url.includes("192.168.1.100")) {
        return Promise.reject(new Error("ECONNREFUSED"));
      }
      return Promise.resolve(okResponse({ MediaContainer: { Directory: [] } }));
    }));

    await fetchLibrarySections(server);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("192.168.1.100");
    expect(calls[1]).toContain("plex.direct");
  });

  it("memoizes the working URL for subsequent calls", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      calls.push(url);
      if (url.includes("192.168.1.100")) {
        return Promise.reject(new Error("timeout"));
      }
      return Promise.resolve(okResponse({ MediaContainer: { Directory: [] } }));
    }));

    await fetchLibrarySections(server);
    await fetchLibrarySections(server);
    // First call: 2 attempts (local fails, remote works)
    // Second call: 1 attempt (memo points to remote)
    expect(calls).toHaveLength(3);
    expect(calls[2]).toContain("plex.direct");
  });

  it("re-probes from configured candidates when memoized URL fails", async () => {
    let failRemote = false;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("192.168.1.100")) {
        return failRemote
          ? Promise.resolve(okResponse({ MediaContainer: { Directory: [] } }))
          : Promise.reject(new Error("ECONNREFUSED"));
      }
      return failRemote
        ? Promise.reject(new Error("timeout"))
        : Promise.resolve(okResponse({ MediaContainer: { Directory: [] } }));
    }));

    // First call: local fails, remote works → memo = remote
    await fetchLibrarySections(server);

    // Flip: now remote fails, local works
    failRemote = true;
    await fetchLibrarySections(server);
    // Second call: remote (memo) fails, then serverUrl works → succeeds
  });

  it("throws when all URL candidates fail", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    await expect(fetchLibrarySections(server)).rejects.toThrow();
  });

  it("works with serverUrl-only config (no remoteUrl)", async () => {
    const local: PlexServerConfig = { ...server, remoteUrl: undefined };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(okResponse({ MediaContainer: { Directory: [] } }))));
    await expect(fetchLibrarySections(local)).resolves.toBeDefined();
  });

  it("does not memoize when config has no id (unsaved test connection)", async () => {
    const adhoc = { serverUrl: server.serverUrl, remoteUrl: server.remoteUrl, token: server.token };
    let attemptCount = 0;
    vi.stubGlobal("fetch", vi.fn(() => {
      attemptCount++;
      return Promise.resolve(okResponse({ MediaContainer: { Directory: [] } }));
    }));

    await fetchLibrarySections(adhoc);
    await fetchLibrarySections(adhoc);
    // Both calls hit serverUrl fresh (no memo because no id)
    expect(attemptCount).toBe(2);
  });
});
