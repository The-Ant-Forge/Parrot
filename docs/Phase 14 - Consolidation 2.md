# Phase 14: Consolidation 2 — Code Hygiene & Reliability

## Goal

Second round of code consolidation following the v1.7 feature cycle (TVMaze, NFD normalization, PSA h1 fallback, title-based collection gaps). Focus on deduplication, reliability, unused code removal, and best practices — without changing user-facing behaviour.

---

## Findings

### 1. Duplicated Functions

#### 1a. `parseTitleFromH1()` — identical in two files

**Files:** `psa.content.ts:9-23`, `justwatch.content.ts:31-45`

Both parse a year suffix from h1 text like `"Some Title (2026)"` and return `{ title, year }`. The implementations are character-for-character identical.

**Recommendation:** Extract to `src/common/normalize.ts` as `parseTitleFromH1()` alongside the existing `parseSlug()`. Both content scripts import from there.

**Impact:** Low risk. Pure function, easy to test.

---

#### 1b. `waitForElement()` / `waitForAnchor()` — similar MutationObserver wait patterns

**Files:** `trakt-app.content.ts:9-27` (`waitForElement(selector, timeout)`), `justwatch.content.ts:10-28` (`waitForAnchor(timeout)` — hardcoded to `h1`)

Both use the same MutationObserver pattern to wait for an element to appear in the DOM. `waitForElement` is the more general version; `waitForAnchor` is a specialised version that only queries `h1`.

**Recommendation:** Extract `waitForElement(selector, timeout)` to `src/common/dom-utils.ts`. JustWatch calls `waitForElement("h1")` instead of its bespoke function.

**Impact:** Low risk. DOM utility, straightforward refactor.

---

#### 1c. `findExternalId()` — identical JSON-LD parser in two files

**Files:** `metacritic.content.ts:9-28`, `rottentomatoes.content.ts:9-28`

Both scan JSON-LD `sameAs` for IMDb IDs, then fall back to `scanLinksForExternalId()`. The implementations are identical.

**Recommendation:** Extract to `src/common/extractors.ts` as `findExternalIdFromJsonLd()` or similar. Both content scripts import from there.

**Impact:** Low risk. DOM-dependent but straightforward to extract.

---

#### 1d. Title-based CHECK with year fallback — repeated in 4 files

**Files:** `psa.content.ts:25-50` (`tryTitleCheck()`), `justwatch.content.ts:113-147`, `rottentomatoes.content.ts:98-114`, `metacritic.content.ts:96-112`

All implement the same pattern: send CHECK with `source: "title"` and titleKey, if no match and year was present, retry without year. PSA has it as a named function; the other three inline it.

**Recommendation:** PSA's `tryTitleCheck(mediaType, title, year)` is the cleanest version. Extract to a shared module (perhaps `src/common/title-check.ts` or add to an existing common file). The 4 content scripts call the shared function instead.

**Impact:** Medium. Requires `browser.runtime.sendMessage` which works in content scripts. The function is async but stateless.

---

#### 1e. IMDb media type fallback — repeated in 6+ files

**Files:** `trakt.content.ts:34-43`, `trakt-app.content.ts:57-65`, `justwatch.content.ts:78-86`, `rottentomatoes.content.ts:61-69`, `metacritic.content.ts:59-67`, `rargb.content.ts:30-38`

All implement: if not owned and source is IMDb, try opposite media type. The pattern is:
```typescript
if (!response.owned && extId.source === "imdb") {
  resolvedType = mediaType === "movie" ? "show" : "movie";
  response = await browser.runtime.sendMessage({ type: "CHECK", ... });
}
```

**Recommendation:** Consider extracting, but this one is borderline. The logic is tightly coupled with the surrounding code (managing `resolvedType` variable). Could extract as `checkWithImdbFallback(mediaType, id)` but the gain vs. complexity is marginal.

**Decision:** Defer — the pattern is simple and self-contained within each file.

---

### 2. Debug Logging

#### 2a. TMDB content script verbose logging

**File:** `tmdb.content.ts:12, 23, 35, 47`

Four console statements logging extraction, anchor selection, response, and errors. No other content script logs at this level.

**Recommendation:** Remove lines 12, 23, 35. Keep line 47 (`console.error` for actual errors) — all content scripts should log errors consistently.

**Impact:** None. Reduces console noise.

---

#### 2b. Background service worker logging

**File:** `background.ts` — approximately 15 `console.log` statements

The background has legitimate diagnostic logging (index load stats, auto-refresh, CHECK results, episode gap summaries). These are useful for debugging but verbose for production.

**Recommendation:** Keep as-is. Background logging is only visible in the service worker console (not the page console), and it's valuable for troubleshooting library matching issues. Removing it would make user bug reports harder to diagnose.

