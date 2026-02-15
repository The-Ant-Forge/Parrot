# Parrot — Browser Extension Specification

## Overview

Parrot is a browser extension that tells you whether media you're browsing on the web is already in your Plex library. When you land on a movie or TV show page on a supported site, Parrot shows a badge indicating whether you own it or not.

**Companion to ComPlexionist** — ComPlexionist finds gaps in your library; Parrot prevents you from hunting for something you already have.

---

## How It Works

1. User browses to a supported page (e.g., `themoviedb.org/movie/550-fight-club`)
2. Content script extracts the media's external ID from the page URL or DOM
3. Extension checks the ID against a cached index of the user's Plex library
4. Badge/overlay shows ownership status

---

## Supported Sites

| Site | URL Pattern | ID Source | Badge Target |
|------|-------------|-----------|--------------|
| **TMDB** | `themoviedb.org/movie/{id}` | TMDB numeric ID from URL | Title heading |
| **TMDB** | `themoviedb.org/tv/{id}` | TMDB numeric ID from URL | Title heading |
| **TVDB** | `thetvdb.com/series/{slug}` | TVDB numeric ID from page links | `h1` |
| **IMDb** | `imdb.com/title/{ttID}` | IMDb ID (`tt\d+`) from URL | Hero title block |
| **NZBGeek** | `nzbgeek.info/geekseek.php?movieid={id}` | TMDB/IMDb from page links | `span.overlay_title` |
| **NZBGeek** | `nzbgeek.info/geekseek.php?tvid={id}` | TVDB from page links | `span.overlay_title` |
| **RARGB** | `rargb.to/torrent/*` | TMDB/IMDb/TVDB from page links | `h1` |
| **NZBForYou** | `nzbforyou.com/viewtopic.php` | IMDb from page links | `h2.topic-title` + `h3.first` |

### ID Extraction Strategies

**URL-based** (TMDB, IMDb): ID is extracted directly from the page URL.
```javascript
// TMDB: https://www.themoviedb.org/movie/550-the-sparring-partner
url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);

// IMDb: https://www.imdb.com/title/tt0137523/
url.match(/imdb\.com\/title\/(tt\d+)/);
```

**Link-scanning** (NZBGeek, RARGB, NZBForYou): The page contains links to external databases (TMDB, IMDb, TVDB). Parrot scans all `<a>` elements for matching hrefs.

**DOM metadata** (TVDB): Numeric TVDB ID is extracted from links within the page, not the URL slug.

### Media Type Detection

- **TMDB**: URL path (`/movie/` vs `/tv/`) determines type
- **IMDb**: URL doesn't distinguish — Parrot checks both movie and show indexes
- **NZBGeek**: URL parameter (`movieid` vs `tvid`) determines type
- **RARGB**: Inferred from which external link is found (TVDB = show, TMDB path tells us)
- **NZBForYou**: Breadcrumb (`li.breadcrumb`) text containing "TV" or "Movies"

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
│   │   └── popup/
│   │       ├── index.html             # Settings/status UI
│   │       ├── main.ts                # Popup logic
│   │       └── style.css              # Popup styles
│   ├── api/
│   │   └── plex.ts                    # Plex API client
│   └── common/
│       ├── types.ts                   # Shared types
│       ├── storage.ts                 # Storage helpers
│       └── badge.ts                   # Page badge component
├── scripts/
│   ├── bump-build.js                  # Auto-increment build number (B)
│   └── bump-commit.js                 # Bump commit number (A), reset B
├── wxt.config.ts                      # WXT/Vite config (manifest auto-generated)
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

### Component Responsibilities

**Service Worker (background)**
- Manages the Plex library index cache
- Proxies Plex API requests (avoids CORS issues from content scripts)
- Responds to "check this ID" messages from content scripts
- Refreshes the library index on a configurable interval

**Content Scripts**
- One per supported site (7 scripts total)
- Extracts media ID from URL or by scanning page links
- Sends ID to service worker for lookup
- Injects ownership badge into the page
- SPA-aware: uses MutationObserver on TMDB for client-side navigation

**Popup**
- Configuration UI (Plex URL, token)
- Connection test button
- Cache status (last refresh, item count)
- Manual refresh button

---

## Plex API Integration

### Authentication

Plex uses a custom token passed as a header or URL parameter:

```
Header: X-Plex-Token: {token}
  — or —
URL: http://192.168.1.100:32400/library/sections?X-Plex-Token={token}
```

**Getting a token:** Users find their token in Plex Settings > Account > Authorized Devices, or from browser dev tools while logged into Plex Web.

### Key Endpoints

