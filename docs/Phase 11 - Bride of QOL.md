# Phase 11: Bride of QOL

## Context

Phase 10 shipped gap detection on all sites, a popup dashboard with media cards, badge completeness text, and a sites table. User testing revealed several polish issues and feature gaps:

- Gap panels hide when complete — no way to see them for fully-owned collections/series
- Popup dashboard: IMDb IDs unlabeled, ID pills aren't clickable, no collection info for movies
- Popup loses state on tab switch (service worker restart clears in-memory cache)
- Sparse-info sites (PSA) don't show poster/metadata even when Plex has the IDs
- Status bar only shows Plex connection — should show per-service pills (Plex, TMDB, TVDB)
- Options page is light-only — needs dark mode with OS auto-detection
- Sites table is display-only — users want to add custom sites
- Four new sites requested: Letterboxd, Trakt, JustWatch, Rotten Tomatoes

---

## Step 1: Gap Panel — Show When Complete

**Problem:** `expandPanels` option controls auto-expand, but user actually wants the option to show gap panels even when the collection/series is fully complete. Currently panels are suppressed when there are no gaps.

**Change:** Replace `expandPanels: boolean` with `showCompletePanels: boolean` (default `false`).

When `true`:
- Collection panel shows even if `missingMovies.length === 0` (all owned)
- Episode panel shows even if `hasGaps === false` (all episodes owned)
- Panels render expanded when showing a complete collection/series

**Files:**
- `src/common/types.ts` — rename field + default
- `src/common/gap-checker.ts` — pass flag to CHECK_COLLECTION/CHECK_EPISODES, show panel even when complete
- `src/entrypoints/background.ts` — CHECK_COLLECTION: return collection data even when all owned (skip `missingMovies.length > 0` guard). CHECK_EPISODES: return gap data with `hasGaps: false` but still include season info
- `src/entrypoints/options/index.html` — rename toggle label to "Show complete collections/series"
- `src/entrypoints/options/main.ts` — update field reference
- `src/common/badge.ts` — `updateBadgeCompleteness` already handles "complete" state, no change needed

---

## Step 2: Dashboard — IMDb Label & Media Type Tag Position

### 2a: IMDb ID display

**Problem:** IMDb IDs shown raw (`tt0096697`) without "IMDb" prefix. TMDB/TVDB have labels.

**Fix:** In `renderMediaCard`, change `addIdTag(media.imdbId)` to display as `IMDb ${numericPart}` where `numericPart` strips the `tt` prefix (keep full numeric string including leading zeros for clarity — `IMDb 0096697`). Actually, display as `IMDb ${imdbId}` keeping the tt prefix for recognition: `addIdTag(`IMDb ${media.imdbId}`)` — consistent with `TMDB ${id}` and `TVDB ${id}` pattern.

**Files:** `src/entrypoints/popup/main.ts` — one-line change in `renderMediaCard`

### 2b: Move media type tag to title line

**Problem:** [Movie]/[Show] tag is in the ID pills row. Should be on the title line, floated right.

**Fix:** Move the owned tag creation out of the `mediaIds` section. Add it as a separate element in the `media-info` div, positioned to the right of the title using flexbox.

**Files:**
- `src/entrypoints/popup/main.ts` — move owned tag to title row
- `src/entrypoints/popup/index.html` — add a container for title + media type tag
- `src/entrypoints/popup/style.css` — flex row for title line with media type floated right

---

## Step 3: Dashboard — Clickable ID Pills

**Problem:** TMDB, IMDb, TVDB pills are plain text spans. Should be clickable links to the respective pages.

**URLs:**
- TMDB: `https://www.themoviedb.org/{movie|tv}/{tmdbId}` (need `mediaType` to pick path)
- IMDb: `https://www.imdb.com/title/{imdbId}/`
- TVDB: `https://www.thetvdb.com/dereferrer/series/{tvdbId}` — if this doesn't work, fall back to `https://www.thetvdb.com/search?query={tvdbId}`

**Change:** Replace `addIdTag(text)` with `addIdLink(text, url)` that creates `<a>` elements instead of `<span>`. Keep the existing gray `.id-tag` styling but add `cursor: pointer` and open in new tab.

**Files:**
- `src/entrypoints/popup/main.ts` — new `addIdLink` helper, update `renderMediaCard`
- `src/entrypoints/popup/style.css` — `.id-tag` link styling (text-decoration: none, hover state)

---

## Step 4: Dashboard — Per-Service Status Pills

