# Multi-Server Plex Support

## Context

Parrot currently supports a single Plex server. Users with multiple servers (e.g., a local NAS and a remote server) can only monitor one at a time. This phase adds support for N servers with priority ordering, a compact index that reduces storage usage by ~60%, and a combined server+cache management UI.

---

## Design Overview

### Server Priority Model

- Servers stored as an ordered array — first server = primary, decreasing importance
- When an item exists on multiple servers, Parrot links to the **first** (highest-priority) server that has it
- For gap detection, episodes are aggregated across **all** servers for the most accurate picture

### Compact Index

Current index duplicates each `OwnedItem` (~100-150 bytes) 3-5 times across lookup maps. New design stores items once in a flat array; maps hold numeric indices instead of full objects. ~60-70% storage reduction.

### Storage Permission

Add `unlimitedStorage` to manifest permissions (no user-facing warning) to remove the 10MB cap on `storage.local`.

---

## Type Changes (`src/common/types.ts`)

### New: `PlexServerConfig`

```typescript
export interface PlexServerConfig {
  id: string;           // machineIdentifier (stable Plex server ID)
  name: string;         // friendlyName from Plex API
  serverUrl: string;
  token: string;
}
```

Replaces `PlexConfig`. Stored as `PlexServerConfig[]` in `browser.storage.sync` (key: `"plexServers"`). Array order = priority.

### Updated: `OwnedItem`

```typescript
export interface OwnedItem {
  title: string;
  year?: number;
  plexKeys: Record<string, string>; // serverId → plexKey (was: plexKey: string)
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
}
```

### Updated: `LibraryIndex` (compact)

```typescript
export interface LibraryIndex {
  items: OwnedItem[];                          // single source of truth
  movies: {
    byTmdbId: Record<string, number>;          // value = index into items[]
    byImdbId: Record<string, number>;
    byTitle: Record<string, number>;
  };
  shows: {
    byTvdbId: Record<string, number>;
    byTmdbId: Record<string, number>;
    byImdbId: Record<string, number>;
    byTitle: Record<string, number>;
  };
  lastRefresh: number;
  itemCount: number;
  movieCount: number;
  showCount: number;
}
```

### Updated: `TestConnectionResponse`

Add `friendlyName?: string` — already available from Plex root endpoint (`/`) which we already call.

### Updated: `CheckResponse`

No structural change. `item` field returns the new `OwnedItem` shape (with `plexKeys` instead of `plexKey`). Content scripts don't access `plexKey` directly — they use `plexUrl` from the response.

### Updated: Messages

- `BUILD_INDEX` — no params change (background reads servers from storage)
- Add `TEST_ALL_SERVERS` message → returns `{ results: Array<{ serverId: string; name: string; success: boolean; error?: string }> }`
- `TEST_CONNECTION` — unchanged (already takes a config object)

### Updated: `StatusResponse`

Add `serverCount: number` field.

---

## Storage Layer (`src/common/storage.ts`)

### New functions

| Function | Purpose |
|----------|---------|
| `getServers(): Promise<PlexServerConfig[]>` | Read server list from sync storage |
| `saveServers(servers: PlexServerConfig[]): Promise<void>` | Write server list to sync storage |
| `migrateConfig(): Promise<void>` | One-time migration from old `plexConfig` to `plexServers` |

### Migration logic (`migrateConfig`)

1. Read old `plexConfig` key from sync storage
2. If found AND `plexServers` key does not exist:
   - Convert to `PlexServerConfig` (derive `name` from URL hostname if `friendlyName` not available, or use "Server 1")
   - Save as `plexServers: [converted]`
   - Remove old `plexConfig` key
3. Clear `libraryIndex` from local storage (structure changed — will rebuild on next check via auto-refresh or manual refresh)

### Removed functions

- `getConfig()` → replaced by `getServers()`
- `saveConfig()` → replaced by `saveServers()`

