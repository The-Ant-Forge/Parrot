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

---

## Phase 11: Bride of QOL

> Spec: [`Phase 11 - Bride of QOL.md`](Phase%2011%20-%20Bride%20of%20QOL.md)

UX polish, dashboard enhancements, dark mode, custom sites, and 5 new content scripts.

### Gap Panel — Show When Complete
- Replaced `expandPanels` option with `showCompletePanels` (default false)
- When enabled, collection and episode panels render even when fully owned
- Background `CHECK_EPISODES` handler now always returns season data (not just when gaps exist)

### Dashboard — IMDb Label & Media Type Tag
- IMDb IDs now prefixed with "IMDb" for consistency with TMDB/TVDB labels
- [Movie]/[Show] tag moved from ID pills row to title row (floated right via `.media-title-row` flexbox)

### Dashboard — Clickable ID Pills
- TMDB, IMDb, TVDB pills are now `<a>` links opening in new tabs
- URLs: TMDB (`themoviedb.org/{movie|tv}/{id}`), IMDb (`imdb.com/title/{id}`), TVDB (`thetvdb.com/dereferrer/series/{id}`)

### Dashboard — Per-Service Status Pills
- Replaced single dot + "Connected"/"Offline" with per-service pills: Plex, TMDB, TVDB
- Each pill shows green dot when active, gray when unconfigured
- TVDB pill only shown when configured
- Extended `StatusResponse` with `tmdbConfigured` and `tvdbConfigured`

### Dashboard — Collection Summary for Movies
- Movies belonging to a TMDB collection show summary below subtitle: "Collection Name — X of Y owned"
- Extended `TabMediaInfo` with `collectionName`, `collectionOwned`, `collectionTotal`
- `fetchTabMetadata` now fetches collection data for movies

### Dashboard — Tab Persistence
- Tab media cache persisted to `browser.storage.session` (survives service worker restarts)
- Session storage capped at 20 entries to prevent unbounded growth
- Cleanup on `tabs.onRemoved` removes from both in-memory Map and session storage

### Dashboard — Sparse Info Bridging
- Popup retries `GET_TAB_MEDIA` after 1 second when metadata (poster) hasn't loaded yet
- Handles race condition where popup opens before async `fetchTabMetadata` completes

