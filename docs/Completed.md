# Parrot — Completed Work

Everything that's been built and shipped, in chronological order.

---

## Foundation (from ComPlexionist Phase 9b)

The initial extension skeleton, ported from the ComPlexionist desktop app.

### Extension Setup
- Manifest V3 (auto-generated via WXT)
- TypeScript + WXT/Vite build config
- Extension popup HTML/CSS
- Auto-versioning (`Major.A.B` with bump scripts)
- ESLint + Prettier configured
- Chrome + Firefox targets

### Core Logic
- Plex API client — connect, authenticate, fetch libraries, extract GUIDs (`src/api/plex.ts`)
- Library index builder — fetches all items from Plex, builds lookup maps by TMDB/TVDB/IMDb/title
- In-memory + `storage.local` cache with 24h auto-refresh

### Content Scripts (7 sites)
- **TMDB** (`movie` + `tv`, SPA-aware with MutationObserver)
- **IMDb** (SPA-aware, checks both movie + show indexes)
- **TVDB** (slug-based, scans page links for numeric ID)
- **NZBGeek** (scans `<a>` elements for TMDB/IMDb/TVDB IDs)
- **RARGB** (scans `<a>` elements)
- **NZBForYou** (scans `<a>` elements for IMDb IDs)
- **PSA** (title-based matching via URL slug normalization)

### Badge & Deep Linking
- Ownership badge injected next to title (dark pill, gold/gray Plex chevron)
- Clickable deep link to Plex Web when owned
- Dynamic toolbar icon (OffscreenCanvas, 3 states: default/owned/not-owned)

### Popup
- Configuration UI (Plex URL, token)
- Connection test with feedback
- Cache status display (item count, last refresh)
- Manual refresh button
- Settings link to options page

### Storage
- `browser.storage.sync` — Plex URL, token, machineIdentifier
- `browser.storage.local` — library index cache

---

## Phase 5: Options Page

> Spec: [`Phase 5 - Options Page.md`](Phase%205%20-%20Options%20Page.md)

Full-tab WXT options page for API credentials, gap detection preferences, and cache management.

- `ParrotOptions` type with defaults in `types.ts`
- Storage helpers (`getOptions`, `saveOptions`) in `storage.ts`
- Background handlers: `GET_OPTIONS`, `SAVE_OPTIONS`, `VALIDATE_TMDB_KEY`, `CLEAR_CACHE`
- TMDB `host_permissions` in `wxt.config.ts`
- Options page UI (`src/entrypoints/options/`) — four card sections:
  1. Plex Server (URL, token, test, save & sync, status)
  2. API Keys (TMDB key input + validation)
  3. Gap Detection (exclude future, exclude specials, min collection size, min owned)
  4. Cache Management (refresh, clear)
- Settings link in popup

---

## Phase 6: TMDB Collection Gap Detection

> Spec: [`Phase 6 - TMDB Collection Gaps.md`](Phase%206%20-%20TMDB%20Collection%20Gaps.md)

Collapsible panel on TMDB movie pages showing owned/missing movies from the same collection.

- TMDB API client (`src/api/tmdb.ts`) — `getMovie`, `getCollection`, `tmdbFetch` helper
- Collection types + `CHECK_COLLECTION` message in `types.ts`
- Collection cache in `storage.local` (30-day TTL)
- `CHECK_COLLECTION` handler in background — fetches movie details, checks collection, compares against library index
- Collection panel component (`src/common/collection-panel.ts`) — dark theme, gold accents, owned/missing lists with Plex deep links
- TMDB content script integration — triggers collection check after ownership badge for movies

---

## Phase 7: TV Episode Gap Detection

> Spec: [`Phase 7 - TV Episode Gaps.md`](Phase%207%20-%20TV%20Episode%20Gaps.md)

Season-level episode gap panel on TMDB and TVDB TV show pages.

- Episode gap types (`SeasonGapInfo`, `EpisodeGapResponse`, `EpisodeGapCacheEntry`) in `types.ts`
- Episode gap cache helpers in `storage.ts` (24h TTL, keyed by `source:id`)
- TMDB TV API functions (`getTvShow`, `getTvSeason`, `findByTvdbId`) in `tmdb.ts`
- Plex episode fetching (`fetchShowEpisodes` via `/allLeaves`) in `plex.ts`
- `CHECK_EPISODES` handler in background — source-based routing, per-season comparison, respects `excludeSpecials` and `excludeFuture`
- Episode gap panel component (`src/common/episode-panel.ts`) — collapsible, shows "X of Y episodes — N of M seasons full", gold checkmarks for complete seasons
- TVDB content script integration — triggers episode check after owned badge
- TMDB content script integration — triggers episode check for TV shows, collection check for movies

### TVDB v4 API Support

Optional TVDB API key for more accurate TV episode numbering on TVDB pages.

- TVDB v4 API client (`src/api/tvdb.ts`) — bearer token auth with in-memory caching, auto-retry on 401, paginated episode fetching (500/page)
- `tvdbApiKey` added to `ParrotOptions` (default: empty, TMDB used as fallback)
- `VALIDATE_TVDB_KEY` handler in background
- Source-based routing in `CHECK_EPISODES`: TVDB pages use TVDB API when key is configured, TMDB pages always use TMDB API
- TVDB `host_permissions` (`https://api4.thetvdb.com/*`) in `wxt.config.ts`
- Options page: TVDB API key input with validation button (marked optional)

