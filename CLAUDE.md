# Parrot — Browser Extension

Read agents.md

## Project basics

- **Purpose:** Browser extension that checks if media you're browsing (TMDB, TVDB, IMDb) is already in your Plex library
- **Companion to:** [ComPlexionist](https://github.com/StephKoenig/ComPlexionist) (finds library gaps; Parrot prevents duplicate hunting)
- **Tech stack:** TypeScript, Manifest V3, Vite/WXT
- **Target browsers:** Chrome (primary), Firefox (secondary)

Key files:
- `docs/Parrot spec.md` — Full specification and architecture
- `wxt.config.ts` — WXT/Vite configuration (manifest is auto-generated)
- `src/entrypoints/background.ts` — Library cache, Plex API proxy
- `src/entrypoints/*.content.ts` — Content scripts per supported site
- `src/entrypoints/popup/` — Settings and status popup
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
├── entrypoints/
│   ├── background.ts              # Library index cache, Plex API proxy
│   ├── tmdb.content.ts            # TMDB page content script
│   ├── imdb.content.ts            # IMDb page content script
│   ├── tvdb.content.ts            # TVDB page content script
│   └── popup/
│       ├── index.html             # Settings/status UI
│       ├── main.ts                # Popup logic
│       └── style.css              # Popup styles
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
- `movies.byTmdbId`, `movies.byImdbId`, `movies.byTitle`
- `shows.byTvdbId`, `shows.byTmdbId`, `shows.byImdbId`, `shows.byTitle`

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
4. Select `.output/chrome-mv3/` folder

### Versioning

Version format: `Major.A.B` (e.g. `1.3.12`)

| Segment | Meaning | How it changes |
|---------|---------|----------------|
| Major | Major version | Manual edit in `package.json` |
| A | Commit number | `npm run version:commit` (resets B to 0) |
| B | Build number | Auto-incremented on every `npm run build` via prebuild script |

- **Single source of truth:** `package.json` → `wxt.config.ts` reads from it
- **Scripts:** `scripts/bump-build.js` (B++), `scripts/bump-commit.js` (A++, B=0)
- All segments can be manually edited in `package.json` if needed

---

## Working style

### Keep diffs focused
- One logical change per commit
- Avoid unrelated reformatting

### Planning sessions → write a spec
Whenever we do a planning session (plan mode), always write the finalised specification into `docs/` as a named document. This ensures we have a durable reference if context is lost or the session is interrupted.

### Update docs before committing
Before committing, check if `docs/Parrot spec.md` and `CLAUDE.md` need updating to reflect the changes (new sites, new features, architectural changes, etc.).

### Compile/test locally after changes
1. Make a small, targeted change
2. Run tests/linting after each change
3. Only then commit/push

### Documentation or commentary
Never use real movie or tv show names. Always make up example ones.
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
| NZBGeek | `nzbgeek.info/geekseek.php?movieid={id}` | TMDB/IMDb (from page links) |
| NZBGeek | `nzbgeek.info/geekseek.php?tvid={id}` | TVDB (from page links) |
| RARGB | `rargb.to/torrent/*` | TMDB/IMDb/TVDB (from page links) |
| NZBForYou | `nzbforyou.com/viewtopic.php` | IMDb (from page links), breadcrumb for media type |
| PSA | `psa.wf/movie/{slug}` | Title-based matching from URL slug |
| PSA | `psa.wf/tv-show/{slug}` | Title-based matching from URL slug |