Keep old `PlexConfig` type temporarily for migration, then remove.

---

## Plex API (`src/api/plex.ts`)

### `testConnection` update

Extract `friendlyName` from the root endpoint response (already fetched for `machineIdentifier`):

```typescript
friendlyName = idData.MediaContainer?.friendlyName;
```

Return type gains `friendlyName?: string`.

### `buildLibraryIndex` rewrite

New signature: `buildLibraryIndex(servers: PlexServerConfig[]): Promise<LibraryIndex>`

**Merge algorithm:**

```
1. Create empty index with items: [], empty maps
2. For each server (in priority order):
   a. Fetch all sections
   b. For each section, fetch all items
   c. For each item:
      - Extract external IDs from GUIDs
      - Try to find existing item in index:
        - Check movies.byTmdbId[tmdbId], movies.byImdbId[imdbId], etc.
        - Check shows.byTvdbId[tvdbId], shows.byTmdbId[tmdbId], etc.
      - If FOUND: add this server's plexKey to existing item's plexKeys.
        Enrich with any new IDs (e.g., if existing item had no tmdbId but this server's copy does → add it + update map)
      - If NEW: create OwnedItem, push to items[], set all lookup map entries to the new index
3. Stamp lastRefresh, calculate counts
```

Key detail: the `findExistingItem` helper determines the correct map group (movies vs shows) based on `section.type`, then checks each ID against the corresponding map. Match on **any** single external ID = same item.

Individual fetch functions (`fetchLibrarySections`, `fetchSectionItems`, `fetchShowEpisodes`) keep their current signatures (they operate on one server at a time via `PlexServerConfig`, which has the same `serverUrl`/`token` fields as old `PlexConfig`).

### `plexFetch` update

Change parameter type from `PlexConfig` to `PlexServerConfig` (same fields, just different type name).

---

## Background Service Worker (`src/entrypoints/background.ts`)

### New module-level state

```typescript
let cachedServers: PlexServerConfig[] | null = null;
```

### New helper: `resolveItemPlexUrl`

```typescript
function resolveItemPlexUrl(item: OwnedItem, servers: PlexServerConfig[]): string | undefined {
  for (const server of servers) {
    const plexKey = item.plexKeys[server.id];
    if (plexKey) return buildPlexUrl(server.id, plexKey);
  }
  return undefined;
}
```

Used by `handleCheck`, `CHECK_EPISODES`, and `CHECK_COLLECTION` anywhere a plexUrl is needed.

### `loadIndex` update

- Call `migrateConfig()` on first load (idempotent)
- Change `getConfig()` to `getServers()` for auto-refresh path

### `handleCheck` update

Two-step lookup: `map[id]` → index number → `items[index]` → `OwnedItem`. Then `resolveItemPlexUrl(item, servers)` for plexUrl.

### `CHECK_EPISODES` update (multi-server episode merge)

```
1. Find show in index (two-step lookup)
2. Get all server IDs from item.plexKeys
3. Load server configs
4. For each server that owns the show:
   - Call fetchShowEpisodes(serverConfig, plexKey)
   - Add all episodes to merged ownedSet
5. Compare merged ownedSet against TMDB/TVDB episode list
```

This means if Server A has S1-S3 and Server B has S4-S5, the show appears complete.

### `CHECK_COLLECTION` update

Use two-step lookup for each collection movie. Use `resolveItemPlexUrl` for each owned movie's plexUrl.

### `BUILD_INDEX` handler

```typescript
const servers = await getServers();
if (servers.length === 0) { sendResponse({ success: false, error: "No servers configured" }); break; }
const index = await buildLibraryIndex(servers);
```

### `GET_STATUS` handler

Add `serverCount: servers.length` to response.

### `TEST_ALL_SERVERS` handler (new)

Test all servers in parallel, return per-server results:

