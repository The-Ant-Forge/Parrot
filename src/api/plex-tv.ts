/**
 * Plex.tv account API client — discovers server connection URLs.
 *
 * Used to auto-fetch the .plex.direct remote URL for a server when the user
 * saves credentials. Falls back to manual entry if discovery fails.
 */

import { debugLog } from "../common/logger";

const BASE_URL = "https://plex.tv/api/v2";
const TIMEOUT_MS = 4000;

/** A single connection candidate for a server (one of LAN, public, relay). */
export interface PlexConnection {
  protocol: string;
  address: string;
  port: number;
  uri: string;
  local: boolean;
  relay: boolean;
  IPv6?: boolean;
}

/** Server discovery response from /api/v2/resources. */
export interface PlexResource {
  clientIdentifier: string;
  name: string;
  publicAddress?: string;
  owned: boolean;
  provides?: string;
  // Optional: offline/partial resource entries can omit it
  connections?: PlexConnection[];
}

/**
 * Fetch all servers the user has access to, with their connection candidates.
 * Returns empty array on failure (network error, 401, etc.) — callers should
 * treat this as "auto-detection unavailable" rather than fatal.
 */
export async function fetchServerConnections(token: string): Promise<PlexResource[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/resources?includeHttps=1&includeRelay=0`, {
      headers: {
        Accept: "application/json",
        "X-Plex-Token": token,
        "X-Plex-Client-Identifier": "parrot-extension",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      debugLog("PlexTV", `HTTP ${res.status} fetching resources`);
      return [];
    }

    const data = await res.json() as PlexResource[];
    return Array.isArray(data) ? data.filter((r) => r.provides?.includes("server")) : [];
  } catch (err) {
    clearTimeout(timer);
    debugLog("PlexTV", "fetch failed", err);
    return [];
  }
}

/**
 * Pick the best remote URL for a server identified by machineIdentifier.
 * Returns the first non-local, non-relay connection URI, or null if none found.
 *
 * Plex returns connections in priority order — HTTPS before HTTP, IPv4 before IPv6.
 * We trust that ordering rather than re-ranking.
 */
export function pickRemoteUrl(resources: PlexResource[], machineIdentifier: string): string | null {
  const server = resources.find((r) => r.clientIdentifier === machineIdentifier);
  if (!server) return null;
  const remote = (server.connections ?? []).find((c) => !c.local && !c.relay);
  return remote?.uri ?? null;
}
