# Parrot v1.6 -- Link Scanner & Collection Gap Improvements

**Release date:** 2026-02-17
**Version:** 1.6.1

---

## What's New

### Source Authority Priority in Link Scanner

When a page contains links to multiple external databases (e.g., both an IMDb and a TMDB link), Parrot now picks the most reliable source using a fixed priority: **IMDb > TVDB > TMDB**. Previously, whichever link appeared first in the DOM was used, which could lead to misidentification on pages with unrelated sidebar links.

### Container-Scoped Link Scanning (RARGB)

On RARGB torrent pages, the link scanner is now scoped to the `#description` section. This prevents stray TMDB links in the sidebar or related content area from being matched instead of the correct IMDb link in the description.

### Cross-Reference Fallback

When a direct IMDb or TVDB lookup fails to find a match in the library index, Parrot now resolves to the corresponding TMDB ID via the TMDB API and retries. This improves matching accuracy when Plex items are indexed with a different set of external IDs than the page provides.

### Collection Gaps for Not-Owned Movies

The collection gap panel now appears for **any movie in a partially-owned collection**, not just movies you already own. If you're browsing a movie you don't have, but you own other entries in the same collection, the badge upgrades from gray to gold "Plex : Incomplete" with a dropdown showing which collection movies you own and which are missing.

This respects the "Minimum Owned to show Gaps" setting -- the panel only appears if you own at least the configured number of movies in the collection.

---

## Technical Details

- `scanLinksForExternalId()` collects one match per source type, then returns the highest-authority match
- The `container` option allows per-site DOM scoping (currently used by RARGB)
- Cross-reference resolution uses existing `FIND_TMDB_ID` message handler with `findByImdbId()` / `findByTvdbId()` from the TMDB API client
- 11 content scripts updated to call `checkGaps` for all movies (not just owned), with `psa.content.ts` and `tvdb.content.ts` excluded (title-based and shows-only respectively)
- `setBadgeGapData()` now applies owned styling to transition the badge from gray to gold when collection data arrives
- 121 tests across 7 test files (up from 116)

---

## Files Changed

| File | Change |
|------|--------|
| `src/common/extractors.ts` | Source priority ordering, `container` option |
| `src/common/badge.ts` | Apply owned styling in `setBadgeGapData` |
| `src/common/gap-checker.ts` | Show collection panel for not-owned movies in partially-owned collections |
| `src/entrypoints/background.ts` | Cross-reference fallback in CHECK handler |
| `src/entrypoints/rargb.content.ts` | Scope link scan to `#description` |
| 10 other content scripts | Remove `response.owned` gate for movie gap checks |
| `tests/scan-links.test.ts` | 5 new tests for priority and container scoping |