```typescript
const servers = await getServers();
const results = await Promise.all(servers.map(async (s) => {
  const r = await testConnection(s);
  return { serverId: s.id, name: s.name, success: r.success, error: r.error };
}));
sendResponse({ results });
```

### Auto-refresh update

`getConfig()` → `getServers()`, pass full array to `buildLibraryIndex`.

---

## Options Page Redesign

### New section: "Plex Servers" (replaces old "Plex Server" + "Cache" sections)

```
┌──────────────────────────────────────────────┐
│ Plex Servers                                 │
│                                              │
│ ● Media Server          [✏️ edit] [✕ delete] │
│ ○ Remote NAS            [✏️ edit] [✕ delete] │
│                                              │
│ ── Add Server ──────────────────────────     │
│ URL:   [____________________________]        │
│ Token: [____________________________]        │
│                              [Save]          │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ Library index:    524 items              │ │
│ │ Last synced:      8 days ago             │ │
│ │ Storage:          5.2MB / 10MB           │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ [Test All]  [Refresh Library]  [Clear Cache] │
│                                              │
│ Auto-refresh library              [✓]        │
│ Refresh interval (days)           [7]        │
│                                              │
│ [feedback area]                              │
└──────────────────────────────────────────────┘
```

### Server list behaviour

- **Status dot**: green = connected (tested on page load), red = failed or untested
- On page load: `TEST_ALL_SERVERS` runs, dots update as results arrive
- **Edit (✏️)**: fills URL + Token inputs with that server's values, changes "Add Server" label to "Edit Server: {name}", Save updates the existing entry instead of adding
- **Delete (✕)**: removes server from array, saves, triggers index rebuild
- **Save**: validates via `TEST_CONNECTION`, extracts `machineIdentifier` + `friendlyName`, saves server config, triggers `BUILD_INDEX`

### After save/edit

- Server name appears in list with green dot
- Add Server inputs clear (or revert from edit mode)
- Library info box refreshes with new counts

### Removed sections

- Old "Plex Server" section (replaced by server list above)
- Old "Cache" section (merged into Plex Servers section)

### Unchanged sections

- API Keys
- Gap Detection
- Supported Sites

---

## Popup Changes (minimal)

### Setup view

Unchanged — still shows URL + Token fields for first-server onboarding. On save, creates `plexServers: [newServer]`. After successful sync, transitions to dashboard.

### Dashboard view

- `StatusResponse` now includes `serverCount` — could show in status bar (e.g., "2 servers" next to Plex pill), but not required for v1
- Library summary shows aggregate counts (unchanged)
- Media card plexUrl comes from `resolveItemPlexUrl` (already resolved by background)

### `getConfig()` → `getServers()` migration

Popup init checks `getServers()` instead of `getConfig()`. If array is non-empty → dashboard. If empty → setup view.

---

## Manifest (`wxt.config.ts`)

Add `"unlimitedStorage"` to permissions array:

```typescript
permissions: ["storage", "unlimitedStorage"],
```

---

## Implementation Steps

### Step 1: Types + Storage layer

- Update `types.ts`: add `PlexServerConfig`, update `OwnedItem` (`plexKeys`), update `LibraryIndex` (compact with numeric map values), update `TestConnectionResponse` (+`friendlyName`), update `StatusResponse` (+`serverCount`), add `TestAllServersResponse`
- Update `storage.ts`: add `getServers()`/`saveServers()`, add `migrateConfig()`, remove `getConfig()`/`saveConfig()`
- Update `wxt.config.ts`: add `unlimitedStorage` permission

**Files:** `src/common/types.ts`, `src/common/storage.ts`, `wxt.config.ts`

### Step 2: Plex API

- Update `testConnection` to return `friendlyName`
- Update `plexFetch` and other functions to accept `PlexServerConfig` (same shape as old `PlexConfig` for URL/token)
- Rewrite `buildLibraryIndex(servers: PlexServerConfig[])` with multi-server merge + compact index