### Options — Dark Mode
- CSS custom properties for all colors with `@media (prefers-color-scheme: dark)` override
- Dark values match popup theme (#1a1a1a bg, #eee text, #ebaf00 accent)
- No JS needed — pure CSS, follows OS setting automatically

### Options — Custom Sites
- Storage helpers (`getCustomSites`, `saveCustomSites`) in `storage.ts`
- Add Site form with name, media type, URL pattern, badge selector fields
- Remove button on each custom site row
- Reset Defaults button clears all custom sites
- Custom sites stored in `browser.storage.sync`

### New Content Scripts (5 sites)
- **Letterboxd** (`letterboxd.com/film/*`) — movies, scans DOM links for TMDB/IMDb
- **Trakt** (`trakt.tv/movies/*`, `trakt.tv/shows/*`) — SPA-aware with `observeUrlChanges`, scans DOM links
- **Rotten Tomatoes** (`rottentomatoes.com/m/*`, `rottentomatoes.com/tv/*`) — checks JSON-LD structured data first, then DOM links
- **JustWatch** (`justwatch.com/*/movie/*`, `justwatch.com/*/tv-show/*`) — SPA-aware, scans DOM links
- **TVDB Movies** (`thetvdb.com/movies/*`) — scans DOM links for TMDB/IMDb IDs, complements existing TVDB series script

### Test Suite Expansion
- Added `extractTraktMediaType`, `extractJustWatchMediaType`, `extractRtMediaType` to shared extractors
- 9 new tests for URL-based media type extraction (Trakt, JustWatch, Rotten Tomatoes)
- Total: 79 tests across 5 test files

---

## Phase 12: Code Hygiene

> Spec: [`Phase 12 - Code Hygiene.md`](Phase%2012%20-%20Code%20Hygiene.md)

Post-Phase 11 consolidation: bug fixes, code deduplication, robustness improvements, and cleanup without changing user-facing features.

### Bug Fix: TVDB Metadata Fallback
- Shows existing only on TVDB (not TMDB) now display metadata in popup dashboard
- Added `getSeriesDetails()` to `src/api/tvdb.ts` for direct TVDB metadata fetching
- Added `posterUrl` field to `TabMediaInfo` for TVDB full image URLs
- Popup renders TVDB poster when TMDB poster path unavailable

### Shared Link Scanner
- Extracted `scanLinksForExternalId()` to `src/common/extractors.ts`
- Reuses existing `extractTmdbFromUrl()` and `extractImdbId()` internally
- Proper TVDB regex `/series/(\d+)/` replaces overly broad `\d{4,}` pattern
- Updated 8 content scripts to use shared scanner

### Content Script Bug Fixes
- `tvdb.content.ts` — added `removeCollectionPanel()` call
- `nzbforyou.content.ts` — added gap detection, error badges, panel cleanup, shared extractors
- `nzbgeek.content.ts` — removed debug console.log statements

### Panel Code Deduplication
- Extracted shared panel utilities to `src/common/panel-utils.ts`
- `createPanelContainer()`, `createPanelHeader()`, `createPanelRow()`, `createStatusIcon()`, `injectPanel()`
- Both collection-panel and episode-panel now use shared utilities

### Badge Type Safety
- Changed `setBadgeContent()` to accept `HTMLElement` instead of `HTMLSpanElement`
- Removed unsafe `as unknown as HTMLSpanElement` cast
- Unexported `CompletenessState` type (internal to badge.ts)

### Background.ts Efficiency & Robustness
- Cached `movieCount`/`showCount` in `LibraryIndex` (computed once during build, not on every GET_STATUS)
- Added `.catch()` to fire-and-forget `fetchTabMetadata()` call
- Added explicit radix 10 to all `parseInt()` calls
- Added numeric validation before `parseInt(message.id)`
- Added `console.warn()` to gap-checker silent catch

### Test Suite Expansion
- `tests/scan-links.test.ts` — 10 tests for `scanLinksForExternalId()` (DOM-based, happy-dom)
- Total: 89 tests across 6 test files

---

## Phase 13: Smart Badge with Floating Gap Panel

> Spec: [`Phase 13 - Smart Badge.md`](Phase%2013%20-%20Smart%20Badge.md)

Redesigned the badge as a unified smart pill with four states and moved gap panels to floating overlays anchored to the badge. Zero layout shift, lighter DOM footprint.

### Badge Redesign
- Wrapper+pill architecture: outer `<span data-parrot-badge>` is stable (never replaced), inner `.parrot-pill` rebuilds on state changes
- Four states: gray (not owned), gold (owned), gold with ": Complete" (owned + all gaps filled), gold with ": Incomplete" (owned + gaps exist)
- Split-click interaction: "Plex" part links to Plex Web, ": Complete/Incomplete" part toggles floating gap panel
- `setBadgeGapData()` replaces `updateBadgeCompleteness()` + panel injection

### Floating Gap Panel
- Panels are `position: absolute` children of the badge wrapper instead of block-level DOM elements
- Smart viewport positioning: drops down by default, flips up near bottom, right-aligns near right edge
- Click-outside dismissal via capture-phase document listener
- Panel DOM stays in memory when hidden (preserves expand/collapse state)

### Code Cleanup
- Removed `injectCollectionPanel()`, `removeCollectionPanel()`, `injectEpisodePanel()`, `removeEpisodePanel()`, `injectPanel()` exports
- Removed `anchor` parameter from `GapCheckParams` and all `checkGaps()` calls
- `removeBadge()` now handles all cleanup (panel is a child of badge wrapper)
- Simplified `nzbforyou.content.ts` from multi-badge to single-badge pattern

### Post-Release Bug Fixes
- **Badge visibility:** `createBadge()` set `display: none` but update functions never made wrapper visible. All three (`updateBadge`, `updateBadgeFromResponse`, `showErrorBadge`) now set `display: inline-flex`.
- **Badge vertical alignment:** Added `vertical-align: middle` to wrapper for proper centering within title elements.
- **TVDB old-style URLs:** Link scanner regex `/series/(\d+)/` only matched new-style TVDB URLs. Added second pattern for old-style query parameter format (`?tab=series&id=12345`) used by NZBGeek.

### Test Suite
- Rewrote `tests/badge.test.ts` for wrapper+pill architecture
- Added `setBadgeGapData` tests (completeness text, split-click, toggle, click-outside, aria-expanded, cleanup)
- Added old-style TVDB query parameter URL test
- Total: 99 tests across 6 test files (up from 89)

---

## Rotten Tomatoes Title-Based Matching

Rotten Tomatoes removed all external database links (IMDb, TMDB) and JSON-LD `sameAs` references from their pages. The existing RT content script relied entirely on these IDs and stopped working.

### Fix: Two-Strategy Approach
- **Strategy 1 (kept):** JSON-LD `sameAs` + DOM link scanning for external IDs (backward compatibility in case RT re-adds them)
- **Strategy 2 (new, primary):** Title-based matching from URL slug, same approach as PSA content script
  - Extracts slug from `/m/{slug}` or `/tv/{slug}` URL paths
  - Uses `parseSlug()` + `buildTitleKey()` for title normalization and matching
  - Year-aware fallback: if year present in slug but no match, retries without year
  - Gap detection supported when owned item has enriched TMDB/TVDB IDs

### `parseSlug()` Underscore Support
- Updated `parseSlug()` in `normalize.ts` to handle underscore-separated slugs (RT uses `_` not `-`)
- Year regex updated: `/[-_](\d{4})$/` matches both `some-title-2025` and `some_title_2025`
- Title regex updated: `/[-_]/g` converts both hyphens and underscores to spaces

### Badge Anchor Update
- Changed badge anchor from `slot[name="title"]` to `div.title slot[name="title"]` for more precise placement

### Test Suite
- Added 3 underscore slug tests to `tests/normalize.test.ts`
- Total: 102 tests across 6 test files (up from 99)
