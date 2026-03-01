# Parrot — Browser Extension Specification

## Overview

Parrot is a browser extension that tells you whether media you're browsing on the web is already in your Plex library. When you land on a movie or TV show page on a supported site, Parrot shows a badge indicating whether it's in your library. For TV shows in your library, it can also show which episodes you're missing. For movies in TMDB collections, it shows which other movies in the collection are in your library and which are missing.

**Companion to ComPlexionist** — ComPlexionist finds gaps in your library; Parrot prevents you from hunting for something you already have.

**Repository:** [github.com/The-Ant-Forge/Parrot](https://github.com/The-Ant-Forge/Parrot)
**Parent project:** [github.com/The-Ant-Forge/ComPlexionist](https://github.com/The-Ant-Forge/ComPlexionist)

---

## How It Works

1. User browses to a supported page (e.g., `themoviedb.org/movie/550-the-sparring-partner`)
2. Content script extracts the media's external ID from the page URL or DOM
3. Extension sends a `CHECK` message to the service worker
4. Service worker looks up the ID in a cached index of the user's Plex library
5. Response flows back with library status and deep-link data
6. Content script injects a library status badge next to the title
7. Toolbar icon updates per-tab to reflect library status
8. For movies: if part of a TMDB collection, a collection gap panel may appear
9. For TV shows: if in library but missing episodes, an episode gap panel may appear

---

## Supported Sites

| Site | URL Pattern | ID Source | Badge Target |
|------|-------------|-----------|--------------|
| **TMDB** | `themoviedb.org/movie/{id}` | TMDB numeric ID from URL | `section.inner_content h2 a` |
| **TMDB** | `themoviedb.org/tv/{id}` | TMDB numeric ID from URL | `section.inner_content h2 a` |
| **TVDB** | `thetvdb.com/series/{slug}` | TVDB numeric ID from page links | `h1` |
| **TVDB** | `thetvdb.com/movies/{slug}` | TMDB/IMDb from page links | `h1` |
| **IMDb** | `imdb.com/title/{ttID}` | IMDb ID (`tt\d+`) from URL | `h1[data-testid="hero-title-block__title"]` |
| **NZBGeek** | `nzbgeek.info/geekseek.php?movieid={id}` | TMDB/IMDb from page links | `span.overlay_title` |
| **NZBGeek** | `nzbgeek.info/geekseek.php?tvid={id}` | TVDB from page links | `span.overlay_title` |
| **RARGB** | `rargb.to/torrent/*` | TMDB/IMDb/TVDB from page links | `h1` |
| **NZBForYou** | `nzbforyou.com/viewtopic.php` | IMDb from page links (link scan fallback) | `h3.first` |
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
| **Metacritic** | `metacritic.com/movie/{slug}` | IMDb from JSON-LD sameAs (title-based fallback) | `h1` |
| **Metacritic** | `metacritic.com/tv/{slug}` | IMDb from JSON-LD sameAs (title-based fallback) | `h1` |
| **TVMaze** | `tvmaze.com/shows/{id}` | TVDB/IMDb via TVMaze API (free, no key) | `header.columns h1` or `h1` |

### ID Extraction Strategies

**URL-based** (TMDB, IMDb): ID is extracted directly from the page URL.
```typescript
// TMDB: https://www.themoviedb.org/movie/550-the-sparring-partner
url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);

// IMDb: https://www.imdb.com/title/tt0137523/
url.match(/imdb\.com\/title\/(tt\d+)/);
```

**Link-scanning** (NZBGeek, RARGB, NZBForYou, Letterboxd, Trakt, Trakt App, TVDB movies): The page contains links to external databases (TMDB, IMDb, TVDB, TVMaze). A shared `scanLinksForExternalId()` function scans `<a>` elements for matching hrefs. When multiple ID types are found on the same page, **source authority priority** determines which is returned: IMDb > TVDB > TMDB > TVMaze (reduces cross-reference failures). Individual sites can scope the scan to a DOM container (e.g., RARGB scopes to `#description` to avoid sidebar noise). Handles both new-style TVDB URLs (`/series/12345`) and old-style query parameter format (`?tab=series&id=12345`). NZBForYou uses a waterfall: IMDb-specific scan first (fast path), then `scanLinksForExternalId()` as fallback to catch TMDB, TVDB, or TVMaze links.

**DOM metadata** (TVDB): Numeric TVDB ID is extracted from links within the page (e.g., `/series/{id}/edit`), not the URL slug.

**API-resolved** (TVMaze): The page has no external database links. The content script extracts the TVMaze numeric ID from the URL, sends it to the background, which calls the free TVMaze API (`api.tvmaze.com/shows/{id}`) to resolve TVDB and IMDb IDs. The background then looks up those IDs in the library index.

**Title-based** (PSA, Rotten Tomatoes, JustWatch, Metacritic): No external IDs exist on the page (or they have been removed by the site). Parrot normalizes a title and optional year, then matches against a title-based index built from Plex library data using the key `"some movie|2025"`. PSA, Rotten Tomatoes, and Metacritic use an **additive merge**: both the URL slug and h1 text are parsed, and the richest info from each is combined (e.g., slug provides title, h1 provides year). JustWatch parses the h1 text (e.g., `"The Night Manager (2016)"`). Handles both hyphen-separated slugs (`some-movie-2025`) and underscore-separated slugs (`some_movie_2025`). Rotten Tomatoes, JustWatch, and Metacritic try structured data or link scanning first and fall back to title-based matching. If the initial title-based lookup misses, the background resolves a TMDB ID via search and re-checks the library; if found, an `OWNERSHIP_UPDATED` message updates the in-page pill and triggers gap checking.

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
- **Metacritic**: URL path (`/movie/` vs `/tv/`) determines type
- **TVMaze**: Always show (TV-only site)
- **TVDB**: URL path (`/series/` vs `/movies/`) determines type

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
│   │   ├── metacritic.content.ts      # Metacritic content script
│   │   ├── tvmaze.content.ts         # TVMaze content script (API-resolved)
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
│   │   ├── tvdb.ts                    # TVDB v4 API client (optional)
│   │   ├── tvmaze.ts                  # TVMaze API client (free, no key)
│   │   └── omdb.ts                    # OMDb API client (IMDb ratings, optional)
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
│       ├── title-check.ts             # Title-based CHECK with year fallback
│       ├── logger.ts                  # Debug/error logging gated by settings toggle
│       ├── dom-utils.ts               # DOM utilities (waitForElement)
│       └── sites.ts                   # Supported site definitions
├── tests/                             # Vitest test suite (135 tests)
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
- Handles all message types: `CHECK`, `TEST_CONNECTION`, `BUILD_INDEX`, `GET_STATUS`, `GET_OPTIONS`, `SAVE_OPTIONS`, `VALIDATE_TMDB_KEY`, `VALIDATE_TVDB_KEY`, `VALIDATE_OMDB_KEY`, `CLEAR_CACHE`, `CHECK_COLLECTION`, `CHECK_EPISODES`
- Renders dynamic per-tab toolbar icons via `OffscreenCanvas`
- Auto-refreshes stale library index on demand (configurable interval, default 7 days)

**Content Scripts (16 scripts)**
- One per supported site
- Extracts media ID from URL or by scanning page links (shared `scanLinksForExternalId()`)
- Sends `CHECK` message to service worker
- Injects smart badge into the page DOM (wrapper+pill architecture)
- Triggers gap detection via shared `checkGaps()` for items in the library
- SPA-aware: uses shared `observeUrlChanges()` on TMDB/IMDb/TVDB/Trakt/JustWatch

**Options Page (`options/`)**
- Full-tab settings page (4 card sections)
- Plex Servers: multi-server management (add/edit/delete), server list with status dots, library info, Test All/Refresh/Clear, auto-refresh settings
- API key management (TMDB required, TVDB optional) with validation buttons
- Gap detection toggles (exclude future, exclude specials, minimum thresholds)
- Supported sites table with custom site CRUD

**Popup (`popup/`)**
- Quick-access configuration UI (Plex URL, token)
- Connection test button with feedback
- Cache status (last refresh timestamp, item count)
- Settings link to open options page

**API Clients (`api/`)**
- `plex.ts` — Plex server connection, library fetching, episode data
- `tmdb.ts` — TMDB v3 (movies, collections, TV shows/seasons, TVDB-to-TMDB ID conversion, external IDs)
- `tvdb.ts` — TVDB v4 (bearer token auth, paginated episode fetching, key validation)
- `omdb.ts` — OMDb (IMDb ratings lookup, key validation)
- `tvmaze.ts` — TVMaze (free, no key; TVDB/IMDb ID resolution)

### Data Flow

```
Content Script → Message → Service Worker → Library Index / API Clients
                                ↓
                          Response (library status, gaps)
                                ↓
Badge + Panel + Icon ← Content Script
```

### Message Protocol

```typescript
type Message =
  | { type: "TEST_CONNECTION"; config: { serverUrl: string; token: string } }
  | { type: "TEST_ALL_SERVERS" }
  | { type: "BUILD_INDEX" }
  | { type: "GET_STATUS" }
  | { type: "CHECK"; mediaType: "movie"|"show"; source: "tmdb"|"imdb"|"tvdb"|"title"|"tvmaze"; id: string }
  | { type: "GET_OPTIONS" }
  | { type: "SAVE_OPTIONS"; options: ParrotOptions }
  | { type: "VALIDATE_TMDB_KEY"; apiKey: string }
  | { type: "VALIDATE_TVDB_KEY"; apiKey: string }
  | { type: "VALIDATE_OMDB_KEY"; apiKey: string }
  | { type: "CLEAR_CACHE" }
  | { type: "CHECK_COLLECTION"; tmdbMovieId: string }
  | { type: "CHECK_EPISODES"; source: "tvdb" | "tmdb"; id: string }
  | { type: "FIND_TMDB_ID"; source: "imdb" | "tvdb" | "title"; id: string }
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

When media is in the user's library, the badge links directly to it in Plex Web:
```
https://app.plex.tv/desktop/#!/server/{machineIdentifier}/details?key=%2Flibrary%2Fmetadata%2F{ratingKey}
```

The `machineIdentifier` is fetched once during server setup (from `GET /`) and used as the stable server ID (`PlexServerConfig.id`). When an item exists on multiple servers, the deep link points to the first (highest-priority) server that has it. The `ratingKey` comes from the library item data.

---

## External API Clients

### TMDB v3 (`src/api/tmdb.ts`)

Auth: API key as query param (`?api_key={key}`). Base URL: `https://api.themoviedb.org/3`

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `getMovie` | `GET /movie/{id}` | Movie details (collection, vote_average, imdb_id) |
| `getCollection` | `GET /collection/{id}` | All movies in a collection |
| `getTvShow` | `GET /tv/{id}?append_to_response=external_ids` | TV show details with seasons list + IMDb ID |
| `getTvSeason` | `GET /tv/{id}/season/{n}` | Episodes in a season |
| `findByTvdbId` | `GET /find/{tvdbId}?external_source=tvdb_id` | Convert TVDB ID to TMDB ID |
| `findByImdbId` | `GET /find/{imdbId}?external_source=imdb_id` | Convert IMDb ID to TMDB ID (media-type-aware) |
| `searchMovie` | `GET /search/movie?query={q}&year={y}` | Search movie by title + optional year |
| `searchTv` | `GET /search/tv?query={q}&first_air_date_year={y}` | Search TV show by title + optional year |
| `validateTmdbKey` | `GET /configuration` | Key validation (200 = valid) |

### TVDB v4 (`src/api/tvdb.ts`) — Optional

Auth: bearer token via `POST /login` with `{ apikey: "..." }`. Base URL: `https://api4.thetvdb.com/v4`

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `getSeriesEpisodes` | `GET /series/{id}/episodes/default?page={n}` | All episodes (paginated, 500/page) |
| `validateTvdbKey` | `POST /login` | Key validation (login succeeds = valid) |

Token is cached in-memory (service worker lifetime). Auto-retries on 401 (expired token).

Used only when a TVDB API key is configured **and** the source page is TVDB. TMDB pages always use the TMDB API. If no TVDB key is set, TVDB pages fall back to TMDB via `findByTvdbId`.

### OMDb (`src/api/omdb.ts`) — Optional

Auth: API key as query param (`?apikey={key}`). Base URL: `https://www.omdbapi.com`

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `getImdbRating` | `GET /?i={imdbId}&apikey={key}` | Fetch IMDb rating for a title |
| `validateOmdbKey` | `GET /?i=tt0000001&apikey={key}` | Key validation |

Returns `imdbRating` as a string (e.g. `"8.8"`), parsed to a number. Free tier allows 1,000 requests/day. Used to display IMDb ratings on badge pills and popup dashboard. The IMDb ID is obtained from TMDB movie details (`imdb_id` field) or TMDB TV external_ids (`external_ids.imdb_id`).

### TVMaze (`src/api/tvmaze.ts`) — Free, No Key

Base URL: `https://api.tvmaze.com`

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `getTvMazeExternals` | `GET /shows/{id}` | Get TVDB/IMDb IDs for a TVMaze show |
| `lookupByImdb` | `GET /lookup/shows?imdb={id}` | Resolve IMDb ID to TVDB ID |
| `lookupByTvdb` | `GET /lookup/shows?thetvdb={id}` | Resolve TVDB ID to IMDb ID |

Free API with no authentication. Used as a cross-reference bridge for resolving TVDB↔IMDb IDs without requiring a TMDB key.

---

## Library Index Cache

### Structure (Compact Index)

```typescript
interface LibraryIndex {
  items: OwnedItem[];                          // single source of truth
  movies: {
    byTmdbId: Record<string, number>;          // value = index into items[]
    byImdbId: Record<string, number>;
    byTitle: Record<string, number>;
  };
  shows: {
    byTvdbId: Record<string, number>;
    byTmdbId: Record<string, number>;
    byImdbId: Record<string, number>;
    byTitle: Record<string, number>;
  };
  lastRefresh: number;
  itemCount: number;
  movieCount: number;
  showCount: number;
}

interface OwnedItem {
  title: string;
  year?: number;
  plexKeys: Record<string, string>;  // serverId → ratingKey (supports multiple Plex servers)
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
}
```

Items are stored once in a flat `items[]` array. Lookup maps hold numeric indices into `items[]` instead of duplicating the full `OwnedItem`, reducing storage usage by ~60%. Uses `Record` instead of `Map` because `browser.storage` only stores JSON-serializable data.

Two-step lookup: `map[id]` → index → `items[index]` → `OwnedItem`.

### Index Building (Multi-Server Merge)

1. For each configured server (in priority order):
   a. Fetch all library sections via `GET /library/sections`
   b. Filter to `movie` and `show` types only
   c. For each section, fetch all items with `includeGuids=1`
   d. Extract external IDs from the `guids` array on each item
   e. Try to find existing item in index by matching any shared external ID
   f. If found: add this server's plexKey to existing item's `plexKeys`, enrich with any new IDs
   g. If new: create OwnedItem, push to `items[]`, set all lookup map entries to the new index
2. For title-based matching, store both `"title|year"` and `"title"` keys
3. Store the full index in `browser.storage.local`
4. Cache in-memory for fast lookups (avoid hitting storage on every CHECK)

When resolving a Plex deep link, servers are checked in priority order (array position). The first server that has the item provides the link.

### Title Normalization

For sites without external IDs (PSA), Parrot normalizes titles for fuzzy matching. The normalization pipeline:
1. **NFD decomposition** — splits accented characters into base + combining mark (e.g. e with acute → e + combining acute)
2. **Strip diacritics** — removes combining marks (`[\u0300-\u036f]`)
3. **Lowercase** — case-insensitive matching
4. **Hyphens to spaces** — URL slugs use hyphens
5. **Strip punctuation** — removes all non-alphanumeric except spaces
6. **Collapse whitespace** — single spaces, trimmed

```typescript
normalizeTitle("The Sparring Partner") → "the sparring partner"
normalizeTitle("The-Dark-Corridors") → "the dark corridors"
normalizeTitle("Creme Brulee") → "creme brulee"  // accents decomposed
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
| `browser.storage.sync` | Plex servers array (`PlexServerConfig[]`), options, custom sites | Syncs across devices |
| `browser.storage.local` | Library index (compact), collection cache (30d TTL), episode gap cache (24h TTL) | `unlimitedStorage` removes 10MB cap |

---

## Gap Detection

### Collection Gaps (TMDB Movies)

When viewing a movie page on any supported site, Parrot checks if the movie belongs to a TMDB collection. The collection panel appears for any movie in a partially-complete collection (not just movies in your library). The badge upgrades from gray to gold `Plex : Incomplete` when a movie not in your library belongs to a collection where you have at least some entries.

- Triggered by `CHECK_COLLECTION` message after library status badge (for all movies, not just those in library)
- Uses TMDB API (`getMovie` → `getCollection`)
- Collection data cached 30 days in `storage.local`
- Respects `excludeFuture` and `minCollectionSize`/`minOwned` options
- Panel shows movies in library (gold checkmark, Plex deep link) and missing movies (gray X)
- Cross-reference fallback: if a direct IMDb/TVDB lookup misses, Parrot resolves to TMDB ID via the TMDB API and retries
- Title-based sources (PSA, RT, JustWatch, Metacritic title fallback) resolve to TMDB ID via TMDB search by title+year through `FIND_TMDB_ID` with `source: "title"`

### Episode Gaps (TV Shows)

When viewing a TV show page on TMDB or TVDB, if the show is in the user's library but missing episodes, a collapsible season-level panel appears.

- Triggered by `CHECK_EPISODES` message after library status badge (for shows in library only)
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

**Four states (with optional rating):**

| State | Appearance | Interaction |
|-------|-----------|-------------|
| Not in library | `[Plex]` gray | None |
| Not in library + incomplete collection | `[Plex : Incomplete]` gold | "Plex" links to Plex, "Incomplete" toggles collection panel |
| In library (no gap data) | `[Plex]` gold | Click opens Plex |
| In library + complete | `[Plex : Complete]` gold | "Plex" opens Plex, "Complete" toggles panel |
| In library + incomplete | `[Plex : Incomplete]` gold | "Plex" opens Plex, "Incomplete" toggles panel |

When ratings are available (TMDB and/or IMDb via OMDb), the averaged score appears after "Plex" text: `[Plex 7.2]` or `[Plex 7.2 : Complete]`. Ratings are delivered asynchronously via a `RATINGS_READY` message from the background and rendered with a gold accent color.

**Styling:**
- **In library:** Dark pill (`#282828`), gold Plex chevron icon (inline SVG), white "Plex" text, gold border (`#ebaf00`)
- **Not in library:** Dark pill (`#3a3a3a`), gray Plex chevron, gray text, gray border (`#555`)
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
| > Spy Saga Collection -- 2 of 5 in library |  <- collapsed by default
+-------------------------------------------+
|  [check] The First Mission (2002)  [Plex] |  <- in library, links to Plex
|  [check] The Sequel (2004)         [Plex] |
|  [x] The Third One (2007)                 |  <- missing
|  [x] The Reboot (2012)                    |
|  [x] The Finale (2020)                    |
+-------------------------------------------+
```

### Episode Gap Panel

Shown when viewing a TV show in your library with missing episodes:

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

- **In library:** Black background, gold border, white P
- **Not in library:** Dark gray background, gray border, gray P
- **Inactive:** Light gray background, gray border, dark gray P (default state)

Icon state is set per-tab based on CHECK results.

---

## Options Page

Full-tab settings page with four sections:

### 1. Plex Servers
- Server list: each server displayed as a row with status dot (green/red), name, edit (pen) and delete (X) buttons
- Add/Edit Server form: Server URL input, Token input (password), Save button (validates via TEST_CONNECTION, extracts machineIdentifier + friendlyName)
- Library info: item count, last synced, storage usage
- Buttons: Test All (tests all servers in parallel), Refresh Library (rebuilds merged index), Clear Library
- Auto-refresh toggle with configurable interval (days)
- Servers are stored in priority order (first = primary for deep linking)
- On page load, TEST_ALL_SERVERS runs and status dots update

### 2. API Keys
- TMDB API key input + Validate button (required for collection/episode gap features)
- TVDB API key input + Validate button (optional, for more accurate TV episode numbering)
- OMDb API key input + Validate button (optional, enables IMDb ratings on badges and popup)

### 3. Gap Detection
- Toggle: "Exclude future/unreleased movies" (default: on)
- Toggle: "Exclude specials (Season 0)" (default: on)
- Number input: "Minimum collection size" (default: 2, min: 2)
- Number input: "Minimum in library to show gaps" (default: 2, min: 1)

### 4. Supported Sites
- Table of built-in and custom site definitions
- Add/remove custom sites

---

## Manifest V3

The manifest is auto-generated by WXT from `wxt.config.ts` and the entrypoints directory structure.

Key permissions:
- `storage` — for `browser.storage.sync` (config, options) and `browser.storage.local` (index, caches)
- `unlimitedStorage` — removes 10MB cap on `storage.local` for large multi-server indexes
- `host_permissions`:
  - `http://*/library/*`, `https://*/library/*` — Plex API access
  - `https://api.themoviedb.org/*` — TMDB API
  - `https://api4.thetvdb.com/*` — TVDB API
  - `https://www.omdbapi.com/*` — OMDb API
  - `https://api.tvmaze.com/*` — TVMaze API

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
| Invalid OMDb key | Options page shows validation error |

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
| Build | WXT 0.20.x (Vite-based extension framework) |
| Testing | Vitest |
| Linting | ESLint + Prettier |
| Target | Chrome (primary), Firefox (secondary) |
| Runtime | Manifest V3 service worker + content scripts |

---

## Future Ideas

See [`docs/TODO.md`](TODO.md) for the full roadmap. Key areas:

- **Additional Sites:** TV Time, Simkl
- **Advanced Settings:** Per-site toggles, badge position
- **Publishing:** Chrome Web Store and Firefox Add-ons submission
- **Integration:** Shared ignore lists with ComPlexionist