**Problem:** Status bar shows a single green/red dot + "Connected"/"Offline". Should show per-service pills like ComPlexionist.

**Design:** Replace the single dot with up to 3 compact pills:
```
[Plex ●] [TMDB ●] [TVDB ●]     1234 Movies · 567 Shows
```

- **Plex**: green if configured + lastRefresh exists, gray otherwise
- **TMDB**: green if `tmdbApiKey` is non-empty, gray otherwise
- **TVDB**: green if `tvdbApiKey` is non-empty, hidden if empty (optional service)

**Changes needed:**
- `StatusResponse` — add `tmdbConfigured: boolean`, `tvdbConfigured: boolean`
- Background `GET_STATUS` handler — check options for API keys
- Popup HTML/CSS/TS — replace dot+text with pill row

**Files:**
- `src/common/types.ts` — extend `StatusResponse`
- `src/entrypoints/background.ts` — enhance GET_STATUS
- `src/entrypoints/popup/index.html` — new status pill markup
- `src/entrypoints/popup/main.ts` — render pills
- `src/entrypoints/popup/style.css` — pill styling

---

## Step 5: Dashboard — Collection Summary for Movies

**Problem:** When viewing a movie that belongs to a collection, the popup shows no collection info.

**Design:** Below the subtitle line, show a compact collection summary:

```
Member of: Galactic Saga Collection
3 of 5 owned
```

**Implementation:**
- Extend `TabMediaInfo` with optional `collectionName?: string`, `collectionOwned?: number`, `collectionTotal?: number`
- In `fetchTabMetadata` for movies: after fetching movie details, if `belongs_to_collection` exists, fetch collection and check ownership against library index
- Render in popup below subtitle

**Files:**
- `src/common/types.ts` — extend `TabMediaInfo`
- `src/entrypoints/background.ts` — enhance `fetchTabMetadata` for movies
- `src/entrypoints/popup/main.ts` — render collection summary
- `src/entrypoints/popup/index.html` — add collection summary element
- `src/entrypoints/popup/style.css` — collection summary styling

---

## Step 6: Dashboard — Tab Persistence

**Problem:** `tabMediaCache` is an in-memory `Map` in the background service worker. Service workers restart frequently, clearing the cache. When the user switches tabs and opens the popup, the media card may be empty.

**Fix:** Persist `tabMediaCache` to `browser.storage.session` (session storage survives service worker restarts but clears on browser close).

- On cache write: `tabMediaCache.set(tabId, info)` → also write to `browser.storage.session`
- On `GET_TAB_MEDIA`: check in-memory first, fall back to session storage
- On `tabs.onRemoved`: clean up both in-memory and session storage
- Limit stored entries to last 20 tabs (prevent unbounded growth)

**Files:**
- `src/entrypoints/background.ts` — session storage read/write for tab media cache
- `wxt.config.ts` — add `"storage"` permission if not present (already have it)

---

## Step 7: Dashboard — Sparse Info Bridging

**Problem:** On sites like PSA (title-based), the popup may show no poster or metadata even though the Plex library has TMDB/TVDB/IMDb IDs for the item (from enrichment).

**Current state:** `fetchTabMetadata` already resolves TMDB IDs from imdb/tvdb sources. The CHECK handler already populates `TabMediaInfo.tmdbId` from `result.item?.tmdbId`. So if the OwnedItem has a tmdbId from enrichment, it should already work.

**Actual gap:** For title-based sources, the code sets:
```typescript
tmdbId: result.item?.tmdbId ?? (message.source === "tmdb" ? parseInt(message.id) : undefined)
```
This correctly uses the enriched tmdbId. But `fetchTabMetadata` only resolves from `imdb` and `tvdb` sources — it doesn't handle the case where `tmdbId` is already set from enrichment but `source` is `"title"`.

**Fix:** In `fetchTabMetadata`, handle the case where `tmdbId` is already populated (from enrichment) regardless of `source`. The current code already does this mostly — `let tmdbId = info.tmdbId` covers it. The issue might be that the TMDB ID is set but the metadata fetch doesn't run because of the source checks. Let me verify and fix:

```typescript
let tmdbId = info.tmdbId;
if (!tmdbId && info.source === "imdb") { ... }
else if (!tmdbId && info.source === "tvdb") { ... }
// Already correct: if tmdbId was set from enrichment, it skips resolution
```

So the logic is actually correct. The real issue is likely that the popup opens before `fetchTabMetadata` completes. Fix: add a brief polling/retry in the popup — if media card has no poster, retry `GET_TAB_MEDIA` after 1 second.

