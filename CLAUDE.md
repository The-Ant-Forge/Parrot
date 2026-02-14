# Parrot — Browser Extension

Read agents.md

## Project basics

- **Purpose:** Browser extension that checks if media you're browsing (TMDB, TVDB, IMDb) is already in your Plex library
- **Companion to:** [ComPlexionist](https://github.com/StephKoenig/ComPlexionist) (finds library gaps; Parrot prevents duplicate hunting)
- **Tech stack:** TypeScript, Manifest V3, Vite/WXT
- **Target browsers:** Chrome (primary), Firefox (secondary)

Key files:
- `docs/spec.md` — Full specification and architecture
- `manifest.json` — Extension manifest
- `src/background/service-worker.ts` — Library cache, Plex API proxy
- `src/content/` — Content scripts per supported site
- `src/popup/` — Settings and status popup
- `src/api/plex.ts` — Plex API client
- `tests/` — Vitest test suite

---

## Plex API Reference

### Authentication

```
Header: X-Plex-Token: {token}
Base URL: http://{server}:32400
```

Users get their token from Plex Settings > Account > Authorized Devices.

### Key Endpoints

```
GET /library/sections                           → List all libraries
GET /library/sections/{id}/all                  → All items in a library
```

Request `Accept: application/json` for JSON responses.

### External ID System (GUIDs)

Each Plex item has a `guids` array with external database references:

```json
{ "guids": [{ "id": "tmdb://550" }, { "id": "imdb://tt0137523" }] }
```

**Patterns:**
- TMDB: `tmdb://(\d+)` → numeric ID
- TVDB: `tvdb://(\d+)` → numeric ID
- IMDb: `imdb://(tt\d+)` → string ID

### URL ID Extraction

```typescript
// TMDB: https://www.themoviedb.org/movie/550-fight-club → 550
url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/)

// IMDb: https://www.imdb.com/title/tt0137523/ → tt0137523
url.match(/imdb\.com\/title\/(tt\d+)/)

// TVDB: ID from page metadata or DOM
```

---

## Architecture

```
src/
├── background/service-worker.ts   # Library index cache, Plex API proxy
├── content/
│   ├── tmdb.ts                    # TMDB page content script
│   ├── tvdb.ts                    # TVDB page content script
│   └── imdb.ts                    # IMDb page content script
├── popup/
│   ├── popup.html                 # Settings/status UI
│   └── popup.ts                   # Popup logic
├── api/plex.ts                    # Plex API client
└── common/
    ├── types.ts                   # Shared types
    └── storage.ts                 # Storage helpers
```

### Data Flow

1. Content script extracts media ID from URL/DOM
2. Sends message to service worker: `{ type: "CHECK", mediaType: "movie", tmdbId: 550 }`
3. Service worker checks cached library index
4. Returns ownership status
5. Content script injects badge into page

### Library Index

On setup, Parrot fetches all items from Plex and builds ID lookup maps:
- `movies.byTmdbId`, `movies.byImdbId`
- `shows.byTvdbId`, `shows.byTmdbId`, `shows.byImdbId`

Stored in `browser.storage.local`. Refreshed every 24 hours or on manual trigger.

---

## Development

### Setup
```bash
npm install
```

### Dev mode (with hot reload)
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Test
```bash
npm test
```

### Lint
```bash
npm run lint
```

### Load in Chrome
1. Go to `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select `dist/` folder

---

## Working style

### Keep diffs focused
- One logical change per commit
- Avoid unrelated reformatting

### Planning sessions → write a spec
Whenever we do a planning session (plan mode), always write the finalised specification into `docs/` as a named document. This ensures we have a durable reference if context is lost or the session is interrupted.

### Compile/test locally after changes
1. Make a small, targeted change
2. Run tests/linting after each change
3. Only then commit/push

---

## Storage

| Store | Contents | Notes |
|-------|----------|-------|
| `browser.storage.sync` | Plex URL, token | Syncs across devices |
| `browser.storage.local` | Library index cache | Can be large (1000+ items) |

---

## Error handling

- Invalid/missing token → popup prompts setup
- Server unreachable → badge shows error, tooltip explains
- Unsupported page → extension stays dormant
- Empty library → "No libraries found" message

---

## Supported sites

| Site | URL pattern | ID type |
|------|-------------|---------|
| TMDB | `themoviedb.org/movie/{id}` | TMDB numeric |
| TMDB | `themoviedb.org/tv/{id}` | TMDB numeric |
| IMDb | `imdb.com/title/{ttID}` | IMDb string |
| TVDB | `thetvdb.com/series/{slug}` | TVDB numeric (from DOM) |
