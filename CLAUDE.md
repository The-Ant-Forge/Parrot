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
│   ├── *.content.ts               # 12 content scripts (one per supported site)
│   ├── options/                   # Full-tab options page
│   └── popup/                     # Settings/status popup
├── api/
│   ├── plex.ts                    # Plex API client
│   ├── tmdb.ts                    # TMDB v3 API client
│   └── tvdb.ts                    # TVDB v4 API client (optional)
└── common/
    ├── types.ts                   # Shared types
    ├── storage.ts                 # Storage helpers
    ├── badge.ts                   # Smart badge (wrapper+pill, floating panel)
    ├── gap-checker.ts             # Shared gap detection orchestration
    ├── collection-panel.ts        # Collection gap panel component
    ├── episode-panel.ts           # Episode gap panel component
    ├── panel-utils.ts             # Shared panel styling utilities
    ├── extractors.ts              # URL/ID extractors + DOM link scanner
    ├── url-observer.ts            # Debounced URL change observer for SPAs
    ├── normalize.ts               # Title normalization
    └── sites.ts                   # Supported site definitions
```

### Data Flow

1. Content script extracts media ID from URL/DOM (via `extractors.ts`)
2. Sends message to service worker: `{ type: "CHECK", mediaType: "movie", source: "tmdb", id: "550" }`
3. Service worker checks cached library index
4. Returns ownership status + plexUrl
5. Content script injects smart badge (wrapper+pill architecture)
6. For owned items, `gap-checker.ts` triggers collection or episode gap detection
7. Gap data delivered to badge via `setBadgeGapData()` as floating panel

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

Version format: `Major.A.B` (e.g. `1.12.15`)

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
Before committing, check if `docs/Parrot spec.md`, `README.md` and `CLAUDE.md` need updating to reflect the changes (new sites, new features, architectural changes, etc.) and check whether a `docs/TODO.md` can be checked. If an entire TODO section is completed then move the section to Completed.md in the same folder.

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
| Letterboxd | `letterboxd.com/film/{slug}` | TMDB/IMDb (from page links) |
| Trakt | `trakt.tv/movies/{slug}` | TMDB/IMDb/TVDB (from page links) |
| Trakt | `trakt.tv/shows/{slug}` | TMDB/IMDb/TVDB (from page links) |
| Trakt App | `app.trakt.tv/movies/{slug}` | TMDB/IMDb/TVDB (from page links, SvelteKit SPA) |
| Trakt App | `app.trakt.tv/shows/{slug}` | TMDB/IMDb/TVDB (from page links, SvelteKit SPA) |
| Rotten Tomatoes | `rottentomatoes.com/m/{slug}` | Title-based from URL slug (JSON-LD/link scan fallback) |
| Rotten Tomatoes | `rottentomatoes.com/tv/{slug}` | Title-based from URL slug (JSON-LD/link scan fallback) |
| JustWatch | `justwatch.com/*/movie/{slug}` | Title-based from h1 (link scan fallback) |
| JustWatch | `justwatch.com/*/tv-series/{slug}` | Title-based from h1 (link scan fallback) |
| TVDB Movies | `thetvdb.com/movies/{slug}` | TMDB/IMDb (from page links) |
