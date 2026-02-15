# Phase 10: Quality of Life

## Goal

UX polish, broader gap detection coverage, an informative popup dashboard, and user-configurable site support. Also picks up deferred items from Phase 9 (lazy index loading, storage measurement, badge DOM tests, integration test).

---

## What's changing

### 1. TVDB API key bug fix

**Problem:** Validating the TVDB key shows "Valid" but doesn't persist — the "Save Options" button is in a separate card. Users assume validation implies saving.

**Fix:** Auto-save all options after successful TMDB or TVDB validation. Extract `saveAllOptions()` helper reused by validate handlers and Save Options button.

### 2. Panel width

Replace `maxWidth: 400px` with `width: fit-content; max-width: 100%` on both collection and episode panels so they shrink-wrap to content instead of stretching.

### 3. Auto-expand panels option

New `expandPanels` boolean in `ParrotOptions` (default: false). When true, gap panels render with body visible by default instead of collapsed.

- Panel creation functions gain `expanded` param
- Content scripts read option via `getOptions()` and pass it through
- Options page gets a new toggle in the Gap Detection card

### 4. Enrich OwnedItem with external IDs

Add optional `tmdbId`, `tvdbId`, `imdbId` fields to `OwnedItem`. `buildLibraryIndex` already extracts these from GUIDs — just store them on each item.

Foundational for popup media card (showing all source IDs), PSA gap detection (cross-referencing title matches), and future cross-site lookups.

### 5. Badge completeness text

After gap check resolves, update badge text:

| State | Badge |
|-------|-------|
| Not owned | Gray "Plex" (unchanged) |
| Owned, no gap check | Gold "Plex" (unchanged) |
| Owned, complete | "Plex : Complete" |
| Owned, incomplete | "Plex : Incomplete" |

New `updateBadgeCompleteness(state)` function finds the existing badge (span or anchor) and updates its text span.

### 6. Gap detection rollout

Bring collection and episode gap checking to all sites (except NZBForYou — multi-badge layout).

**New shared module:** `src/common/gap-checker.ts`
- `checkGaps({ mediaType, source, id, anchor, owned, ownedItem, expandPanels })`
- Movies: resolves TMDB ID (direct, cross-ref via new `FIND_TMDB_ID` message, or from enriched OwnedItem), calls `CHECK_COLLECTION`
- Shows + owned: calls `CHECK_EPISODES` with best available source
- Injects panels and updates badge completeness

**New TMDB API function:** `findByImdbId` — uses TMDB `/find/{id}?external_source=imdb_id`

**New background message:** `FIND_TMDB_ID` — cross-references IMDb/TVDB IDs to TMDB IDs

| Site | Gap support |
|------|-------------|
| TMDB | Refactor to use shared gap-checker |
| TVDB | Refactor to use shared gap-checker |
| IMDb | Add — cross-ref to TMDB for collections, direct for episodes |
| NZBGeek | Add — uses whatever source ID it found from page links |
| RARGB | Add — uses whatever source ID it found from page links |
| PSA | Add — conditional, only if enriched OwnedItem has external IDs |
| NZBForYou | Skip — multi-badge layout |

### 7. Popup redesign

Two-state popup replacing the current setup-only design.

**State A — Not configured:** Same Plex URL/token setup form.

**State B — Configured (dashboard):**
- Connection status (green/red dot)
- Library summary ("1234 Movies · 567 Shows")
- Media card on supported pages: poster, title, year, TV metadata, source IDs
- Compact footer: `[ Refresh | 7414 items · 10d ago ]`

**Architecture:**
- Background caches last CHECK result + TMDB metadata per tab (`Map<number, TabMediaInfo>`)
- New `GET_TAB_MEDIA` message returns cached info for the active tab
- TMDB API extensions: `getMovieDetails` (poster, release date), extended `TMDBTvShow` (poster, status)
- `StatusResponse` enhanced with `movieCount` and `showCount`
- Tab cleanup via `browser.tabs.onRemoved`

### 8. User-configurable sites

Allow users to define custom sites for badge injection.

**SiteDefinition type:** `{ id, name, urlPattern, idExtraction, urlRegex?, mediaType, badgeSelector, isBuiltin, enabled }`

**Dynamic registration approach:**
- Manifest: `permissions: ["storage", "scripting"]`, `optional_host_permissions: ["*://*/*"]`
- Options page calls `browser.permissions.request()` on add — Chrome prompts for per-origin permission
- Background registers universal content script via `browser.scripting.registerContentScripts()`
- Universal content script reads definitions from storage, matches URL, scans links or uses regex, sends CHECK, injects badge

**Settings UI:**
- New "Sites" card in options page with table
- Built-in sites: read-only rows with enable/disable toggle
- Custom sites: full CRUD (name, URL pattern, badge selector, ID method)
- "Restore Defaults" button removes custom sites, re-enables builtins

### 9. Lazy index loading

Remove startup auto-refresh (background lines 168-184). Index is already lazy-loaded by `loadIndex()` on first CHECK. Manual refresh via popup/options.

### 10. Storage measurement

New `GET_STORAGE_USAGE` message. Options page Cache card shows "Storage: 1.2 MB / 10 MB". Uses `navigator.storage.estimate()` with fallback to index JSON size.

### 11. Tests

**Badge DOM tests** (`tests/badge.test.ts`):
- `happy-dom` devDependency for DOM environment
- Tests for `createBadge`, `updateBadge`, `updateBadgeFromResponse`, `showErrorBadge`, `findExistingBadge`, `injectBadge`, `updateBadgeCompleteness`

**buildLibraryIndex integration test** (`tests/plex-integration.test.ts`):
- Mock `fetch` globally with `vi.fn()`
- Verify lookup maps and OwnedItem enrichment

---

## Files summary

### New files
| File | Purpose |
|------|---------|
| `src/common/gap-checker.ts` | Shared gap detection orchestration |
| `src/common/sites.ts` | Default site definitions constant |
| `src/entrypoints/universal.content.ts` | Generic content script for user-defined sites |
| `tests/badge.test.ts` | Badge DOM tests |
| `tests/plex-integration.test.ts` | Index build integration test |

### Modified files
| File | Key changes |
|------|------------|
| `src/common/types.ts` | OwnedItem enrichment, SiteDefinition, expandPanels, new messages |
| `src/common/badge.ts` | `updateBadgeCompleteness()` |
| `src/common/storage.ts` | Site definition helpers |
| `src/common/collection-panel.ts` | Width fix, expanded param |
| `src/common/episode-panel.ts` | Width fix, expanded param |
| `src/api/plex.ts` | OwnedItem enrichment in buildLibraryIndex |
| `src/api/tmdb.ts` | `findByImdbId()`, `getMovieDetails()`, extended TvShow |
| `src/entrypoints/background.ts` | Tab media cache, new handlers, lazy loading, script registration |
| `src/entrypoints/tmdb.content.ts` | Use shared gap-checker |
| `src/entrypoints/tvdb.content.ts` | Use shared gap-checker |
| `src/entrypoints/imdb.content.ts` | Add gap detection |
| `src/entrypoints/nzbgeek.content.ts` | Add gap detection |
| `src/entrypoints/rargb.content.ts` | Add gap detection |
| `src/entrypoints/psa.content.ts` | Add conditional gap detection |
| `src/entrypoints/popup/*` | Complete redesign |
| `src/entrypoints/options/*` | Auto-save, sites table, expand toggle, storage display |
| `wxt.config.ts` | scripting permission, optional_host_permissions |
| `package.json` | happy-dom devDependency |
| `vitest.config.ts` | DOM test environment |