**Decision:** No change.

---

### 3. Spec Discrepancy (fixed during investigation)

**Issue:** `FIND_TMDB_ID` message type in `Parrot spec.md` included a `mediaType` field that doesn't exist in the actual type definition (`src/common/types.ts:108`).

**Status:** Fixed — spec updated to match implementation.

---

### 4. Deprecated Code

#### 4a. `PlexConfig` interface

**File:** `types.ts:11-16`

Marked `@deprecated`, used only in `storage.ts:39` for one-time migration from single-server to multi-server format. The migration deletes the old config after converting it.

**Recommendation:** Keep for now. Removing it would break migration for any user who hasn't opened the extension since the multi-server update. Can be removed in a future major version (v2.0) when breaking changes are acceptable.

**Decision:** No change this phase.

---

### 5. Unused Exports

#### 5a. `updateBadge()` and `createBadge()` — NOT unused

Investigation confirmed both are actively used:
- `createBadge()` is called by `injectBadge()`
- `updateBadge()` is the foundation for `updateBadgeFromResponse()` and `showErrorBadge()`

Both are exported and could theoretically be un-exported (made module-private), but they're also used in tests.

**Decision:** No change.

---

### 6. Error Handling Consistency

#### 6a. Silent catch vs. logged catch

Most content scripts use bare `catch { showErrorBadge(...) }` without logging, while PSA logs `console.error("Parrot PSA: error", err)`.

**Current state:**
- **Log errors:** `tmdb.content.ts`, `psa.content.ts`
- **Silent catch:** All other content scripts (13 files)

**Recommendation:** Standardise on logging. Add `console.error("Parrot {siteName}: error", err)` to all catch blocks. This helps users and developers diagnose issues without adding visible UI noise.

**Impact:** Low. Adds diagnostic information without affecting behaviour.

---

#### 6b. Gap checker error swallowing

**File:** `gap-checker.ts:46, 82, 136`

`resolveTmdbMovieId` logs a warning on failure (`console.warn`), while `checkMovieGaps` and `checkShowGaps` log errors. However, all three swallow exceptions silently — the caller never knows gap detection failed.

**Recommendation:** Acceptable as-is. Gap detection is best-effort and non-critical. The badge already shows ownership status; gap data is supplementary. Surfacing gap errors to the user would be confusing.

**Decision:** No change.

---

### 7. Type Safety

#### 7a. No `any` types found

The codebase has zero `any` type annotations — good discipline.

#### 7b. Storage casts without validation

**File:** `storage.ts` — multiple `as LibraryIndex`, `as PlexServerConfig[]`, etc.

Data read from `browser.storage` is cast without runtime validation. If storage is corrupted or has an old schema, this could cause runtime errors.

**Recommendation:** Low priority. Storage is written by the extension itself (not user-editable), and schema migrations handle format changes. Adding runtime validation (e.g., Zod) would add bundle size for minimal benefit.

**Decision:** No change this phase.

---

### 8. Security & Code Safety

#### 8a. JSON-LD parsing

**Files:** `metacritic.content.ts:14`, `rottentomatoes.content.ts:14`

`JSON.parse(script.textContent ?? "")` is wrapped in try-catch, which is correct. The parsed data is only read for specific string properties (`sameAs`), not executed. No injection risk.

**Status:** Safe as-is.

#### 8b. URL construction

**Files:** `tmdb.ts`, `tvdb.ts`, `tvmaze.ts`, `plex.ts`

API URLs are constructed with `encodeURIComponent()` where user input is involved (API keys, search queries). Template literals for numeric IDs (TMDB movie IDs, TVDB series IDs) are safe since they're validated upstream.

**Status:** Safe as-is.

#### 8c. `host_permissions` scope

**File:** `wxt.config.ts`

Permissions are scoped to specific API domains (`api.themoviedb.org`, `api4.thetvdb.com`, `api.tvmaze.com`) plus the user's Plex server (`https://*/library/*`). The Plex pattern is broad but necessary since server URLs are user-configured.

**Status:** Acceptable. The Plex pattern could be tightened with dynamic `host_permissions` registration, but that adds complexity for minimal security benefit since the token is already user-supplied.

---

### 9. Potential Code Efficiency Improvements

#### 9a. `extractSlug()` duplication

**Files:** `rottentomatoes.content.ts:30-33`, `metacritic.content.ts:30-33`

Both extract a slug from a URL path with slightly different regex patterns (`/(?:m|tv)/` vs `/(?:movie|tv)/`). These are similar but not identical — site-specific.

**Recommendation:** Leave as-is. The regex differences reflect genuine URL format differences between sites. Extracting would require parameterisation that's harder to read than the current inline version.

**Decision:** No change.

---

#### 9b. `getOptions()` called in every gap check

