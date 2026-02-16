# Phase 12 — Code Hygiene

Post-Phase 11 consolidation: bug fixes, code deduplication, robustness improvements, and cleanup without changing user-facing features.

---

## Bug Fix: TVDB Metadata Fallback

**Problem:** Shows that exist only on TVDB (not TMDB) displayed empty popup dashboard cards — no title, poster, or season info — even when the TVDB API key was configured.

**Root cause:** `fetchTabMetadata()` resolved metadata exclusively through TMDB. When `findByTvdbId()` returned `null`, the function bailed with no metadata.

**Fix:** When TMDB resolution fails for a TVDB source and the TVDB API key is configured, fetch metadata directly from the TVDB v4 API (`GET /series/{id}`).

**Changes:**
- Added `getSeriesDetails()` to `src/api/tvdb.ts` — fetches name, image, year, status
- Added `posterUrl` field to `TabMediaInfo` (full URL for TVDB images vs TMDB path fragments)
- `fetchTabMetadata` falls back to TVDB API when TMDB resolution fails
- Popup renders `posterUrl` when `posterPath` is absent

---

## Shared Link Scanner

**Problem:** 7 content scripts duplicated a `findExternalId()` function scanning `<a>` elements for TMDB/IMDb/TVDB links. Patterns varied (some checked TVDB, some didn't; TMDB regex inconsistent). The TVDB regex `thetvdb\.com\/.*?(\d{4,})` was overly broad.

**Fix:** Extracted `scanLinksForExternalId()` to `src/common/extractors.ts`:
- Reuses existing `extractTmdbFromUrl()` and `extractImdbId()` for consistency
- Proper TVDB regex: `/series/(\d+)/` instead of broad `\d{4,}` match
- Optional `sources` filter lets scripts restrict which sources to check
- Returns `{ source, id, mediaType }` matching the existing content script contract

**Updated scripts:** tvdb-movies, nzbgeek, rargb, letterboxd, trakt, rottentomatoes (fallback), justwatch, nzbforyou

---

## Content Script Bug Fixes

### tvdb.content.ts — Missing panel cleanup
Added `removeCollectionPanel()` call to prevent stale collection panels after SPA navigation from TVDB Movies pages.

### nzbforyou.content.ts — Multiple issues
1. **Added gap detection** — was the only script without it. Now calls `checkGaps()` for owned items.
2. **Error badges** — replaced silent `removeAllBadges()` catch with `showErrorBadge()` on each badge.
3. **Panel cleanup** — added `removeCollectionPanel()` and `removeEpisodePanel()` calls.
4. **Shared extractors** — uses `extractImdbId()` instead of inline regex.

### nzbgeek.content.ts — Debug logs
Removed leftover `console.log("Parrot NZBGeek:", ...)` statements.

---

## Panel Code Deduplication

**Problem:** `collection-panel.ts` and `episode-panel.ts` shared ~40 lines of identical code (container styles, header styles, arrow creation, toggle handler, inject pattern).

**Fix:** Extracted shared utilities to `src/common/panel-utils.ts`:
- `createPanelContainer()` — standard dark panel with border
- `createPanelHeader()` — collapsible header with arrow, returns `{ header, arrow, body, wireToggle }`
- `injectPanel()` — removes existing panel and inserts after anchor

Both panel files now use these shared utilities, keeping only their unique content rendering logic.

---

## Badge Type Safety

- Changed `setBadgeContent()` and `applyStyles()` to accept `HTMLElement` instead of `HTMLSpanElement`
- Removed `as unknown as HTMLSpanElement` cast in `updateBadgeFromResponse()`
- Unexported `CompletenessState` type (only used within `badge.ts`)

---

## Background.ts Efficiency & Robustness

### Cached movie/show counts
`GET_STATUS` previously created two Sets and iterated all map values on every call. Now `movieCount` and `showCount` are computed once during `buildLibraryIndex()` and stored in `LibraryIndex`.

### Fire-and-forget error handling
Added `.catch()` to `fetchTabMetadata()` call to prevent unhandled promise rejections.

### parseInt hardening
- Added explicit radix 10 to all `parseInt()` calls
- Added NaN guards where `parseInt(message.id)` could produce invalid numbers

### Gap-checker logging
Added `console.warn()` on `FIND_TMDB_ID` failure in `gap-checker.ts` for debuggability (was silently returning null).

---

## Test Updates

- Added `tests/scan-links.test.ts` — 10 tests for `scanLinksForExternalId()` (DOM-based, uses `happy-dom`)
- Tests cover: TMDB movie/TV, IMDb, TVDB series, no matches, sources filter, first-match priority, non-numeric TVDB slug rejection
- Total: 89 tests across 6 test files (up from 79 across 5)
