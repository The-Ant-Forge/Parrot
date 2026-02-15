# Phase 7 — TV Episode Gap Detection

## Goal

When browsing a TV show page on TMDB or TVDB, if the user owns the show but is missing episodes, show a collapsible season-level gap panel below the ownership badge.

## Prerequisites

- Phase 5 complete (TMDB API key configured)
- Phase 6 complete (collection gap pattern established)

## Design decisions

### Use TMDB API (not TVDB API) for episode data

The TMDB API key is already configured (Phase 5). TMDB has comprehensive TV episode data via `/tv/{id}` and `/tv/{id}/season/{n}`. This avoids requiring a second API key (TVDB v4 requires registration + bearer token auth).

For TVDB pages, we convert TVDB ID to TMDB ID using TMDB's `GET /find/{tvdb_id}?external_source=tvdb_id` endpoint.

### Compact ownership: don't store episodes in the index

The library index stays show-level only (as today). Episode data is fetched **on demand** when viewing a TV show page, compared immediately, and only the **gap result** is cached — season-level summaries with counts and missing episode numbers. The raw owned-episode list from Plex is used transiently and discarded.

### On-demand fetch + cache (same pattern as collection gaps)

1. Content script sends `CHECK_EPISODES` after the ownership badge resolves
2. Background handler checks cache; if stale, fetches from Plex + TMDB, compares, caches result
3. Content script renders an episode gap panel

---

## Episode gap cache format

Stored in `browser.storage.local` under `"episodeGaps"`:

```typescript
interface EpisodeGapCacheEntry {
  showTitle: string;
  tmdbId: number;
  seasons: SeasonGapInfo[];
  totalOwned: number;
  totalEpisodes: number;
  completeSeasons: number;
  totalSeasons: number;
  fetchedAt: number;
}

interface SeasonGapInfo {
  seasonNumber: number;
  ownedCount: number;
  totalCount: number;
  missing: { number: number; name: string; airDate?: string }[];
}
```

**Why this is compact**: For complete seasons, `missing` is empty. For partial seasons, it stores only the gaps (typically a small subset). The full owned-episode set is never persisted.

Cache TTL: **24 hours** (shows change more often than movie collections).

---

## Message protocol

New message type:

```typescript
| { type: "CHECK_EPISODES"; source: "tvdb" | "tmdb"; id: string }
```

New response type:

```typescript
interface EpisodeGapResponse {
  hasGaps: boolean;
  gaps?: {
    showTitle: string;
    totalOwned: number;
    totalEpisodes: number;
    completeSeasons: number;
    totalSeasons: number;
    seasons: SeasonGapInfo[];
  };
}
```

---

## TMDB API additions

Three new functions in `src/api/tmdb.ts`:

- `getTvShow(apiKey, tvId)` — `GET /tv/{tvId}`, returns show details with seasons array
- `getTvSeason(apiKey, tvId, seasonNumber)` — `GET /tv/{tvId}/season/{n}`, returns episode list
- `findByTvdbId(apiKey, tvdbId)` — `GET /find/{tvdbId}?external_source=tvdb_id`, converts TVDB to TMDB ID

---

## Plex episode fetching

One new function in `src/api/plex.ts`:

- `fetchShowEpisodes(config, ratingKey)` — `GET /library/metadata/{ratingKey}/allLeaves`
- Returns `{ seasonNumber, episodeNumber }[]` from Plex `parentIndex` + `index` fields
- Existing `http://*/library/*` host_permission already covers this endpoint

---

## Background handler logic (CHECK_EPISODES)

1. Load options, get TMDB API key (bail if not set)
2. Look up show in library index by source/id, get OwnedItem with plexKey. If not owned, return `{ hasGaps: false }`
3. Determine TMDB ID: if source is "tmdb" use id directly; if "tvdb" call `findByTvdbId`
4. Check episode gap cache. If fresh, return cached result
5. Fetch Plex episodes via `fetchShowEpisodes`, build a `Set<string>` of `"S{n}E{n}"` keys (transient, not stored)
6. Fetch TMDB show details via `getTvShow`, get season list
7. Filter seasons: if `excludeSpecials`, skip season 0
8. For each season, fetch TMDB episodes via `getTvSeason`
9. Filter episodes: if `excludeFuture`, skip episodes where `air_date >= today`
10. Compare TMDB episodes against Plex owned set, build `SeasonGapInfo[]`
11. If no gaps, return `{ hasGaps: false }`
12. Cache result, return to content script

---

## Episode gap panel

A collapsible panel styled identically to collection-panel.ts:

```
+----------------------------------------------+
| > 52 of 65 episodes - 3 of 5 seasons full    |
|----------------------------------------------|
|  S1     20/20                                 |
|  S2     20/20                                 |
|  S3     12/15  (missing 3)                    |
|  S4     10/10                                 |
|  S5      0/20  (missing all)                  |
+----------------------------------------------+
```

- Dark theme (#282828 bg, #ebaf00 gold accents)
- Complete seasons: gold checkmark
- Partial/missing seasons: gray X with "(missing N)"
- Collapsed by default
- Only shown when there ARE gaps

---

## Content script changes

### TVDB

After badge shows "owned", send `CHECK_EPISODES` with source "tvdb". If gaps found, inject panel after `h1`.

### TMDB

For TV shows (not movies), after badge shows "owned", send `CHECK_EPISODES` with source "tmdb". If gaps found, inject panel after anchor element. Movies continue using `CHECK_COLLECTION`.

---

## Files

| File | Action |
|------|--------|
| `src/api/tmdb.ts` | Modify |
| `src/api/plex.ts` | Modify |
| `src/common/types.ts` | Modify |
| `src/common/episode-panel.ts` | **New** |
| `src/common/storage.ts` | Modify |
| `src/entrypoints/background.ts` | Modify |
| `src/entrypoints/tvdb.content.ts` | Modify |
| `src/entrypoints/tmdb.content.ts` | Modify |

No changes to wxt.config.ts, options page, or manifest.
