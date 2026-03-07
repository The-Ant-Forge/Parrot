# Code Review — 2026-03-06

Comprehensive audit of all source, tests, build config, and metadata.

---

## Summary Table

| # | Category | Description | Impact | Effort | Risk | Status |
|---|----------|-------------|--------|--------|------|--------|
| 1 | Missing Config | OMDb API missing from host_permissions | High | Trivial | None | **Done** |
| 2 | Duplication | Plex link creation repeated in badge.ts (2 paths) | Medium | Low | Low | **Done** |
| 3 | Duplication | `webkitTextStroke: "0"` scattered across 5 locations | Medium | Low | Low | **Done** (reduced to 3 via #2) |
| 4 | Duplication | Content script patterns repeated 7-9 times (IMDb fallback, title merge, ownership listener, gap check with movie fallback) | High | High | Medium | **Done** (A, C, D — B deferred) |
| 5 | Performance | `scanLinksForExternalId` uses `sources.includes()` — should be Set | Low | Trivial | None | **Done** |
| 6 | Robustness | `observeUrlChanges` creates MutationObserver with no cleanup | Medium | Low | Low | **Done** |
| 7 | Robustness | `setupClickOutside` could accumulate listeners if called twice | Low | Trivial | None | **Done** |
| 8 | Error Handling | ~8 silent catches in background.ts cross-reference paths — no debug logging | Medium | Low | None | **Done** |
| 9 | Error Handling | gap-checker.ts line 86 swallows icon update error silently | Low | Trivial | None | **Done** |
| 10 | Config | ESLint doesn't lint tests/ or config files | Low | Trivial | None | **Done** |
| 11 | Test Coverage | ~45 exported functions have zero test coverage (API modules, storage, panel-utils, ui-helpers, gap-checker, etc.) | High | High | None | **Partial** (67 new tests) |
| 12 | Performance | `background.ts` movieCount/showCount uses `.concat()` to build intermediate arrays | Low | Trivial | None | **Done** |
| 13 | Naming | `PLEX_ICON_SVG` is a function, not a constant | Low | Trivial | None | **Done** |

---

## Detailed Findings

### 1. Missing OMDb Host Permission (Critical)

**File:** `wxt.config.ts` lines 13-20

`host_permissions` lists TMDB, TVDB, TVMaze, and GitHub APIs but omits OMDb (`https://www.omdbapi.com/*`). The `src/api/omdb.ts` module calls `fetch()` directly to this domain from the service worker. Without the permission, Chrome will block these requests.

**Fix:** Add `"https://www.omdbapi.com/*"` to host_permissions.

**Resolution:** Fixed in `fbfc887`. Added to `wxt.config.ts` host_permissions.

---

### 2. Plex Link Creation Duplicated (badge.ts)

**File:** `badge.ts` lines 102-119 vs 327-343

The `<a>` element with PLEX_LINK_CLASS, identical styling, SVG icon, and "Plex" text is created in two places:
- `setPillContent()` (simple pill, no gap data)
- `setBadgeGapData()` (split-click pill with gap toggle)

Both were independently patched with `webkitTextStroke: "0"` in separate commits.

**Fix:** Extract `createPlexLink(url: string, iconColor: string): HTMLAnchorElement` helper. Both paths call it.

**Resolution:** Fixed in `fbfc887`. Extracted `createPlexLink()` helper in `badge.ts`; both `setPillContent()` and `setBadgeGapData()` now call it.

---

### 3. webkitTextStroke Scattered

**Locations:**
- `badge.ts` `applyPillStyles()` — pill container
- `badge.ts` `setPillContent()` Plex link — line 116
- `badge.ts` `setBadgeGapData()` Plex link — line 340
- `panel-utils.ts` `CSS_RESET` — panel elements
- `collection-panel.ts` plexLink style — line 53

Five separate `webkitTextStroke: "0"` assignments. If fix #2 extracts a helper, that reduces to 4. `badge.ts` could also import `CSS_RESET` from `panel-utils.ts` instead of inline resets.

**Fix:** After extracting `createPlexLink`, apply reset there once. Consider whether `applyPillStyles` needs it separately (it does — it covers the non-link text spans).

**Resolution:** Fixed in `fbfc887`. Reduced from 5 to 3 locations via the `createPlexLink()` extraction (#2). Remaining 3 are structurally necessary (pill container, panel CSS reset, collection panel link).

---

### 4. Content Script Duplication (High effort)

Four patterns are repeated across 7-17 content scripts:

**A. IMDb fallback** (7 scripts): Try CHECK with detected mediaType, if not found and source is IMDb, retry with opposite type. Appears in: imdb, trakt, metacritic, rottentomatoes, plex-app, justwatch, rargb.

**B. Title merge** (5 scripts): Merge slug + DOM h1 title, extract year, call tryTitleCheck with fallback. Appears in: metacritic, rottentomatoes, iplayer, psa, justwatch.

**C. Ownership update listener** (5 scripts): `onOwnershipUpdated()` with identical callback body calling `checkGaps`. Appears in: iplayer, metacritic, rottentomatoes, psa, justwatch.

**D. Gap check with movie fallback** (9 scripts): If owned, checkGaps with resolved type; if not owned, always call with `"movie"` to catch collection gaps. Appears in: imdb, trakt, metacritic, rottentomatoes, plex-app, justwatch, rargb, nzbforyou, nzbgeek.

**Fix:** Extract shared helpers into `common/`. This is the biggest win but highest effort — each content script has slight variations. Recommend tackling one pattern at a time, starting with (D) which is the most uniform.

**Note:** This was already flagged in TODO.md as "Extract IMDb media type fallback pattern to shared function (6+ files)". Patterns B, C, D are additional consolidation opportunities.

**Resolution:** Patterns A, C, D fixed in `5cc06e0`. Created `src/common/check-helpers.ts` with three shared helpers: `checkWithImdbFallback()` (pattern A), `setupOwnershipListener()` (pattern C), and `checkGapsWithFallback()` (pattern D). Applied across 8 content scripts, removing ~113 lines of duplication. Pattern B (title merge) deferred — each site has enough variation to make a shared helper awkward.

---

### 5. scanLinksForExternalId Performance

**File:** `extractors.ts` lines 140-190

Inner loop checks `sources.includes(source)` for each link — O(n) per link. Sources array is small (3-4 items) so real-world impact is negligible, but converting to `Set` is trivial.

**Fix:** `const sourceSet = new Set(sources);` then `sourceSet.has()`.

**Resolution:** Fixed in `fbfc887`. Converted to `Set` with `.has()` lookup.

---

### 6. observeUrlChanges — No Cleanup

**File:** `url-observer.ts` lines 6-20

Creates a `MutationObserver` on `document.body` but provides no way to disconnect it. Content scripts that call this can't clean up on navigation. In practice, content scripts are destroyed on navigation anyway (MV3), so the leak is theoretical.

**Fix:** Return a cleanup function: `return () => observer.disconnect();`. Low effort, good practice.

**Resolution:** Fixed in `fbfc887`. `observeUrlChanges()` now returns a cleanup function.

---

### 7. Click-Outside Listener Guard

**File:** `badge.ts` `setupClickOutside()` lines 182-189

If `showPanel()` were called twice without `hidePanel()` in between, a second document click listener would be added. Current code flow prevents this (hidePanel is called in setBadgeGapData before rebuilding), but a guard would be safer.

**Fix:** Add `if (clickOutsideHandler) teardownClickOutside();` at the top of `setupClickOutside()`.

**Resolution:** Fixed in `fbfc887`. Added guard at the top of `setupClickOutside()`.

---

### 8. Silent Catches in background.ts

**Lines:** 76-78, 285-287, 318-320, 337-339, 426

Cross-reference fallback paths (TMDB, TVMaze, IMDb) catch errors silently with comments like `// cross-reference failed`. No `debugLog()` calls, making troubleshooting difficult when a user reports "badge didn't appear".

**Fix:** Add `debugLog("BG", "cross-reference failed", err)` to each catch block.

**Resolution:** Fixed in `fbfc887`. Added `debugLog()` calls to all ~8 silent catch blocks in `background.ts`.

---

### 9. Gap-Checker Silent Catch

**File:** `gap-checker.ts` line 86

```typescript
.catch(() => {});
```

Icon update error swallowed with no logging.

**Fix:** `.catch(() => debugLog("GapChecker", "icon update failed"))`.

**Resolution:** Fixed in `fbfc887`. Added `debugLog()` to the gap-checker catch block.

---

### 10. ESLint Scope

**File:** `eslint.config.js` line 6

Only lints `src/**/*.ts`. Doesn't cover `tests/**/*.ts`, `*.config.ts`, or itself.

**Fix:** Expand `files` glob to include test and config files.

**Resolution:** Fixed in `fbfc887`. ESLint `files` glob expanded to include `tests/**/*.ts` and `*.config.ts`.

---

### 11. Test Coverage Gaps

**152 tests pass** but coverage is concentrated in a few modules:

| Module | Tested | Untested Exports |
|--------|--------|------------------|
| extractors.ts | 10/11 functions | `findExternalIdFromJsonLd` |
| normalize.ts | Full | — |
| badge.ts | 8/10 functions | `updateRatings`, `onOwnershipUpdated` |
| plex.ts | 3/7 functions | `testConnection`, `fetchLibrarySections`, `fetchSectionItems`, `fetchShowEpisodes` |
| All API modules | 0% | tmdb (8), tvdb (3), tvmaze (3), omdb (2) = 16 functions |
| storage.ts | 0% | 15 functions |
| gap-checker.ts | 0% | 1 function (needs browser.runtime mock) |
| panel-utils.ts | 0% | 4 functions |
| ui-helpers.ts | 0% | 4 functions |
| collection-panel.ts | 0% | 1 function |
| episode-panel.ts | 0% | 1 function (partially tested) |
| title-check.ts | 0% | 1 function |

API modules and storage are the biggest gaps. They require mocking `fetch` and `browser.storage` respectively.

**Recommendation:** Prioritise API module tests (they're pure functions with fetch mocking) and ui-helpers tests (pure DOM, easy to test).

**Resolution:** Partially addressed in `175c63b`. Added 67 new tests across 5 new test files: `api-tmdb.test.ts` (22), `api-tvmaze.test.ts` (11), `api-omdb.test.ts` (11), `ui-helpers.test.ts` (11), `panel-utils.test.ts` (12). Remaining gaps: TVDB API, storage module, gap-checker, collection-panel, title-check (deferred as ongoing work).

---

### 12. movieCount/showCount Allocation

**File:** `background.ts` lines 306-312 (in `buildLibraryIndex` within `plex.ts`)

Actually traced to `plex.ts` — uses `.concat()` to merge three `Object.values()` arrays before feeding to `new Set()`. Creates intermediate arrays unnecessarily.

**Fix:** Build Set incrementally with `forEach` instead of concat+spread.

**Resolution:** Fixed in `fbfc887`. Replaced `.concat()` chains with incremental `Set` building via `forEach`.

---

### 13. PLEX_ICON_SVG Naming

**File:** `badge.ts` line 11

`PLEX_ICON_SVG` is named like a constant (UPPER_SNAKE) but is actually a function that takes an `iconColor` parameter. Misleading.

**Fix:** Rename to `plexIconSvg` or `createPlexIconSvg`.

**Resolution:** Fixed in `fbfc887`. Renamed to `createPlexIconSvg()`.

---

## Out of Scope (noted for TODO.md)

- Comprehensive API module test suite (large effort, separate task)
- Storage module test suite (needs browser mock infrastructure)
- Content script E2E testing (requires browser automation)
- tsconfig strictness additions (`noUnusedLocals`, `noUnusedParameters`)

---

## Recommended Implementation Order

1. **#1 — OMDb permission** (critical, 1 line)
2. **#8 + #9 — Debug logging in catches** (quick wins, better diagnostics)
3. **#2 + #3 — Extract createPlexLink helper** (reduces duplication and webkitTextStroke scatter)
4. **#7 — Click-outside guard** (1 line)
5. **#5 — Set in scanLinks** (trivial)
6. **#6 — Observer cleanup return** (low effort)
7. **#10 — ESLint scope** (trivial)
8. **#13 — PLEX_ICON_SVG rename** (trivial)
9. **#12 — Set allocation** (trivial)
10. **#4 — Content script consolidation** (high effort, do separately)
11. **#11 — Test coverage** (ongoing, separate task)
