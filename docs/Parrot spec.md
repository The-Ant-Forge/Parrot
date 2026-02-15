# Parrot — Browser Extension Specification

## Overview

Parrot is a browser extension that tells you whether media you're browsing on the web is already in your Plex library. When you land on a movie or TV show page on a supported site, Parrot shows a badge indicating whether you own it or not.

**Companion to ComPlexionist** — ComPlexionist finds gaps in your library; Parrot prevents you from hunting for something you already have.

**Repository:** [github.com/StephKoenig/Parrot](https://github.com/StephKoenig/Parrot)
**Parent project:** [github.com/StephKoenig/ComPlexionist](https://github.com/StephKoenig/ComPlexionist)

---

## How It Works

1. User browses to a supported page (e.g., `themoviedb.org/movie/550-fight-club`)
2. Content script extracts the media's external ID from the page URL or DOM
3. Extension sends a `CHECK` message to the service worker
4. Service worker looks up the ID in a cached index of the user's Plex library
5. Response flows back with ownership status and deep-link data
6. Content script injects an ownership badge next to the title
7. Toolbar icon updates per-tab to reflect ownership state

---

## Supported Sites

| Site | URL Pattern | ID Source | Badge Target |
|------|-------------|-----------|--------------|
| **TMDB** | `themoviedb.org/movie/{id}` | TMDB numeric ID from URL | `section.inner_content h2 a` |
| **TMDB** | `themoviedb.org/tv/{id}` | TMDB numeric ID from URL | `section.inner_content h2 a` |
| **TVDB** | `thetvdb.com/series/{slug}` | TVDB numeric ID from page links | `h1` |
| **IMDb** | `imdb.com/title/{ttID}` | IMDb ID (`tt\d+`) from URL | `h1[data-testid="hero-title-block__title"]` |
| **NZBGeek** | `nzbgeek.info/geekseek.php?movieid={id}` | TMDB/IMDb from page links | `span.overlay_title` |
| **NZBGeek** | `nzbgeek.info/geekseek.php?tvid={id}` | TVDB from page links | `span.overlay_title` |
| **RARGB** | `rargb.to/torrent/*` | TMDB/IMDb/TVDB from page links | `h1` |
| **NZBForYou** | `nzbforyou.com/viewtopic.php` | IMDb from page links | `h2.topic-title` + `h3.first` |
| **PSA** | `psa.wf/movie/{slug}` | Title-based matching from URL slug | `h1.post-title` |
| **PSA** | `psa.wf/tv-show/{slug}` | Title-based matching from URL slug | `h1.post-title` |

### ID Extraction Strategies

**URL-based** (TMDB, IMDb): ID is extracted directly from the page URL.
```typescript
// TMDB: https://www.themoviedb.org/movie/550-the-sparring-partner
url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);

// IMDb: https://www.imdb.com/title/tt0137523/
url.match(/imdb\.com\/title\/(tt\d+)/);
```

**Link-scanning** (NZBGeek, RARGB, NZBForYou): The page contains links to external databases (TMDB, IMDb, TVDB). Parrot scans all `<a>` elements for matching hrefs.

**DOM metadata** (TVDB): Numeric TVDB ID is extracted from links within the page (e.g., `/series/{id}/edit`), not the URL slug.

**Title-based** (PSA): No external IDs exist on the page. Parrot parses the URL slug into a normalized title and optional year, then matches against a title-based index built from Plex library data. The slug `some-movie-2025` becomes key `"some movie|2025"`. A fallback lookup without the year handles cases where the slug omits it.

### Media Type Detection

- **TMDB**: URL path (`/movie/` vs `/tv/`) determines type
- **IMDb**: URL doesn't distinguish — Parrot checks both movie and show indexes
- **NZBGeek**: URL parameter (`movieid` vs `tvid`) determines type
- **RARGB**: Inferred from which external link is found (TVDB = show, TMDB path tells us)
- **NZBForYou**: Breadcrumb (`li.breadcrumb`) text containing "TV" or "Movies"
- **PSA**: URL path (`/movie/` vs `/tv-show/`) determines type

### SPA Navigation

TMDB, IMDb, and TVDB are single-page applications. Content scripts use `MutationObserver` to detect client-side navigation and re-run the check-and-badge flow when the URL changes.

---

## Architecture

```
parrot/
├── src/
│   ├── entrypoints/
│   │   ├── background.ts              # Library cache, Plex API proxy, icon rendering
│   │   ├── tmdb.content.ts            # TMDB content script
│   │   ├── imdb.content.ts            # IMDb content script
│   │   ├── tvdb.content.ts            # TVDB content script
│   │   ├── nzbgeek.content.ts         # NZBGeek content script
│   │   ├── rargb.content.ts           # RARGB content script
│   │   ├── nzbforyou.content.ts       # NZBForYou content script
│   │   ├── psa.content.ts             # PSA content script (title-based)
│   │   └── popup/
│   │       ├── index.html             # Settings/status UI
│   │       ├── main.ts                # Popup logic
│   │       └── style.css              # Popup styles
│   ├── api/
│   │   └── plex.ts                    # Plex API client
│   └── common/
│       ├── types.ts                   # Shared types (LibraryIndex, OwnedItem, etc.)
│       ├── storage.ts                 # Storage helpers
│       ├── badge.ts                   # Page badge component
│       └── normalize.ts              # Title normalization for slug-based matching
├── scripts/
│   ├── bump-build.js                  # Auto-increment build number (B)
│   └── bump-commit.js                 # Bump commit number (A), reset B
├── wxt.config.ts                      # WXT/Vite config (manifest auto-generated)
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

### Component Responsibilities

**Service Worker (`background.ts` — 246 lines)**
- Manages the Plex library index cache (in-memory + `storage.local`)
- Proxies Plex API requests (avoids CORS issues from content scripts)
- Responds to `CHECK`, `TEST_CONNECTION`, `BUILD_INDEX`, `GET_STATUS` messages
- Renders dynamic per-tab toolbar icons via `OffscreenCanvas`
- Auto-refreshes stale cache on startup (>24h threshold)

**Content Scripts (8 scripts, ~60-100 lines each)**
- One per supported site
- Extracts media ID from URL or by scanning page links
- Sends `CHECK` message to service worker
- Injects ownership badge into the page DOM
- SPA-aware: uses `MutationObserver` on TMDB/IMDb/TVDB

**Popup (`popup/` — 165 lines + HTML/CSS)**
- Configuration UI (Plex URL, token)
- Connection test button with feedback
- Cache status (last refresh timestamp, item count)
- Manual refresh button
- Relative time display ("5m ago", "2h ago")

### Data Flow

```
Content Script → Message → Service Worker → Library Index
                                ↓
                          CheckResponse
                                ↓
Badge + Icon ← Content Script
```

### Message Protocol

```typescript
type Message =
  | { type: "TEST_CONNECTION"; config: PlexConfig }
  | { type: "BUILD_INDEX" }
  | { type: "GET_STATUS" }
  | { type: "CHECK"; mediaType: "movie"|"show"; source: "tmdb"|"imdb"|"tvdb"|"title"; id: string }
```

Content scripts always go through the service worker — they never call the Plex API directly.

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

## Library Index Cache

### Structure

```typescript
interface LibraryIndex {
  movies: {
    byTmdbId: Record<string, OwnedItem>;    // "550" → item
    byImdbId: Record<string, OwnedItem>;    // "tt0137523" → item
    byTitle: Record<string, OwnedItem>;     // "fight club|1999" → item
  };
  shows: {
    byTvdbId: Record<string, OwnedItem>;    // "81189" → item
    byTmdbId: Record<string, OwnedItem>;
    byImdbId: Record<string, OwnedItem>;
    byTitle: Record<string, OwnedItem>;
  };
  lastRefresh: number;  // Unix timestamp
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
normalizeTitle("Fight Club") → "fight club"
normalizeTitle("The-Dark-Knight") → "the dark knight"
buildTitleKey("Fight Club", 1999) → "fight club|1999"
parseSlug("the-dark-knight-2008") → { title: "the dark knight", year: 2008 }
```

Lookup tries `"title|year"` first, falls back to `"title"` only.

### Refresh Policy

| Scenario | Action |
|----------|--------|
| First install | Full index build on setup |
| Extension startup | Load cached if < 24 hours old |
| Stale cache (> 24h) | Auto-refresh in background |
| Manual refresh | User clicks "Refresh Library" in popup |

### Storage

| Store | Contents | Notes |
|-------|----------|-------|
| `browser.storage.sync` | Plex URL, token, machineIdentifier | Syncs across devices |
| `browser.storage.local` | Library index cache | Can be large (1000+ items) |

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
}
```

### Page Badge

A compact pill badge injected next to the title element on each supported page:

- **Owned:** Dark pill (`#282828`), gold Plex chevron icon (inline SVG), white "Plex" text, gold border (`#ebaf00`)
- **Not owned:** Dark pill (`#3a3a3a`), gray Plex chevron, gray text, gray border (`#888`/`#555`)
- **Error:** Red pill (`#f44336`) with white "!" text

When owned, the badge becomes a clickable `<a>` element linking to the item in Plex Web.

### Toolbar Icon

The extension toolbar icon is a rounded "P" drawn dynamically via `OffscreenCanvas` at multiple resolutions (16, 32, 48, 128px):

- **Owned:** Black background, gold border, white P
- **Not owned:** Dark gray background, gray border, gray P
- **Inactive:** Light gray background, gray border, dark gray P (default state)

Icon state is set per-tab based on CHECK results.

---

## Manifest V3

The manifest is auto-generated by WXT from `wxt.config.ts` and the entrypoints directory structure.

```typescript
// wxt.config.ts
export default defineConfig({
  srcDir: "src",
  entrypointsDir: "entrypoints",
  manifest: {
    name: "Parrot",
    description: "See if media you're browsing is already in your Plex library",
    version: pkg.version,
    permissions: ["storage"],
    host_permissions: ["http://*/library/*", "https://*/library/*"],
  },
});
```

Key permissions:
- `storage` — for `browser.storage.sync` (config) and `browser.storage.local` (index)
- `host_permissions` — for Plex API access (user's local server)

Content script URL matches are defined in each `*.content.ts` file via WXT's `defineContentScript()`.

### Versioning

Version format: `Major.A.B` (e.g. `1.3.12`)

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
| Invalid token (401) | Popup shows "Authentication failed — check your token" |
| Library not found (404) | "Library not found" message |
| Timeout | "Plex server not responding" |
| Network error | "Cannot reach Plex server — check URL" |
| Library empty | Badge shows "No libraries found" |
| Unsupported page | Extension stays dormant |

These patterns mirror ComPlexionist's `get_friendly_message()` error mapping (see `src/complexionist/gui/errors.py`).

---

## Key Patterns from ComPlexionist

These patterns are proven in the desktop app and should guide extension development:

### Cache TTL Strategy

ComPlexionist uses conditional TTLs based on content type:
- **Ended shows:** Longer cache (data won't change)
- **Continuing shows:** Shorter cache (new episodes expected)
- **Movies in collections:** 30 days
- **Movies without collections:** 7 days

Consider similar tiered refresh for the library index — e.g., don't rebuild for items that haven't changed. Currently Parrot uses a flat 24h refresh for the entire index.

### Date Timezone Buffer

ComPlexionist uses `< date.today()` (strict less-than) instead of `<=` for release dates, adding a 1-day buffer for timezone differences. Apply the same logic if showing release status in badges (e.g., future episode awareness).

### Error Message Translation

ComPlexionist centralizes API error translation in `gui/errors.py`. HTTP status codes are mapped to user-friendly messages. Parrot should follow the same pattern — never show raw error codes or stack traces to users.

### GUID Extraction

The external ID extraction from Plex `guids` arrays is identical in both projects. The patterns are:
- `tmdb://(\d+)` → TMDB numeric ID
- `tvdb://(\d+)` → TVDB numeric ID
- `imdb://(tt\d+)` → IMDb string ID

Both projects extract these the same way — any improvements should be ported between them.

### BaseAPIClient Pattern

ComPlexionist extracts shared HTTP patterns into a `BaseAPIClient` class with:
- Typed `client` property (asserts connection is active)
- `_handle_response()` with unified error handling
- Cache hit/miss recording for statistics
- Context manager protocol (`__enter__`/`__exit__`)

Consider a similar pattern if Parrot adds more API clients (e.g., TMDB for episode data).

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (strict mode) |
| Build | WXT 0.19.0 (Vite-based extension framework) |
| Testing | Vitest 3.0.0 |
| Linting | ESLint 9.0.0 + Prettier 3.4.0 |
| Target | Chrome (primary), Firefox (secondary) |
| Runtime | Manifest V3 service worker + content scripts |

**Total codebase:** ~1,155 lines of TypeScript across 15 source files.

---

## Future Ideas

See `docs/Parrot TODO.md` for the full roadmap. Key areas:

- **TV Episode Awareness:** Show "You have S01-S03" on TV show pages
- **Additional Sites:** Letterboxd, Trakt, JustWatch, Rotten Tomatoes
- **Collection Awareness:** "You have 3/5 movies in this collection" on TMDB collection pages
- **Multi-Server Support:** Allow multiple Plex server configurations
- **Advanced Settings:** Per-site toggles, badge position, refresh interval
- **Publishing:** Chrome Web Store and Firefox Add-ons submission
- **Integration:** Shared ignore lists with ComPlexionist