```
Base URL: http://{server}:{port}  (default port 32400)

GET /library/sections
→ Returns all libraries (type: "movie", "show", etc.)

GET /library/sections/{sectionId}/all?includeGuids=1
→ Returns all items in a library with external GUIDs
→ Request Accept: application/json for JSON response
→ IMPORTANT: includeGuids=1 is required to get external IDs
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

**Extraction patterns (from ComPlexionist):**
```typescript
function extractExternalIds(guids: Array<{id: string}>): ExternalIds {
  const ids: ExternalIds = {};

  for (const guid of guids) {
    const id = guid.id;

    // TMDB: tmdb://12345
    const tmdbMatch = id.match(/tmdb:\/\/(\d+)/);
    if (tmdbMatch) ids.tmdb_id = parseInt(tmdbMatch[1]);

    // TVDB: tvdb://12345
    const tvdbMatch = id.match(/tvdb:\/\/(\d+)/);
    if (tvdbMatch) ids.tvdb_id = parseInt(tvdbMatch[1]);

    // IMDb: imdb://tt1234567
    const imdbMatch = id.match(/imdb:\/\/(tt\d+)/);
    if (imdbMatch) ids.imdb_id = imdbMatch[1];
  }

  return ids;
}
```

---

## Library Index Cache

### Strategy

On first setup (and periodic refresh), Parrot fetches all items from each Plex library and builds a local index mapping external IDs to owned items:

```typescript
interface LibraryIndex {
  movies: {
    byTmdbId: Record<string, OwnedItem>;
    byImdbId: Record<string, OwnedItem>;
  };
  shows: {
    byTvdbId: Record<string, OwnedItem>;
    byTmdbId: Record<string, OwnedItem>;
    byImdbId: Record<string, OwnedItem>;
  };
  lastRefresh: number;  // timestamp
  itemCount: number;
}

interface OwnedItem {
  title: string;
  year?: number;
  plexKey: string;  // ratingKey for deep linking
}
```

Note: Uses `Record<string, OwnedItem>` instead of `Map` because `browser.storage` only stores JSON-serializable data.

### Refresh Policy

| Scenario | Action |
|----------|--------|
| First install | Full index build on setup |
| Extension startup | Use cached index if < 24 hours old |
| Manual refresh | User clicks refresh in popup |
| Stale cache | Auto-refresh if index > 24 hours old |

### Storage

- `browser.storage.local` for the library index (can be large)
- `browser.storage.sync` for settings (Plex URL, token) — syncs across devices

---

## Content Script Behaviour

### Page Load Flow

```
1. Page loads on supported site
2. Content script activates (URL match in manifest)
3. Extract media ID from URL/DOM
4. Send message to service worker: { type: "CHECK", mediaType: "movie", tmdbId: 550 }
5. Service worker looks up ID in cached index
6. Response: { owned: true, title: "Fight Club", year: 1999 }
7. Content script injects badge into page
```

### Page Badge

A compact pill badge injected next to the title element on each supported page:

- **Owned:** Dark pill (`#282828`), gold Plex chevron icon, white "Plex" text, gold border
- **Not owned:** Dark pill (`#3a3a3a`), gray Plex chevron icon, gray "Plex" text, gray border
- **Error:** Red pill with "!" text

The badge always shows on qualifying pages so users can confirm the extension is active. The Plex chevron is rendered as inline SVG extracted from the official logo.

### Toolbar Icon

The extension toolbar icon is a rounded "P" drawn dynamically via OffscreenCanvas:

- **Owned:** Black background, gold border, white P
- **Not owned:** Dark gray background, gray border, gray P
- **Inactive:** Light gray background, gray border, dark gray P (default state)

Icon state is set per-tab based on CHECK results.

---

## Manifest V3

The manifest is auto-generated by WXT from `wxt.config.ts` and the entrypoints directory structure. Key permissions:

- `storage` — for `browser.storage.sync` (config) and `browser.storage.local` (library index)
- `host_permissions: ["http://*/library/*", "https://*/library/*"]` — for Plex API access

Content script URL matches are defined in each `*.content.ts` file via `defineContentScript()`.

### Versioning

Version format: `Major.A.B` (e.g. `1.3.12`)

| Segment | Meaning | How it changes |
|---------|---------|----------------|
| Major | Major version | Manual edit in `package.json` |
| A | Commit number | `npm run version:commit` (resets B to 0) |
| B | Build number | Auto-incremented on every `npm run build` |

Single source of truth is `package.json`; `wxt.config.ts` reads from it.

---

## Error Handling

| Error | User Experience |
|-------|----------------|
| No Plex URL/token configured | Popup prompts setup |
| Plex server unreachable | Badge shows error icon, tooltip explains |
| Invalid token (401) | Popup shows "Authentication failed — check your token" |
| Library empty | Badge shows "No libraries found" |
| Unsupported page | Extension stays dormant |

---

## Tech Stack

- **Language:** TypeScript
- **Build:** WXT (Vite-based browser extension framework)
- **Testing:** Vitest
- **Linting:** ESLint + Prettier
- **Target browsers:** Chrome (primary), Firefox (secondary)

---

## Future Ideas

- Deep link badge to open the item directly in Plex Web
- Show which episodes you have for a TV show page
- Support for additional sites (Letterboxd, Trakt, JustWatch)
- Configurable badge styles/positions
- Multi-server support
- Integration with ComPlexionist's ignore lists
