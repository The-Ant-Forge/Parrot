# Phase 9: Consolidation — Polish & Reliability

## Goal

Harden the extension with unit test coverage, better error feedback, and performance improvements — without changing any user-facing features.

---

## What changed

### 1. Unit test foundation

Vitest was installed but had zero tests. Added `vitest.config.ts` and 44 unit tests across 3 test files covering all pure extraction and normalization logic.

**Files created:**
- `vitest.config.ts` — Vitest configuration (globals, path aliases)
- `tests/extractors.test.ts` — 19 tests for URL/ID extraction functions
- `tests/normalize.test.ts` — 17 tests for title normalization and slug parsing
- `tests/plex.test.ts` — 8 tests for Plex GUID extraction

### 2. Shared extractors module

Pure URL extraction functions were duplicated as private functions inside individual content scripts, making them untestable. Extracted into a shared module.

**File created:** `src/common/extractors.ts`

| Function | Moved from | Purpose |
|----------|------------|---------|
| `extractTmdbFromUrl` | `tmdb.content.ts` | TMDB movie/TV ID from URL |
| `extractImdbId` | `imdb.content.ts` | IMDb tt-ID from URL |
| `extractPsaFromUrl` | `psa.content.ts` | PSA media type + slug from URL |
| `extractNzbgeekMediaType` | `nzbgeek.content.ts` | Movie/show from query params |

DOM-coupled extractors (TVDB, RARGB, NZBForYou) remain in their content scripts — they scan page links via `querySelectorAll` and aren't pure functions.

### 3. Debounced MutationObserver

TMDB, IMDb, and TVDB content scripts used identical inline MutationObserver code to detect SPA navigation. Each fired on every DOM mutation with no debouncing, potentially triggering redundant `checkAndBadge()` calls during navigation transitions.

**File created:** `src/common/url-observer.ts`

Provides `observeUrlChanges(handler, debounceMs?)` — a 150ms trailing-edge debounce that coalesces SPA mutation bursts while feeling instant to the user. Replaces duplicated code in all three SPA-aware content scripts.

### 4. Error badge with tooltip

The badge module defined an `"error"` state (red pill, "!" text) but no content script ever used it — they all called `removeBadge()` on error, leaving the user with no indication something went wrong.

**Changes to `src/common/badge.ts`:**
- `updateBadge()` now accepts an optional `tooltip` parameter (sets `badge.title`)
- New `showErrorBadge(badge, reason)` convenience function

**Content script changes:** Six content scripts now show a red error badge with hover tooltip "Could not check Plex library" instead of silently removing the badge. Exception: `nzbforyou.content.ts` keeps `removeAllBadges()` since it injects multiple badges.

---

## Files summary

| File | Action |
|------|--------|
| `vitest.config.ts` | **Created** |
| `src/common/extractors.ts` | **Created** |
| `src/common/url-observer.ts` | **Created** |
| `tests/extractors.test.ts` | **Created** |
| `tests/normalize.test.ts` | **Created** |
| `tests/plex.test.ts` | **Created** |
| `src/common/badge.ts` | Modified — tooltip + `showErrorBadge` |
| `src/entrypoints/tmdb.content.ts` | Modified — extractor, url-observer, error badge |
| `src/entrypoints/imdb.content.ts` | Modified — extractor, url-observer, error badge |
| `src/entrypoints/tvdb.content.ts` | Modified — url-observer, error badge |
| `src/entrypoints/psa.content.ts` | Modified — extractor, error badge |
| `src/entrypoints/nzbgeek.content.ts` | Modified — extractor, error badge |
| `src/entrypoints/rargb.content.ts` | Modified — error badge |

---

## What was deferred

These items were assessed as low-impact for now:

- **Badge component DOM tests** — UI work is coming next, would need jsdom setup
- **Lazy index loading** — Current eager load handles typical libraries fine (~500KB-1MB)
- **Retry logic for index build** — Background already catches failures; manual retry exists
- **Storage quota handling** — Chrome gives 10MB; typical indexes are well under 1MB
- **`buildLibraryIndex` integration test** — Needs Plex API mocking; add after foundational tests prove their value
