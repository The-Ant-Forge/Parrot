# Parrot TODO

Browser extension that checks if media you're browsing is already in your Plex library.
Part of the [ComPlexionist](https://github.com/StephKoenig/ComPlexionist) family.

---

## Done (from ComPlexionist Phase 9b)

### Extension Setup (9b.1) ✓
- [x] Manifest V3 (auto-generated via WXT)
- [x] TypeScript + WXT/Vite build config
- [x] Extension popup HTML/CSS
- [x] Auto-versioning (Major.A.B with bump scripts)
- [x] ESLint + Prettier configured
- [x] Chrome + Firefox targets

### Core Logic (9b.2) — Partial
- [x] Plex API client (connect, authenticate, fetch libraries, extract GUIDs)
- [x] TMDB API client (collection + TV show/season endpoints)
- [ ] TVDB API client (not needed — using TMDB for episode data)
- [x] Gap finding logic (collection gaps in Phase 6, episode gaps in Phase 7)

### UI Components (9b.3) — Partial
- [x] Popup interface (config, test connection, library sync, status)
- [x] Options page (full-tab settings page with API keys, gap detection, cache management)
- [ ] Results page (not applicable — Parrot shows inline badges, not full gap reports)

### Storage (9b.4) — Partial
- [x] Config in `browser.storage.sync` (Plex URL, token, machineIdentifier)
- [x] Library index in `browser.storage.local` (movies + shows by external ID)
- [ ] IndexedDB for large datasets (not needed unless libraries exceed storage.local limits)

### Content Scripts ✓
- [x] TMDB (movie + TV, SPA-aware with MutationObserver)
- [x] IMDb (SPA-aware)
- [x] TVDB (slug-based, scans page links for numeric ID)
- [x] NZBGeek (scans `<a>` elements for external IDs)
- [x] RARGB (scans `<a>` elements)
- [x] NZBForYou (scans `<a>` elements for IMDb IDs)
- [x] PSA (title-based matching via URL slug normalization)

### Badge & Deep Linking ✓
- [x] Ownership badge injected next to title
- [x] Plex gold/dark theme styling
- [x] Clickable deep link to Plex Web when owned
- [x] Dynamic toolbar icon (OffscreenCanvas, 3 states: default/owned/not-owned)

---

## Phase 5: Options/Settings Page ✓

> Spec: [`docs/Phase 5 - Options Page.md`](Phase%205%20-%20Options%20Page.md)

Full-tab WXT options page for API credentials (Plex, TMDB), gap detection toggles, and cache management.

- [x] `ParrotOptions` type + defaults in `types.ts`
- [x] Storage helpers (`getOptions`, `saveOptions`) in `storage.ts`
- [x] Background handlers (`GET_OPTIONS`, `SAVE_OPTIONS`, `VALIDATE_TMDB_KEY`, `CLEAR_CACHE`)
- [x] TMDB host_permissions in `wxt.config.ts`
- [x] Options page UI (`src/entrypoints/options/`)
- [x] Settings link in popup

---

## Phase 6: TMDB Collection Gap Detection ✓

> Spec: [`docs/Phase 6 - TMDB Collection Gaps.md`](Phase%206%20-%20TMDB%20Collection%20Gaps.md)

Collapsible panel on TMDB movie pages showing owned/missing movies from the same collection.

- [x] TMDB API client (`src/api/tmdb.ts`)
- [x] Collection types + `CHECK_COLLECTION` message
- [x] Collection cache in `storage.local` (30-day TTL)
- [x] `CHECK_COLLECTION` handler in background
- [x] Collection panel component (`src/common/collection-panel.ts`)
- [x] TMDB content script integration

---

## Phase 7: TV Episode Gap Detection

> Spec: [`docs/Phase 7 - TV Episode Gaps.md`](Phase%207%20-%20TV%20Episode%20Gaps.md)

Season-level episode gap panel on TMDB and TVDB TV show pages. Uses TMDB API for episode data (no second API key needed). Compact storage: caches only the gap result (season summaries + missing episodes), never the full owned-episode list.

- [ ] `EpisodeGapResponse`, `SeasonGapInfo` types + `CHECK_EPISODES` message
- [ ] Episode gap cache helpers in `storage.ts` (24h TTL)
- [ ] TMDB TV API functions (`getTvShow`, `getTvSeason`, `findByTvdbId`)
- [ ] Plex episode fetching (`fetchShowEpisodes` via allLeaves)
- [ ] `CHECK_EPISODES` handler in background
- [ ] Episode gap panel component (`src/common/episode-panel.ts`)
- [ ] TVDB content script integration
- [ ] TMDB content script integration (TV shows)

---

## Phase 1: Polish & Reliability

**1.1 Test Coverage**
- [ ] Unit tests for ID extraction (each content script)
- [ ] Unit tests for `buildLibraryIndex` and GUID extraction
- [ ] Unit tests for title normalization and slug parsing
- [ ] Unit tests for badge component
- [ ] Integration test for message flow (content script → background → response)

**1.2 Error Handling**
- [ ] Badge tooltip on error (show why check failed)
- [ ] Graceful handling of Plex server going offline mid-session
- [ ] Retry logic for transient network failures during index build
- [ ] Handle storage.local quota exceeded (large libraries)

**1.3 Performance**
- [ ] Measure index build time for large libraries (1000+ items)
- [ ] Lazy index loading (don't load full index into memory on startup)
- [ ] Debounce MutationObserver callbacks (avoid rapid re-checks on SPA navigation)

---

## Phase 2: Enhanced Matching

**2.1 TV Episode Awareness**
- [ ] Fetch episode data for owned shows (season/episode counts)
- [ ] Show "You have S01-S03" on TV show pages
- [ ] Badge variant for partial ownership ("Partial" vs "Owned")
- [ ] Episode-level matching on episode-specific pages

**2.2 Additional Sites**
- [ ] Letterboxd (`letterboxd.com/film/{slug}`)
- [ ] Trakt (`trakt.tv/movies/{slug}`, `trakt.tv/shows/{slug}`)
- [ ] JustWatch (`justwatch.com/{locale}/movie/{slug}`)
- [ ] Rotten Tomatoes (`rottentomatoes.com/m/{slug}`)

**2.3 Collection Awareness**
- [ ] Detect when browsing a collection page (TMDB collections)
- [ ] Show "You have 3/5 movies in this collection"
- [ ] Cross-reference with ComPlexionist collection gap data

---

## Phase 3: Multi-Server & Settings

**3.1 Multi-Server Support**
- [ ] Allow multiple Plex server configurations
- [ ] Merge indexes from multiple servers
- [ ] Per-server sync status in popup

**3.2 Advanced Settings (Options Page)**
- [ ] Configurable badge position (before/after title)
- [ ] Toggle per-site enablement
- [ ] Custom refresh interval (default 24h)
- [ ] Show/hide "not owned" badge (default: hidden)
- [ ] Dark/light badge theme override

**3.3 Integration with ComPlexionist**
- [ ] Shared ignore lists (if user ignores a show in desktop app, respect in extension)
- [ ] Link to ComPlexionist from extension popup ("Full scan available in desktop app")

---

## Phase 4: Publishing

**4.1 Chrome Web Store**
- [ ] Store listing assets (screenshots, icon, description)
- [ ] Privacy policy (extension accesses local Plex server only)
- [ ] Submit for review

**4.2 Firefox Add-ons**
- [ ] Firefox-specific testing
- [ ] Submit to AMO

**4.3 CI/CD**
- [ ] GitHub Actions workflow for extension builds
- [ ] Auto-zip on tag push
- [ ] Automated version bumping in CI

---

## Key Patterns from ComPlexionist

These patterns are proven in the desktop app and should guide extension development:

### Plex GUID Extraction
External IDs are in the `guids` array on each Plex item:
```
tmdb://550      → TMDB numeric ID
tvdb://81189    → TVDB numeric ID
imdb://tt0137523 → IMDb string ID
```
Already implemented in `src/api/plex.ts`.

### Cache TTL Strategy
ComPlexionist uses conditional TTLs based on content type:
- Ended shows: longer cache (data won't change)
- Continuing shows: shorter cache (new episodes expected)
- Movies in collections: 30 days
- Movies without collections: 7 days

Consider similar tiered refresh for the library index.

### Date Timezone Buffer
ComPlexionist uses `< date.today()` (strict less-than) instead of `<=` for release dates, adding a 1-day buffer for timezone differences. Apply the same logic if showing release status in badges.

### Error Message Patterns
ComPlexionist translates API errors into user-friendly messages. The extension should do the same:
- 401 → "Authentication failed — check your token"
- 404 → "Library not found"
- Timeout → "Plex server not responding"
- Network error → "Cannot reach Plex server — check URL"
