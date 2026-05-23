import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/common/logger", () => ({
  debugLog: vi.fn(),
  errorLog: vi.fn(),
}));

let plexTvModule: typeof import("../src/api/plex-tv");

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  plexTvModule = await import("../src/api/plex-tv");
});

function mockFetch(data: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  }));
}

function mockFetchError(message = "Network error") {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(message)));
}

const sampleResources = [
  {
    clientIdentifier: "server-abc",
    name: "Living Room",
    owned: true,
    provides: "server",
    connections: [
      { protocol: "https", address: "192.168.1.100", port: 32400, uri: "https://192-168-1-100.abc.plex.direct:32400", local: true, relay: false },
      { protocol: "https", address: "203.0.113.45", port: 32400, uri: "https://203-0-113-45.abc.plex.direct:32400", local: false, relay: false },
      { protocol: "https", address: "relay.plex.tv", port: 443, uri: "https://relay.plex.tv:443", local: false, relay: true },
    ],
  },
  {
    clientIdentifier: "server-xyz",
    name: "Other Server",
    owned: false,
    provides: "server",
    connections: [
      { protocol: "https", address: "other.example.com", port: 32400, uri: "https://other.example.com:32400", local: false, relay: false },
    ],
  },
];

describe("fetchServerConnections", () => {
  it("returns resources filtered to servers only", async () => {
    const withClient = [...sampleResources, { clientIdentifier: "client-only", name: "Client", owned: false, provides: "client", connections: [] }];
    mockFetch(withClient);
    const result = await plexTvModule.fetchServerConnections("token-123");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.provides?.includes("server"))).toBe(true);
  });

  it("calls plex.tv with the supplied token", async () => {
    mockFetch(sampleResources);
    await plexTvModule.fetchServerConnections("token-123");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("plex.tv/api/v2/resources"),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Plex-Token": "token-123" }),
      }),
    );
  });

  it("returns empty array on HTTP error", async () => {
    mockFetch({}, 401);
    const result = await plexTvModule.fetchServerConnections("bad-token");
    expect(result).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    mockFetchError();
    const result = await plexTvModule.fetchServerConnections("token");
    expect(result).toEqual([]);
  });
});

describe("pickRemoteUrl", () => {
  it("returns the first non-local non-relay URI", () => {
    const url = plexTvModule.pickRemoteUrl(sampleResources, "server-abc");
    expect(url).toBe("https://203-0-113-45.abc.plex.direct:32400");
  });

  it("returns null when server not found", () => {
    const url = plexTvModule.pickRemoteUrl(sampleResources, "nonexistent");
    expect(url).toBeNull();
  });

  it("returns null when server has only local connections", () => {
    const localOnly = [{
      clientIdentifier: "local-only",
      name: "Local",
      owned: true,
      provides: "server",
      connections: [
        { protocol: "https", address: "192.168.1.100", port: 32400, uri: "https://192-168-1-100.abc.plex.direct:32400", local: true, relay: false },
      ],
    }];
    const url = plexTvModule.pickRemoteUrl(localOnly, "local-only");
    expect(url).toBeNull();
  });

  it("skips relay connections", () => {
    const relayOnly = [{
      clientIdentifier: "relay-only",
      name: "Relay",
      owned: true,
      provides: "server",
      connections: [
        { protocol: "https", address: "relay.plex.tv", port: 443, uri: "https://relay.plex.tv:443", local: false, relay: true },
      ],
    }];
    const url = plexTvModule.pickRemoteUrl(relayOnly, "relay-only");
    expect(url).toBeNull();
  });

  it("picks first remote URL when multiple exist", () => {
    const multi = [{
      clientIdentifier: "multi",
      name: "Multi",
      owned: true,
      provides: "server",
      connections: [
        { protocol: "https", address: "first.example.com", port: 32400, uri: "https://first.example.com:32400", local: false, relay: false },
        { protocol: "https", address: "second.example.com", port: 32400, uri: "https://second.example.com:32400", local: false, relay: false },
      ],
    }];
    const url = plexTvModule.pickRemoteUrl(multi, "multi");
    expect(url).toBe("https://first.example.com:32400");
  });
});