**Also:** Persist resolved ID cross-references. When `fetchTabMetadata` resolves a TMDB ID from IMDb/TVDB, store the mapping in `browser.storage.local` so future lookups are instant.

**Files:**
- `src/entrypoints/popup/main.ts` — retry GET_TAB_MEDIA after 1s if no poster
- `src/entrypoints/background.ts` — cache ID cross-references in storage.local
- `src/common/storage.ts` — helpers for ID cross-reference cache

---

## Step 8: Options — Dark Mode

**Problem:** Options page is light-only. Should support dark mode with OS auto-detection.

**Approach:** CSS custom properties + `prefers-color-scheme` media query.

1. Define CSS variables for all colors (background, text, card, border, accent, etc.)
2. Set light values as default
3. `@media (prefers-color-scheme: dark)` overrides with dark values
4. Dark values match the popup's existing dark theme (#1a1a1a bg, #eee text, #ebaf00 accent)

No JS needed — pure CSS. No manual toggle — follows OS setting.

**Files:**
- `src/entrypoints/options/style.css` — CSS variables + dark mode media query

---

## Step 9: Options — Custom Sites

**Problem:** Sites table is display-only. Users want to add custom site definitions.

**Design:**
- Table shows all sites (builtin read-only + custom editable)
- Built-in sites: shown but not editable/removable
- Custom sites: "Add Site" button opens inline form row with fields:
  - Name (text)
  - Media Type (select: movie / show / auto)
  - URL Pattern (text, e.g., `*://example.com/movie/*`)
  - Badge Selector (text, CSS selector)
- Each custom row has a "Remove" button
- "Reset Defaults" button removes all custom sites

**Storage:** Custom sites stored in `browser.storage.sync` alongside options. Key: `customSites: SiteDefinition[]`.

**No universal content script yet** — custom sites are display-only metadata for now. The universal content script (which would actually inject badges on custom sites) is deferred to a future phase. The table serves as the UI foundation.

**Files:**
- `src/common/storage.ts` — `getCustomSites()`, `saveCustomSites()` helpers
- `src/entrypoints/options/index.html` — add form row, add/reset buttons
- `src/entrypoints/options/main.ts` — CRUD logic for custom sites
- `src/entrypoints/options/style.css` — form row styling (inherits dark mode from Step 8)

---

## Step 10: New Content Scripts

Add support for 4 new sites. All use the DOM link scanning pattern (like NZBGeek/RARGB).

### 10a: Letterboxd

- **URL:** `*://*.letterboxd.com/film/*`
- **Media type:** movie (explicit from URL path)
- **ID extraction:** Scan DOM links for TMDB/IMDb URLs. Letterboxd links to both TMDB and IMDb in the film details section
- **Badge selector:** `.headline-1` or `h1` (main film title)
- **SPA:** No (traditional page loads)

### 10b: Trakt

- **URLs:** `*://*.trakt.tv/movies/*`, `*://*.trakt.tv/shows/*`
- **Media type:** Explicit from URL path (movies vs shows)
- **ID extraction:** Scan DOM links for TMDB/IMDb/TVDB URLs. Trakt displays external links in sidebar
- **Badge selector:** `h1` (main title)
- **SPA:** Yes (uses client-side navigation — needs `observeUrlChanges`)

### 10c: Rotten Tomatoes

- **URLs:** `*://*.rottentomatoes.com/m/*`, `*://*.rottentomatoes.com/tv/*`
- **Media type:** Explicit from URL path
- **ID extraction:** May not link to IMDb/TMDB directly. Try JSON-LD structured data first (`<script type="application/ld+json">`), then DOM links, then title-based fallback
- **Badge selector:** `h1` or `[data-qa="score-panel-title"]`
- **SPA:** Partial (some navigation is SPA-like)

### 10d: JustWatch

- **URLs:** `*://*.justwatch.com/*/movie/*`, `*://*.justwatch.com/*/tv-show/*`
- **Media type:** Explicit from URL path
- **ID extraction:** Scan DOM links for TMDB URLs. JustWatch sources data from TMDB
- **Badge selector:** `h1` or `.title-block h1`
- **SPA:** Yes (React app — needs `observeUrlChanges`)

### Other suggested sites to consider (future):

- **Metacritic** (`metacritic.com/movie/*`, `metacritic.com/tv/*`)
- **TV Time** (`tvtime.com/show/*`)
- **Simkl** (`simkl.com/movies/*`, `simkl.com/tv/*`)
- **Wikipedia** film/TV articles (structured data available)
- **Plex Discover** (`app.plex.tv/desktop/#!/discover`) — would be meta but useful

