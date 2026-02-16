# Parrot — Browser Extension Specification

## Overview

Parrot is a browser extension that tells you whether media you're browsing on the web is already in your Plex library. When you land on a movie or TV show page on a supported site, Parrot shows a badge indicating whether you own it or not. For owned TV shows, it can also show which episodes you're missing. For movies in TMDB collections, it shows which other movies in the collection you own or are missing.

**Companion to ComPlexionist** — ComPlexionist finds gaps in your library; Parrot prevents you from hunting for something you already have.

**Repository:** [github.com/StephKoenig/Parrot](https://github.com/StephKoenig/Parrot)
**Parent project:** [github.com/StephKoenig/ComPlexionist](https://github.com/StephKoenig/ComPlexionist)

---

## How It Works

1. User browses to a supported page (e.g., `themoviedb.org/movie/550-the-sparring-partner`)
2. Content script extracts the media's external ID from the page URL or DOM
3. Extension sends a `CHECK` message to the service worker
4. Service worker looks up the ID in a cached index of the user's Plex library
5. Response flows back with ownership status and deep-link data
6. Content script injects an ownership badge next to the title
7. Toolbar icon updates per-tab to reflect ownership state
8. For movies: if part of a TMDB collection, a collection gap panel may appear
9. For TV shows: if owned but missing episodes, an episode gap panel may appear

---

## Supported Sites

| Site | URL Pattern | ID Source | Badge Target |
|------|-------------|-----------|--------------|
| **TMDB** | `themoviedb.org/movie/{id}` | TMDB numeric ID from URL | `section.inner_content h2 a` |
| **TMDB** | `themoviedb.org/tv/{id}` | TMDB numeric ID from URL | `section.inner_content h2 a` |
| **TVDB** | `thetvdb.com/series/{slug}` | TVDB numeric ID from page links | `h1` |
| **TVDB Movies** | `thetvdb.com/movies/{slug}` | TMDB/IMDb from page links | `h1` |
| **IMDb** | `imdb.com/title/{ttID}` | IMDb ID (`tt\d+`) from URL | `h1[data-testid="hero-title-block__title"]` |
| **NZBGeek** | `nzbgeek.info/geekseek.php?movieid={id}` | TMDB/IMDb from page links | `span.overlay_title` |
| **NZBGeek** | `nzbgeek.info/geekseek.php?tvid={id}` | TVDB from page links | `span.overlay_title` |
| **RARGB** | `rargb.to/torrent/*` | TMDB/IMDb/TVDB from page links | `h1` |
| **NZBForYou** | `nzbforyou.com/viewtopic.php` | IMDb from page links | `h3.first` |
| **PSA** | `psa.wf/movie/{slug}` | Title-based matching from URL slug | `h1.post-title` |
| **PSA** | `psa.wf/tv-show/{slug}` | Title-based matching from URL slug | `h1.post-title` |
| **Letterboxd** | `letterboxd.com/film/{slug}` | TMDB/IMDb from page links | `h1.headline-1` |
| **Trakt** | `trakt.tv/movies/{slug}` | TMDB/IMDb/TVDB from page links | `h1` |
| **Trakt** | `trakt.tv/shows/{slug}` | TMDB/IMDb/TVDB from page links | `h1` |
| **Trakt App** | `app.trakt.tv/movies/{slug}` | TMDB/IMDb/TVDB from page links | `h1.short-title` |
| **Trakt App** | `app.trakt.tv/shows/{slug}` | TMDB/IMDb/TVDB from page links | `h1.short-title` |
| **Rotten Tomatoes** | `rottentomatoes.com/m/{slug}` | Title-based from URL slug (JSON-LD/link scan fallback) | `rt-text[slot="title"]` or `h1` |
| **Rotten Tomatoes** | `rottentomatoes.com/tv/{slug}` | Title-based from URL slug (JSON-LD/link scan fallback) | `rt-text[slot="title"]` or `h1` |
| **JustWatch** | `justwatch.com/*/movie/{slug}` | Title-based from h1 (link scan fallback) | `h1` |
| **JustWatch** | `justwatch.com/*/tv-series/{slug}` | Title-based from h1 (link scan fallback) | `h1` |

### ID Extraction Strategies

**URL-based** (TMDB, IMDb): ID is extracted directly from the page URL.
```typescript
// TMDB: https://www.themoviedb.org/movie/550-the-sparring-partner
url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);

// IMDb: https://www.imdb.com/title/tt0137523/
url.match(/imdb\.com\/title\/(tt\d+)/);
```

**Link-scanning** (NZBGeek, RARGB, NZBForYou, Letterboxd, Trakt, Trakt App, TVDB Movies): The page contains links to external databases (TMDB, IMDb, TVDB). A shared `scanLinksForExternalId()` function scans all `<a>` elements for matching hrefs. Handles both new-style TVDB URLs (`/series/12345`) and old-style query parameter format (`?tab=series&id=12345`).

**DOM metadata** (TVDB): Numeric TVDB ID is extracted from links within the page (e.g., `/series/{id}/edit`), not the URL slug.

**Title-based** (PSA, Rotten Tomatoes, JustWatch): No external IDs exist on the page (or they have been removed by the site). Parrot normalizes a title and optional year, then matches against a title-based index built from Plex library data. The key `"some movie|2025"` is tried first, falling back to `"some movie"` without year. PSA and Rotten Tomatoes parse the title from the URL slug; JustWatch parses the h1 text (e.g., `"The Night Manager (2016)"`). Handles both hyphen-separated slugs (`some-movie-2025`) and underscore-separated slugs (`some_movie_2025`). Rotten Tomatoes and JustWatch try link scanning first and fall back to title-based matching.

### Media Type Detection

- **TMDB**: URL path (`/movie/` vs `/tv/`) determines type
- **IMDb**: URL doesn't distinguish — Parrot checks both movie and show indexes
- **NZBGeek**: URL parameter (`movieid` vs `tvid`) determines type
- **RARGB**: Inferred from which external link is found (TVDB = show, TMDB path tells us)
- **NZBForYou**: Breadcrumb (`li.breadcrumb`) text containing "TV" or "Movies"; if absent, tries movie then show
- **PSA**: URL path (`/movie/` vs `/tv-show/`) determines type
- **Letterboxd**: Always movie (film-only site)
- **Trakt**: URL path (`/movies/` vs `/shows/`) determines type
- **Rotten Tomatoes**: URL path (`/m/` vs `/tv/`) determines type
- **JustWatch**: URL path (`/movie/` vs `/tv-show/` or `/tv-series/`) determines type
- **TVDB Movies**: Always movie

### SPA Navigation

TMDB, IMDb, TVDB, Trakt, Trakt App, and JustWatch are single-page applications. Content scripts use a shared `observeUrlChanges()` utility (debounced `MutationObserver`) to detect client-side navigation and re-run the check-and-badge flow when the URL changes.

---

## Architecture

```
parrot/
├── src/
│   ├── entrypoints/
│   │   ├── background.ts              # Library cache, API proxy, icon rendering
│   │   ├── tmdb.content.ts            # TMDB content script
│   │   ├── imdb.content.ts            # IMDb content script
│   │   ├── tvdb.content.ts            # TVDB series content script
│   │   ├── tvdb-movies.content.ts     # TVDB movies content script
│   │   ├── nzbgeek.content.ts         # NZBGeek content script
│   │   ├── rargb.content.ts           # RARGB content script
│   │   ├── nzbforyou.content.ts       # NZBForYou content script
│   │   ├── psa.content.ts             # PSA content script (title-based)
│   │   ├── letterboxd.content.ts      # Letterboxd content script
│   │   ├── trakt.content.ts           # Trakt content script
│   │   ├── trakt-app.content.ts      # Trakt App content script (SvelteKit SPA)
│   │   ├── rottentomatoes.content.ts  # Rotten Tomatoes content script
│   │   ├── justwatch.content.ts       # JustWatch content script
│   │   ├── options/
│   │   │   ├── index.html             # Options page HTML
│   │   │   ├── main.ts                # Options page logic
│   │   │   └── style.css              # Options page styles
│   │   └── popup/
│   │       ├── index.html             # Popup HTML
│   │       ├── main.ts                # Popup logic
│   │       └── style.css              # Popup styles
│   ├── api/
│   │   ├── plex.ts                    # Plex API client
│   │   ├── tmdb.ts                    # TMDB v3 API client
│   │   └── tvdb.ts                    # TVDB v4 API client (optional)
│   └── common/
│       ├── types.ts                   # Shared types (LibraryIndex, OwnedItem, etc.)
│       ├── storage.ts                 # Storage helpers
│       ├── badge.ts                   # Smart badge (wrapper+pill, floating panel)
│       ├── gap-checker.ts             # Shared gap detection orchestration
│       ├── collection-panel.ts        # Collection gap panel component
│       ├── episode-panel.ts           # Episode gap panel component
│       ├── panel-utils.ts             # Shared panel styling utilities
│       ├── extractors.ts              # URL/ID extractors + DOM link scanner
│       ├── url-observer.ts            # Debounced URL change observer for SPAs
│       ├── normalize.ts               # Title normalization for slug-based matching
│       └── sites.ts                   # Supported site definitions
├── tests/                             # Vitest test suite (110 tests)
├── scripts/
│   ├── bump-build.js                  # Auto-increment build number (B)
│   └── bump-commit.js                 # Bump commit number (A), reset B
├── wxt.config.ts                      # WXT/Vite config (manifest auto-generated)
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

### Component Responsibilities

**Service Worker (`background.ts`)**
- Manages the Plex library index cache (in-memory + `storage.local`)
- Proxies Plex API requests (avoids CORS issues from content scripts)
- Handles all message types: `CHECK`, `TEST_CONNECTION`, `BUILD_INDEX`, `GET_STATUS`, `GET_OPTIONS`, `SAVE_OPTIONS`, `VALIDATE_TMDB_KEY`, `VALIDATE_TVDB_KEY`, `CLEAR_CACHE`, `CHECK_COLLECTION`, `CHECK_EPISODES`
- Renders dynamic per-tab toolbar icons via `OffscreenCanvas`
- Auto-refreshes stale library index on demand (configurable interval, default 7 days)

**Content Scripts (13 scripts)**
- One per supported site
- Extracts media ID from URL or by scanning page links (shared `scanLinksForExternalId()`)
- Sends `CHECK` message to service worker
- Injects smart badge into the page DOM (wrapper+pill architecture)
- Triggers gap detection via shared `checkGaps()` for owned items
- SPA-aware: uses shared `observeUrlChanges()` on TMDB/IMDb/TVDB/Trakt/JustWatch

**Options Page (`options/`)**
- Full-tab settings page (4 card sections)
- Plex server configuration (URL, token, test, save & sync)
- API key management (TMDB required, TVDB optional) with validation buttons
- Gap detection toggles (exclude future, exclude specials, minimum thresholds)
- Cache management (refresh, clear, auto-refresh toggle with configurable interval)

**Popup (`popup/`)**
- Quick-access configuration UI (Plex URL, token)
- Connection test button with feedback
- Cache status (last refresh timestamp, item count)
- Settings link to open options page

**API Clients (`api/`)**
- `plex.ts` — Plex server connection, library fetching, episode data
- `tmdb.ts` — TMDB v3 (movies, collections, TV shows/seasons, TVDB-to-TMDB ID conversion)
- `tvdb.ts` — TVDB v4 (bearer token auth, paginated episode fetching, key validation)

### Data Flow

```
Content Script → Message → Service Worker → Library Index / API Clients
                                ↓
                          Response (ownership, gaps)
                                ↓
Badge + Panel + Icon ← Content Script
```

### Message Protocol

```typescript
type Message =
  | { type: "TEST_CONNECTION"; config: PlexConfig }
  | { type: "BUILD_INDEX" }
  | { type: "GET_STATUS" }
  | { type: "CHECK"; mediaType: "movie"|"show"; source: "tmdb"|"imdb"|"tvdb"|"title"; id: string }
  | { type: "GET_OPTIONS" }
  | { type: "SAVE_OPTIONS"; options: ParrotOptions }
  | { type: "VALIDATE_TMDB_KEY"; apiKey: string }
  | { type: "VALIDATE_TVDB_KEY"; apiKey: string }
  | { type: "CLEAR_CACHE" }
  | { type: "CHECK_COLLECTION"; tmdbMovieId: string }
  | { type: "CHECK_EPISODES"; source: "tvdb" | "tmdb"; id: string }
  | { type: "FIND_TMDB_ID"; source: "imdb" | "tvdb" | "title"; id: string; mediaType: "movie" | "show" }
  | { type: "GET_TAB_MEDIA"; tabId: number }
  | { type: "GET_STORAGE_USAGE" }
```

Content scripts always go through the service worker — they never call Plex or external APIs directly.

---

## Plex API Integration

### Authentication

Plex uses a custom token passed as a header:

```
Header: X-Plex-Token: {token}
Base URL: http://{server}:{port}  (default port 32400)
```

Users find their token in Plex Settings > Account > Authorized Devices, or from browser dev tools while logged into Plex Web.

### Key Endpoints

```
GET /
→ Server info (machineIdentifier for deep linking)

GET /library/sections
→ All libraries (type: "movie", "show", etc.)

GET /library/sections/{sectionId}/all?includeGuids=1
→ All items in a library with external GUIDs
→ IMPORTANT: includeGuids=1 is required to get external IDs
→ Request Accept: application/json for JSON response

GET /library/metadata/{ratingKey}/allLeaves
→ All episodes for a TV show (seasonNumber + episodeNumber)
→ Used for episode gap detection
```

### External ID System (GUIDs)

Each Plex item has a `guids` array containing external database references:

```json
{
  "guids": [
    { "id": "tmdb://550" },
    { "id": "imdb://tt0137523" },
    { "id": "tvdb://81189" }
  ]
}
```

Extraction patterns (proven in both ComPlexionist and Parrot):
```typescript
function extractExternalIds(guids: Array<{id: string}>): ExternalIds {
  const ids: ExternalIds = {};
  for (const guid of guids) {
    const id = guid.id;
    const tmdbMatch = id.match(/tmdb:\/\/(\d+)/);
    if (tmdbMatch) ids.tmdb_id = parseInt(tmdbMatch[1]);

    const tvdbMatch = id.match(/tvdb:\/\/(\d+)/);
    if (tvdbMatch) ids.tvdb_id = parseInt(tvdbMatch[1]);

    const imdbMatch = id.match(/imdb:\/\/(tt\d+)/);
    if (imdbMatch) ids.imdb_id = imdbMatch[1];
  }
  return ids;
}
```

### Deep Linking

When a user owns media, the badge links directly to it in Plex Web:
```
https://app.plex.tv/desktop/#!/server/{machineIdentifier}/details?key=%2Flibrary%2Fmetadata%2F{ratingKey}
```

The `machineIdentifier` is fetched once during setup (from `GET /`) and stored alongside the config. The `ratingKey` comes from the library item data.

---

## External API Clients

### TMDB v3 (`src/api/tmdb.ts`)

Auth: API key as query param (`?api_key={key}`). Base URL: `https://api.themoviedb.org/3`

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `getMovie` | `GET /movie/{id}` | Movie details (collection membership) |
| `getCollection` | `GET /collection/{id}` | All movies in a collection |
| `getTvShow` | `GET /tv/{id}` | TV show details with seasons list |
| `getTvSeason` | `GET /tv/{id}/season/{n}` | Episodes in a season |
| `findByTvdbId` | `GET /find/{tvdbId}?external_source=tvdb_id` | Convert TVDB ID to TMDB ID |
| `validateTmdbKey` | `GET /configuration` | Key validation (200 = valid) |

### TVDB v4 (`src/api/tvdb.ts`) — Optional

Auth: bearer token via `POST /login` with `{ apikey: "..." }`. Base URL: `https://api4.thetvdb.com/v4`

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `getSeriesEpisodes` | `GET /series/{id}/episodes/default?page={n}` | All episodes (paginated, 500/page) |
| `validateTvdbKey` | `POST /login` | Key validation (login succeeds = valid) |

Token is cached in-memory (service worker lifetime). Auto-retries on 401 (expired token).

Used only when a TVDB API key is configured **and** the source page is TVDB. TMDB pages always use the TMDB API. If no TVDB key is set, TVDB pages fall back to TMDB via `findByTvdbId`.

---

## Library Index Cache

### Structure

```typescript
interface LibraryIndex {
  movies: {
    byTmdbId: Record<string, OwnedItem>;
    byImdbId: Record<string, OwnedItem>;
    byTitle: Record<string, OwnedItem>;
  };
  shows: {
    byTvdbId: Record<string, OwnedItem>;
    byTmdbId: Record<string, OwnedItem>;
    byImdbId: Record<string, OwnedItem>;
    byTitle: Record<string, OwnedItem>;
  };
  lastRefresh: number;
  itemCount: number;
}

interface OwnedItem {
  title: string;
  year?: number;
  plexKey: string;  // ratingKey for deep linking
}
```

Uses `Record<string, OwnedItem>` instead of `Map` because `browser.storage` only stores JSON-serializable data.

### Index Building

1. Fetch all library sections via `GET /library/sections`
2. Filter to `movie` and `show` types only
3. For each section, fetch all items with `includeGuids=1`
4. Extract external IDs from the `guids` array on each item
5. Build lookup maps for each ID type
6. For title-based matching, store both `"title|year"` and `"title"` keys
7. Store the full index in `browser.storage.local`
8. Cache in-memory for fast lookups (avoid hitting storage on every CHECK)

### Title Normalization

For sites without external IDs (PSA), Parrot normalizes titles for fuzzy matching:

```typescript
normalizeTitle("The Sparring Partner") → "the sparring partner"
normalizeTitle("The-Dark-Corridors") → "the dark corridors"
buildTitleKey("The Sparring Partner", 1999) → "the sparring partner|1999"
parseSlug("the-dark-corridors-2008") → { title: "the dark corridors", year: 2008 }
parseSlug("the_dark_corridors_2008") → { title: "the dark corridors", year: 2008 }
```

Lookup tries `"title|year"` first, falls back to `"title"` only.

### Refresh Policy

| Scenario | Action |
|----------|--------|
| First install | Full index build on setup |
| Auto-refresh enabled | On each CHECK, if index age exceeds threshold (default 7 days), fire-and-forget rebuild in background |
| Auto-refresh disabled | No automatic rebuilds; user must refresh manually |
| Manual refresh | User clicks "Refresh Library" in popup/options |

### Storage

| Store | Contents | Notes |
|-------|----------|-------|
| `browser.storage.sync` | Plex URL, token, machineIdentifier, options | Syncs across devices |
| `browser.storage.local` | Library index, collection cache (30d TTL), episode gap cache (24h TTL) | Can be large |

---

## Gap Detection

### Collection Gaps (TMDB Movies)

When viewing a TMDB movie page, Parrot checks if the movie belongs to a TMDB collection. If the user owns some but not all movies in the collection, a collapsible panel appears showing owned and missing movies.

- Triggered by `CHECK_COLLECTION` message after ownership badge
- Uses TMDB API (`getMovie` → `getCollection`)
- Collection data cached 30 days in `storage.local`
- Respects `excludeFuture` and `minCollectionSize`/`minOwned` options
- Panel shows owned movies (gold checkmark, Plex deep link) and missing movies (gray X)

### Episode Gaps (TV Shows)

When viewing a TV show page on TMDB or TVDB, if the user owns the show but is missing episodes, a collapsible season-level panel appears.

- Triggered by `CHECK_EPISODES` message after ownership badge (for owned shows only)
- Source-based API routing:
  - TVDB pages with TVDB key configured → TVDB v4 API (direct, accurate numbering)
  - TVDB pages without TVDB key → falls back to TMDB API via ID conversion
  - TMDB pages → always TMDB API
- Episode data fetched on demand, never stored in the library index
- Gap results cached 24 hours in `storage.local` (keyed by `source:id`)
- Respects `excludeSpecials` (skip Season 0) and `excludeFuture` (skip unaired episodes)
- Panel shows "X of Y episodes — N of M seasons full", with per-season breakdown

---

## Content Script Behaviour

### Common Pattern

Every content script follows the same flow:

```typescript
async function checkAndBadge() {
  removeBadge();                              // Clear any existing badge
  const id = extractId();                     // URL or link scanning
  if (!id) return;

  const anchor = findAnchor();                // DOM element for badge placement
  const badge = injectBadge(anchor);          // Show loading state

  const response = await browser.runtime.sendMessage({
    type: "CHECK",
    mediaType: "movie",                       // or "show"
    source: "tmdb",                           // or "imdb", "tvdb", "title"
    id: id,
  });

  updateBadgeFromResponse(badge, response);   // Update badge + make clickable

  // For TMDB movies → check collection gaps
  // For TMDB/TVDB TV shows → check episode gaps
}
```

### Smart Badge

A compact pill badge injected next to the title element on each supported page. Uses a wrapper+pill DOM architecture: the outer `<span data-parrot-badge>` is stable (never replaced), the inner `.parrot-pill` rebuilds on state transitions. The wrapper has `position: relative` to anchor floating gap panels.

**Four states:**

| State | Appearance | Interaction |
|-------|-----------|-------------|
| Not owned | `[Plex]` gray | None |
| Owned (no gap data) | `[Plex]` gold | Click opens Plex |
| Owned + complete | `[Plex : Complete]` gold | "Plex" opens Plex, "Complete" toggles panel |
| Owned + incomplete | `[Plex : Incomplete]` gold | "Plex" opens Plex, "Incomplete" toggles panel |

**Styling:**
- **Owned:** Dark pill (`#282828`), gold Plex chevron icon (inline SVG), white "Plex" text, gold border (`#ebaf00`)
- **Not owned:** Dark pill (`#3a3a3a`), gray Plex chevron, gray text, gray border (`#555`)
- **Error:** Red pill (`#f44336`) with white "!" text and tooltip

When gap data is available, the pill transitions to split-click mode: the left zone ("Plex" + icon) is an `<a>` link to Plex Web, and the right zone (": Complete" or ": Incomplete") toggles the floating gap panel.

### Floating Gap Panels

Gap panels (collection and episode) float as `position: absolute` children of the badge wrapper. This avoids layout shift compared to injecting block-level elements into the page DOM.

- Default: drops down from badge, left-aligned
- Smart positioning via `requestAnimationFrame` + `getBoundingClientRect`: flips above if near viewport bottom, right-aligns if near right edge
- Sizing: `min-width: 280px`, `max-width: 400px`, `max-height: 400px` with scroll
- Dismissed by clicking toggle again or clicking anywhere outside the badge
- Panel DOM stays in memory when hidden (preserves expand/collapse state)

### Collection Gap Panel

Shown when viewing a movie that belongs to a TMDB collection:

```
+-------------------------------------------+
| > Spy Saga Collection -- 2 of 5 owned     |  <- collapsed by default
+-------------------------------------------+
|  [check] The First Mission (2002)  [Plex] |  <- owned, links to Plex
|  [check] The Sequel (2004)         [Plex] |
|  [x] The Third One (2007)                 |  <- missing
|  [x] The Reboot (2012)                    |
|  [x] The Finale (2020)                    |
+-------------------------------------------+
```

### Episode Gap Panel

Shown when viewing an owned TV show with missing episodes:

```
+----------------------------------------------+
| > 52 of 65 episodes - 3 of 5 seasons full    |
|----------------------------------------------|
|  S1     20/20                                 |
|  S2     20/20                                 |
|  S3     12/15  (missing 3)                    |
|  S4     10/10                                 |
|  S5      0/20  (missing all)                  |
+----------------------------------------------+
```

### Toolbar Icon

The extension toolbar icon is a rounded "P" drawn dynamically via `OffscreenCanvas` at multiple resolutions (16, 32, 48, 128px):

- **Owned:** Black background, gold border, white P
- **Not owned:** Dark gray background, gray border, gray P
- **Inactive:** Light gray background, gray border, dark gray P (default state)

Icon state is set per-tab based on CHECK results.

---

## Options Page

Full-tab settings page with four sections:

### 1. Plex Server
- Server URL input
- Token input (password field)
- Test Connection button with feedback
- Save & Sync button (validates, saves config, builds library index)
- Status display (item count, last sync timestamp)

### 2. API Keys
- TMDB API key input + Validate button (required for collection/episode gap features)
- TVDB API key input + Validate button (optional, for more accurate TV episode numbering)

### 3. Gap Detection
- Toggle: "Exclude future/unreleased movies" (default: on)
- Toggle: "Exclude specials (Season 0)" (default: on)
- Number input: "Minimum collection size" (default: 2, min: 2)
- Number input: "Minimum owned to show gaps" (default: 2, min: 1)

### 4. Cache Management
- Display: "Library index: X items, last synced Y"
- Button: "Refresh Library" (rebuilds index)
- Button: "Clear All Cache" (clears `storage.local`)

---

## Manifest V3

The manifest is auto-generated by WXT from `wxt.config.ts` and the entrypoints directory structure.

Key permissions:
- `storage` — for `browser.storage.sync` (config, options) and `browser.storage.local` (index, caches)
- `host_permissions`:
  - `http://*/library/*`, `https://*/library/*` — Plex API access
  - `https://api.themoviedb.org/*` — TMDB API
  - `https://api4.thetvdb.com/*` — TVDB API

Content script URL matches are defined in each `*.content.ts` file via WXT's `defineContentScript()`.

### Versioning

Version format: `Major.A.B` (e.g. `1.12.15`)

| Segment | Meaning | How it changes |
|---------|---------|----------------|
| Major | Major version | Manual edit in `package.json` |
| A | Commit number | `npm run version:commit` (resets B to 0) |
| B | Build number | Auto-incremented on every `npm run build` via prebuild hook |

Single source of truth is `package.json`; `wxt.config.ts` reads from it.

---

## Error Handling

### User-Facing Errors

| Error | User Experience |
|-------|----------------|
| No Plex URL/token configured | Popup prompts setup |
| Plex server unreachable | Badge shows error icon, tooltip explains |
| Invalid token (401) | Popup shows "Authentication failed -- check your token" |
| Library not found (404) | "Library not found" message |
| Timeout | "Plex server not responding" |
| Network error | "Cannot reach Plex server -- check URL" |
| Library empty | Badge shows "No libraries found" |
| Unsupported page | Extension stays dormant |
| Invalid TMDB key | Options page shows validation error |
| Invalid TVDB key | Options page shows validation error |

---

## Key Patterns from ComPlexionist

These patterns are proven in the desktop app and guide extension development:

### Cache TTL Strategy

ComPlexionist uses conditional TTLs based on content type. Parrot currently uses:
- **Library index:** 24 hours (flat)
- **Collection cache:** 30 days
- **Episode gap cache:** 24 hours

### Date Timezone Buffer

ComPlexionist uses `< date.today()` (strict less-than) instead of `<=` for release dates, adding a 1-day buffer for timezone differences. Parrot applies the same logic when filtering future episodes and unreleased collection movies.

### GUID Extraction

The external ID extraction from Plex `guids` arrays is identical in both projects. The patterns are:
- `tmdb://(\d+)` — TMDB numeric ID
- `tvdb://(\d+)` — TVDB numeric ID
- `imdb://(tt\d+)` — IMDb string ID

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (strict mode) |
| Build | WXT 0.19.x (Vite-based extension framework) |
| Testing | Vitest |
| Linting | ESLint + Prettier |
| Target | Chrome (primary), Firefox (secondary) |
| Runtime | Manifest V3 service worker + content scripts |

---

## Future Ideas

See [`docs/TODO.md`](TODO.md) for the full roadmap. Key areas:

- **Additional Sites:** Metacritic, TV Time, Simkl
- **Multi-Server Support:** Allow multiple Plex server configurations
- **Advanced Settings:** Per-site toggles, badge position, refresh interval
- **Publishing:** Chrome Web Store and Firefox Add-ons submission
- **Integration:** Shared ignore lists with ComPlexionist