**Files:** `src/api/plex.ts`

### Step 3: Background service worker

- Add `cachedServers` state + `resolveItemPlexUrl` helper
- Call `migrateConfig()` on startup
- Update `handleCheck` for two-step lookup + multi-server plexUrl resolution
- Update `CHECK_EPISODES` for multi-server episode aggregation
- Update `CHECK_COLLECTION` for two-step lookup + per-movie plexUrl
- Update `BUILD_INDEX` to use server list
- Update `GET_STATUS` to include `serverCount`
- Add `TEST_ALL_SERVERS` handler
- Update auto-refresh to use server list
- Replace all `getConfig()` calls with `getServers()` + appropriate server selection

**Files:** `src/entrypoints/background.ts`

### Step 4: Options page redesign

- Restructure HTML: merge Plex Server + Cache sections, add server list area, add edit/delete UI
- Rewrite server management logic in `main.ts`: render server list, handle add/edit/delete, test all on page load
- Update CSS for server list rows (status dot, inline buttons)

**Files:** `src/entrypoints/options/index.html`, `src/entrypoints/options/main.ts`, `src/entrypoints/options/style.css`

### Step 5: Popup update

- Replace `getConfig()` with `getServers()` for init check
- Popup setup saves to `plexServers` array instead of `plexConfig`
- Status bar could show server count (optional enhancement)

**Files:** `src/entrypoints/popup/main.ts`

### Step 6: Tests

- Update/add tests for compact index building and multi-server merge
- Test migration from old `plexConfig` format
- Test `resolveItemPlexUrl` priority ordering
- Update existing tests that reference `OwnedItem.plexKey` → `plexKeys`

**Files:** `tests/plex.test.ts` (or new `tests/multi-server.test.ts`)

### Step 7: Docs + commit

- Update `CLAUDE.md` architecture section (multi-server notes)
- Update `docs/Parrot spec.md`
- Create `docs/Multi-Server Support.md`
- Update `docs/Completed.md` / `docs/TODO.md`
- Build, test, lint
- Commit and push

---

## Files Summary

| File | Key changes |
|------|------------|
| `src/common/types.ts` | `PlexServerConfig`, compact `LibraryIndex`, updated `OwnedItem.plexKeys`, new message types |
| `src/common/storage.ts` | `getServers`/`saveServers`, `migrateConfig`, remove old config functions |
| `src/api/plex.ts` | `testConnection` returns `friendlyName`, `buildLibraryIndex` takes server array + merge logic |
| `src/entrypoints/background.ts` | Two-step lookup, `resolveItemPlexUrl`, multi-server episode merge, `TEST_ALL_SERVERS` |
| `src/entrypoints/options/index.html` | Combined Plex Servers section with server list + cache info |
| `src/entrypoints/options/main.ts` | Server list CRUD, test-all, edit mode |
| `src/entrypoints/options/style.css` | Server row styling (status dot, inline buttons) |
| `src/entrypoints/popup/main.ts` | `getServers()` instead of `getConfig()`, save to array |
| `wxt.config.ts` | Add `unlimitedStorage` permission |
| `tests/` | Compact index, merge, migration, priority resolution tests |

---

## Verification

1. `npm test` — all tests pass
2. `npm run build` — compiles cleanly
3. `npm run lint` — no errors
4. Manual: Fresh install → popup setup adds first server → dashboard shows library counts
5. Manual: Options page → add second server → library rebuilds with merged counts
6. Manual: Movie owned on Server 1 only → badge links to Server 1
7. Manual: Movie owned on both servers → badge links to Server 1 (primary)
8. Manual: Show with episodes split across servers → gap panel shows combined ownership
9. Manual: Edit server URL/token → server updates in list, index rebuilds
10. Manual: Delete server → index rebuilds without that server's items
11. Manual: Test All → status dots update (green/red) per server
12. Manual: Upgrade from single-server version → migration converts config, prompts rebuild