---

## Phase 9: Consolidation — Polish & Reliability

> Spec: [`Phase 9 - Consolidation Polish and Reliability.md`](Phase%209%20-%20Consolidation%20Polish%20and%20Reliability.md)

Test coverage, error feedback, and performance hardening without changing user-facing features.

### Unit Test Suite
- Vitest configuration (`vitest.config.ts`) with globals and path aliases
- 44 unit tests across 3 test files:
  - `tests/extractors.test.ts` — 19 tests for `extractTmdbFromUrl`, `extractImdbId`, `extractPsaFromUrl`, `extractNzbgeekMediaType`
  - `tests/normalize.test.ts` — 17 tests for `normalizeTitle`, `buildTitleKey`, `parseSlug`
  - `tests/plex.test.ts` — 8 tests for `extractExternalIds` (GUID parsing)

### Shared Extractors Module
- Extracted pure URL extraction functions from 4 content scripts into `src/common/extractors.ts`
- Content scripts now import from shared module instead of defining locally
- DOM-coupled extractors (TVDB, RARGB, NZBForYou) remain in their content scripts

### Debounced URL Observer
- `src/common/url-observer.ts` — shared `observeUrlChanges` utility with 150ms trailing-edge debounce
- Replaced duplicated inline MutationObserver code in TMDB, IMDb, and TVDB content scripts
- Coalesces SPA mutation bursts while keeping navigation feel instant

### Error Badge with Tooltip
- Added `tooltip` parameter to `updateBadge` in `src/common/badge.ts`
- Added `showErrorBadge(badge, reason)` convenience function
- Updated 6 content scripts to show red "!" error badge with hover tooltip instead of silently removing the badge on failure
- Exception: NZBForYou keeps `removeAllBadges()` (multi-badge layout)

---

## Phase 10: Quality of Life

> Spec: [`Phase 10 - QOL.md`](Phase%2010%20-%20QOL.md)

UX polish, broader gap detection coverage, popup redesign, and expanded test suite.

### Bug Fixes & Polish
- TVDB API key auto-save — validation now calls `saveAllOptions()` automatically (same for TMDB)
- Panel width — replaced fixed `maxWidth: 400px` with `width: fit-content; max-width: 100%`
- Auto-expand panels — `expandPanels` boolean option (default false) in `ParrotOptions`, toggle in options page

### OwnedItem Enrichment
- Added optional `tmdbId`, `tvdbId`, `imdbId` fields to `OwnedItem`
- `buildLibraryIndex` now stores external IDs on each item (~40 bytes/item)
- Enables cross-site ID resolution for gap detection and popup metadata

### Badge Completeness Text
- `updateBadgeCompleteness(state)` in `badge.ts` — updates badge text to "Plex : Complete" or "Plex : Incomplete"
- Called by gap-checker after gap detection resolves

### Shared Gap-Checker Module
- `src/common/gap-checker.ts` — centralized gap detection orchestration
- Resolves TMDB ID from any source (tmdb direct, imdb/tvdb via `FIND_TMDB_ID`, title via enriched OwnedItem)
- Handles both movie collection gaps and show episode gaps
- New `findByImdbId` function in `tmdb.ts`
- New `FIND_TMDB_ID` background message handler

### Gap Detection Rollout
- Gap detection now active on all 6 content scripts (all except NZBForYou):
  - TMDB, TVDB: refactored to use shared gap-checker
  - IMDb, NZBGeek, RARGB: added gap detection for owned items
  - PSA: conditional gap detection (only if OwnedItem has tmdbId/tvdbId from enrichment)
- Fixed `removeBadge` import bug in 4 content scripts

### Popup Redesign
- Two-state popup: setup form (unconfigured) → dashboard (configured)
- Dashboard shows: connection status dot, library summary (movies/shows counts), media card for current tab
- Media card displays: TMDB poster thumbnail, title + year, season/episode counts for TV, source ID tags, Plex link
- Tab media cache (`Map<number, TabMediaInfo>`) in background with fire-and-forget TMDB metadata fetch
- `GET_TAB_MEDIA` message handler + `browser.tabs.onRemoved` cleanup
- Enhanced `StatusResponse` with `movieCount` and `showCount` (Set-based dedup for accurate counts)

### Supported Sites Display
- `SiteDefinition` type in `types.ts`
- `DEFAULT_SITES` constant in `src/common/sites.ts` (7 built-in entries)
- Sites table in options page showing name, media type tag, URL pattern

### Lazy Index Loading
- Removed startup auto-refresh in background service worker
- Index is lazy-loaded from storage on first CHECK via `loadIndex()`
- Users refresh manually via popup or options page

### Storage Measurement
- `GET_STORAGE_USAGE` message handler using `navigator.storage.estimate()` (with JSON fallback)
- Options page Cache card displays "Storage: X.X MB / Y MB"
- Updates after refresh, sync, and clear operations

### Test Suite Expansion
- Added `happy-dom` devDependency for DOM testing
- `tests/badge.test.ts` — 20 tests covering `createBadge`, `updateBadge`, `updateBadgeFromResponse`, `showErrorBadge`, `findExistingBadge`, `injectBadge`, `removeBadge`, `updateBadgeCompleteness`
- `tests/plex-integration.test.ts` — 6 tests covering `buildLibraryIndex` with mocked fetch (mixed content, enrichment, title keys, section filtering, missing GUIDs, empty library)
- Total: 70 tests across 5 test files
