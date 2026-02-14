# Parrot — Browser Extension Specification

## Overview

Parrot is a browser extension that tells you whether media you're browsing on the web is already in your Plex library. When you land on a movie or TV show page on TMDB, TVDB, or IMDb, Parrot lights up to show "You own this" or stays quiet if you don't.

**Companion to ComPlexionist** — ComPlexionist finds gaps in your library; Parrot prevents you from hunting for something you already have.

---

## How It Works

1. User browses to a supported page (e.g., `themoviedb.org/movie/550-fight-club`)
2. Content script extracts the media's external ID from the page URL or DOM
3. Extension checks the ID against a cached index of the user's Plex library
4. Badge/overlay shows ownership status

---

## Supported Sites

| Site | URL Pattern | ID Source |
|------|-------------|-----------|
| **TMDB** | `themoviedb.org/movie/{id}` | TMDB numeric ID from URL |
| **TMDB** | `themoviedb.org/tv/{id}` | TMDB numeric ID from URL |
| **TVDB** | `thetvdb.com/series/{slug}` | TVDB ID from page metadata |
| **IMDb** | `imdb.com/title/{ttID}` | IMDb ID (`tt\d+`) from URL |

### ID Extraction Patterns

```javascript
// TMDB: https://www.themoviedb.org/movie/550-fight-club
const tmdbMatch = url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
// tmdbMatch[1] = "movie" or "tv", tmdbMatch[2] = "550"

// IMDb: https://www.imdb.com/title/tt0137523/
const imdbMatch = url.match(/imdb\.com\/title\/(tt\d+)/);
// imdbMatch[1] = "tt0137523"

// TVDB: ID embedded in page meta tags or API links in DOM
```

---

## Architecture

```
parrot/
├── manifest.json          # Extension manifest (Manifest V3)
├── src/
│   ├── background/
│   │   └── service-worker.ts   # Library cache, Plex API proxy
│   ├── content/
│   │   ├── tmdb.ts             # TMDB page content script
│   │   ├── tvdb.ts             # TVDB page content script
│   │   └── imdb.ts             # IMDb page content script
│   ├── popup/
│   │   ├── popup.html          # Settings/status popup
│   │   └── popup.ts            # Popup logic
│   ├── api/
│   │   └── plex.ts             # Plex API client
│   └── common/
│       ├── types.ts            # Shared types
│       └── storage.ts          # Storage helpers
├── assets/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── tests/
│   └── ...
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
- One per supported site
- Extracts media ID from URL/DOM on page load
- Sends ID to service worker for lookup
- Injects ownership badge into the page

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

GET /library/sections/{sectionId}/all
→ Returns all items in a library with metadata
→ Request Accept: application/json for JSON response

GET /library/sections/{sectionId}/all?X-Plex-Token={token}&type=1
→ Movies (type=1), Shows (type=2)
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
    byTmdbId: Map<number, OwnedItem>;
    byImdbId: Map<string, OwnedItem>;
  };
  shows: {
    byTvdbId: Map<number, OwnedItem>;
    byTmdbId: Map<number, OwnedItem>;
    byImdbId: Map<string, OwnedItem>;
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

### Badge Design

- **Owned:** Green badge — "In your Plex library"
- **Not owned:** No badge (silent by default) or subtle grey badge if user enables "show missing" mode
- **Loading:** Spinner while checking
- **Error:** Red badge with tooltip (connection failed, etc.)

Badge placement per site:
- **TMDB:** Next to the movie/show title
- **IMDb:** Next to the title in the hero section
- **TVDB:** Next to the series title

---

## Manifest V3

```json
{
  "manifest_version": 3,
  "name": "Parrot",
  "description": "See if media you're browsing is already in your Plex library",
  "version": "1.0.0",
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "http://*/library/*",
    "https://*/library/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "*://*.themoviedb.org/movie/*",
        "*://*.themoviedb.org/tv/*"
      ],
      "js": ["src/content/tmdb.js"]
    },
    {
      "matches": ["*://*.imdb.com/title/*"],
      "js": ["src/content/imdb.js"]
    },
    {
      "matches": ["*://*.thetvdb.com/series/*"],
      "js": ["src/content/tvdb.js"]
    }
  ],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "assets/icon-16.png",
      "48": "assets/icon-48.png",
      "128": "assets/icon-128.png"
    }
  }
}
```

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
- **Build:** Vite with CRXJS or WXT (browser extension framework)
- **Testing:** Vitest
- **Linting:** ESLint + Prettier
- **Target browsers:** Chrome (primary), Firefox (secondary)

---

## Future Ideas

- Deep link badge to open the item directly in Plex Web
- Show which episodes you have for a TV show page
- Support for Letterboxd, Trakt, JustWatch
- Configurable badge styles/positions
- Multi-server support
- Integration with ComPlexionist's ignore lists
