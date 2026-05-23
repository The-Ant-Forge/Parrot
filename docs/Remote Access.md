# Parrot — Remote Server Access

## Problem

Today Parrot connects to a Plex server via the URL the user enters in options (e.g. `http://192.168.1.100:32400`). That URL only resolves when the browser is on the same network as the server. Users who travel — or even just visit a coffee shop — see the badge silently fall back to "not in library" because the API calls fail.

## Goal

Make Parrot work from anywhere a normal Plex client works, **without** requiring:

- Manual port forwarding
- A VPN install (Tailscale, WireGuard, etc.)
- Plex's OAuth PIN flow (full account-level auth)
- Plex Pass (browsing metadata is not gated; only streaming is — as of May 2026)

The only prerequisite is that the user has already enabled **Plex Remote Access** on their server (a setting Plex strongly encourages anyway, used by the official Plex apps).

## Non-Goals

- Full OAuth flow with token refresh
- Multi-account / server-sharing support
- Streaming or transcoding (Parrot never streams)
- Replacing the current local URL setup (the change is purely additive)

## Design

### Data model

Add a single optional field to `PlexServerConfig`:

```typescript
interface PlexServerConfig {
  id: string;
  name: string;
  serverUrl: string;       // existing — local/primary URL
  remoteUrl?: string;      // NEW — auto-fetched .plex.direct URL (or user-entered fallback)
  token: string;
  libraryCount?: number;
  itemCount?: number;
}
```

Existing servers keep working; `remoteUrl` stays `undefined` until next save or explicit auto-detect.

### Auto-detection flow

When the user saves a server (new or edited) and the `TEST_CONNECTION` succeeds:

1. Background hits `https://plex.tv/api/v2/resources?X-Plex-Token={token}` with `Accept: application/json`.
2. Response is an array of all servers the user has access to. Match by `clientIdentifier === serverConfig.id` (= machineIdentifier).
3. From the matched server's `connections[]` array, pick the first entry where `local: false` and `relay: false` — that's the public `.plex.direct` URL.
4. Populate the Remote URL field in the options UI; user can edit before save.

If auto-detection fails (no Pass access to plex.tv, Remote Access disabled, network error), the field stays empty and the user can paste one manually.

### Runtime URL resolution

At runtime, each Plex API call goes through `plexFetch(config, path)`. We change `plexFetch` to:

1. Look up `lastWorkingUrl[serverId]` in service-worker memory (Map). If set, try it first.
2. Otherwise try `serverUrl` first.
3. If the chosen URL fails (timeout or non-2xx), try the other (`remoteUrl` if available).
4. On any success, update `lastWorkingUrl[serverId]` to the URL that worked.
5. If both fail, surface the error normally.

This is **session-sticky**: once a URL works during a service-worker lifetime, we keep using it without paying the timeout cost on every CHECK. The cache resets when the service worker unloads, so a return-home (or return-away) transition gets re-probed naturally on the next call.

### Timeouts

The current `plexFetch` has no timeout (relies on fetch's default). For the remote fallback to feel responsive, we need explicit timeouts:

- Per-attempt: 3 seconds (LAN should respond in ms; longer almost certainly means unreachable)
- AbortController applied per attempt, not per overall call

Net worst case when both URLs are misconfigured: 6 seconds. With `lastWorkingUrl` memo, only the first failing call pays this.

### IP rotation handling

`.plex.direct` URLs encode the server's public IP. ISPs rotate public IPs occasionally — when this happens:

- The auto-fetched URL becomes stale
- `plexFetch` falls back to `serverUrl` (which fails when remote) → both fail → error badge

To handle this:

1. **Auto-refresh on library refresh** — the existing 7-day library index rebuild also re-runs auto-detect. This is the main self-healing mechanism.
2. **Manual "Auto-detect" button** in the server edit form — user can re-fetch on demand.
3. **Manual edit field** — user can paste a new URL directly without re-saving credentials.

### UI

In each server's edit panel:

```
Server URL: [http://192.168.1.100:32400         ]
Remote URL: [192-168-1-100.abc123.plex.direct   ] [Auto-detect]
            (optional - used when away from home)
Token:      [********************************    ]
```

The "Auto-detect" button calls a new `FETCH_REMOTE_URL` message in the background. Auto-detection also runs implicitly on save when the field is blank and a fresh test succeeds.

## Implementation Plan

1. **`src/api/plex-tv.ts`** — new client (~25 LOC). One function `fetchServerConnections(token): Promise<ServerConnections[]>`. Returns an array of `{ clientIdentifier, connections: { uri, local, relay }[] }`.
2. **Types** — add `remoteUrl?: string` to `PlexServerConfig`, add `FETCH_REMOTE_URL` message type, add `FetchRemoteUrlResponse`.
3. **Storage** — migration is automatic since `remoteUrl` is optional; existing stored objects deserialize fine.
4. **`plexFetch` rewrite** — accept `PlexServerConfig` instead of `{ serverUrl, token }`. Add `lastWorkingUrl: Map<string, string>` module-level. Try in order, memoize success, timeout via AbortController.
5. **Call site updates** — `testConnection`, `fetchLibrarySections`, `fetchSectionItems`, `fetchShowEpisodes` accept `PlexServerConfig` (already pass it in most cases).
6. **Background handler** — `FETCH_REMOTE_URL` calls plex-tv client, returns the URL.
7. **Options page** — add Remote URL input next to Server URL, "Auto-detect" button. On save, include `remoteUrl` in the new `PlexServerConfig`. Server save flow auto-fetches when field is blank.
8. **Tests** — `tests/api-plex-tv.test.ts`, fallback behavior tests in `tests/api-plex.test.ts`.

## Edge Cases

| Case | Behavior |
|------|----------|
| Remote Access not enabled on Plex server | `connections[]` only contains LAN entries → auto-detect returns nothing → field empty |
| Token lacks plex.tv account scope | `/api/v2/resources` returns 401 → auto-detect fails silently → user can paste manually |
| Multiple `local: false, relay: false` entries | Pick first (Plex returns them in priority order: HTTPS before HTTP) |
| Public IP rotation between sessions | Background auto-refresh on library rebuild catches it; otherwise user clicks Auto-detect |
| User on LAN but `lastWorkingUrl` is the remote URL | Hairpin NAT may work (remote URL succeeds from LAN); if not, falls back to local; either way one CHECK pays the timeout, then memo locks the working choice |

## Plex Pass Risk

As of May 2026, Plex restricts **remote streaming** to Plex Pass / Remote Watch Pass users (Nov 2025 enforcement). Browsing the library API (`/library/sections`, `/library/metadata/*`) is **not** affected — that's what Parrot uses.

If Plex extends restrictions to library API in the future:
- Affects only remote use (LAN unaffected)
- Mitigation: degrade gracefully — same "not owned" fallback as today when reachability fails
- Long-term: nothing technical Parrot can do without paying Pass

## Out of Scope (future)

- Full OAuth PIN flow with proper token refresh
- Multi-user / shared-server support
- Plex Relay URL (Plex's own tunnel) — could be added as a third candidate but not needed for Remote Access users