**For each new site:**

1. Create `src/entrypoints/{site}.content.ts`
2. Add to `DEFAULT_SITES` in `src/common/sites.ts`
3. Add host_permissions to `wxt.config.ts` if needed for API calls (not needed for content scripts — WXT handles match patterns)

**Files (per site):**
- `src/entrypoints/letterboxd.content.ts`
- `src/entrypoints/trakt.content.ts`
- `src/entrypoints/rottentomatoes.content.ts`
- `src/entrypoints/justwatch.content.ts`
- `src/common/sites.ts` — add 4 entries
- `src/common/extractors.ts` — shared extractor for Trakt URL parsing

---

## Step 11: Tests & Docs

### Tests
- Test `addIdLink` helper (badge test file)
- Test new extractors for Letterboxd, Trakt, RT, JustWatch URL parsing
- Test `showCompletePanels` option flow

### Docs
- Create `docs/Phase 11 - Bride of QOL.md`
- Update `docs/Completed.md` and `docs/TODO.md`
- Commit and push

---

## Files Summary

### New files (4-5)
| File | Purpose |
|------|---------|
| `src/entrypoints/letterboxd.content.ts` | Letterboxd content script |
| `src/entrypoints/trakt.content.ts` | Trakt content script |
| `src/entrypoints/rottentomatoes.content.ts` | Rotten Tomatoes content script |
| `src/entrypoints/justwatch.content.ts` | JustWatch content script |
| `docs/Phase 11 - Bride of QOL.md` | Phase specification |

### Modified files (~15)
| File | Key changes |
|------|------------|
| `src/common/types.ts` | Rename `expandPanels` → `showCompletePanels`, extend `TabMediaInfo` (collection), extend `StatusResponse` (service config) |
| `src/common/gap-checker.ts` | Show panels when complete if option set |
| `src/common/badge.ts` | No changes expected |
| `src/common/sites.ts` | Add 4 new site definitions |
| `src/common/storage.ts` | Custom sites helpers, ID cross-reference cache |
| `src/common/extractors.ts` | Trakt URL extractor |
| `src/entrypoints/background.ts` | Session-persist tab cache, enhance GET_STATUS, collection in metadata fetch, ID cross-ref cache, CHECK_COLLECTION return complete collections |
| `src/entrypoints/popup/index.html` | Status pills, collection summary, title row layout |
| `src/entrypoints/popup/main.ts` | Clickable ID links, status pills, collection summary, retry logic, media type tag repositioned |
| `src/entrypoints/popup/style.css` | Link styling, status pills, collection summary, title row flex |
| `src/entrypoints/options/index.html` | Rename toggle, custom sites form, add/reset buttons |
| `src/entrypoints/options/main.ts` | Custom sites CRUD, rename option field |
| `src/entrypoints/options/style.css` | Dark mode CSS variables + media query, form styling |
| `wxt.config.ts` | No changes needed (WXT auto-generates match patterns from content scripts) |

---

## Implementation Order

1. Steps 1-2 (gap panel + IMDb label + tag position) — quick fixes
2. Steps 3-4 (clickable pills + status pills) — popup polish
3. Step 5 (collection summary) — popup feature
4. Steps 6-7 (tab persistence + sparse bridging) — reliability
5. Step 8 (dark mode) — CSS-only, low risk
6. Step 9 (custom sites UI) — options page feature
7. Step 10 (new sites) — 4 content scripts, independent of other steps
8. Step 11 (tests + docs)

---

## Verification

1. `npm test` — all tests pass (existing 70 + new)
2. `npm run build` — compiles cleanly
3. `npm run lint` — no errors
4. Manual: Options → "Show complete collections" toggled → TMDB movie with full collection → panel appears showing all owned
5. Manual: Popup on IMDb page → IMDb pill labeled + clickable → opens IMDb page
6. Manual: Popup → status pills show Plex green, TMDB green, TVDB gray (or green if configured)
7. Manual: Popup on TMDB movie in collection → shows "Member of: Collection Name — 3 of 5 owned"
8. Manual: Switch tabs and back → popup still shows media card
9. Manual: Options page respects OS dark mode
10. Manual: Options → add custom site → appears in table → remove works → reset restores defaults
11. Manual: Browse Letterboxd/Trakt/RT/JustWatch film page → badge appears