Every content script calls `getOptions()` before `checkGaps()` to read `showCompletePanels`. The options are fetched from `browser.storage.sync` on every page load.

**Recommendation:** Could be moved inside `checkGaps()` itself, removing the need for callers to fetch and pass it. This would simplify all 16 content scripts.

**Impact:** Low risk. Reduces boilerplate in every content script.

---

### 10. Test Coverage Gaps

#### Current: 129 tests across 7 files

**Well-tested:**
- URL/ID extractors (`extractors.test.ts` — 37 tests)
- Title normalization (`normalize.test.ts` — 23 tests)
- Badge injection and state management (`badge.test.ts` — 29 tests)
- Link scanner (`scan-links.test.ts` — 16 tests)
- Plex GUID parsing (`plex.test.ts` — 8 tests)
- Library index building (`plex-integration.test.ts` — 9 tests)
- Episode panel grouping (`episode-panel.test.ts` — 7 tests)

**Not tested:**
- `gap-checker.ts` — core gap detection orchestration (would need browser.runtime mocking)
- `url-observer.ts` — MutationObserver logic
- `tvmaze.ts` — API client (would need fetch mocking)
- `tmdb.ts` — `searchMovie()` (new function, would need fetch mocking)
- No content script integration tests

**Recommendation:** Add unit tests for `searchMovie()` and `parseTitleFromH1()` (once extracted) since these are new, testable pure/near-pure functions. `gap-checker.ts` testing would require significant mocking infrastructure — defer unless bugs surface.

---

## Prioritised Work Items

### High Priority (do first)

| # | Item | Files | Risk | Benefit |
|---|------|-------|------|---------|
| 1 | Extract `parseTitleFromH1()` to `normalize.ts` | `normalize.ts`, `psa.content.ts`, `justwatch.content.ts` | Low | Dedup, testable |
| 2 | Extract `waitForElement()` to `dom-utils.ts` | New `dom-utils.ts`, `trakt-app.content.ts`, `justwatch.content.ts` | Low | Dedup, reusable |
| 3 | Extract `findExternalIdFromJsonLd()` to `extractors.ts` | `extractors.ts`, `metacritic.content.ts`, `rottentomatoes.content.ts` | Low | Dedup |
| 4 | Remove TMDB content script debug logging | `tmdb.content.ts` | None | Cleaner output |

### Medium Priority (do second)

| # | Item | Files | Risk | Benefit |
|---|------|-------|------|---------|
| 5 | Extract `tryTitleCheck()` to shared module | New or existing common file, 4 content scripts | Medium | Dedup, DRY |
| 6 | Standardise error logging in catch blocks | 13 content scripts | Low | Diagnostics |
| 7 | Move `showCompletePanels` fetch inside `checkGaps()` | `gap-checker.ts`, 16 content scripts | Low | Less boilerplate |
| 8 | Add tests for `parseTitleFromH1()` and `searchMovie()` | `normalize.test.ts` | None | Coverage |

### Low Priority / Defer

| # | Item | Reason to defer |
|---|------|-----------------|
| 9 | Remove `PlexConfig` deprecated type | Migration safety — wait for v2.0 |
| 10 | IMDb media type fallback extraction | Marginal gain, adds indirection |
| 11 | Storage validation (Zod or similar) | Bundle size cost, low real-world risk |
| 12 | `gap-checker.ts` tests | Heavy mocking needed, defer until bugs surface |
| 13 | `url-observer.ts` tests | Needs MutationObserver mocking |

---

## Files Summary

| File | Action |
|------|--------|
| `src/common/normalize.ts` | Add `parseTitleFromH1()` |
| `src/common/dom-utils.ts` | **New** — `waitForElement()` |
| `src/common/extractors.ts` | Add `findExternalIdFromJsonLd()` |
| `src/common/gap-checker.ts` | Inline `getOptions()` for `showCompletePanels` |
| `src/entrypoints/psa.content.ts` | Import shared `parseTitleFromH1`, `tryTitleCheck` |
| `src/entrypoints/justwatch.content.ts` | Import shared `parseTitleFromH1`, `waitForElement`, `tryTitleCheck` |
| `src/entrypoints/trakt-app.content.ts` | Import shared `waitForElement` |
| `src/entrypoints/metacritic.content.ts` | Import shared `findExternalIdFromJsonLd`, `tryTitleCheck` |
| `src/entrypoints/rottentomatoes.content.ts` | Import shared `findExternalIdFromJsonLd`, `tryTitleCheck` |
| `src/entrypoints/tmdb.content.ts` | Remove debug console.log (lines 12, 23, 35) |
| 13 content scripts | Add `console.error` to bare catch blocks |
| `tests/normalize.test.ts` | Add `parseTitleFromH1()` tests |
