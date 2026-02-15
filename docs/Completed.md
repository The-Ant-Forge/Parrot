# Parrot — Completed Work

Everything that's been built and shipped, in chronological order.

---

## Foundation (from ComPlexionist Phase 9b)

The initial extension skeleton, ported from the ComPlexionist desktop app.

### Extension Setup
- Manifest V3 (auto-generated via WXT)
- TypeScript + WXT/Vite build config
- Extension popup HTML/CSS
- Auto-versioning (`Major.A.B` with bump scripts)
- ESLint + Prettier configured
- Chrome + Firefox targets

### Core Logic
- Plex API client — connect, authenticate, fetch libraries, extract GUIDs (`src/api/plex.ts`)
- Library index builder — fetches all items from Plex, builds lookup maps by TMDB/TVDB/IMDb/title
- In-memory + `storage.local` cache with 24h auto-refresh

### Content Scripts (7 sites)
- **TMDB** (`movie` + `tv`, SPA-aware with MutationObserver)
- **IMDb** (SPA-aware, checks both movie + show indexes)
- **TVDB** (slug-based, scans page links for numeric ID)
- **NZBGeek** (scans `<a>` elements for TMDB/IMDb/TVDB IDs)
- **RARGB** (scans `<a>` elements)
- **NZBForYou** (scans `<a>` elements for IMDb IDs)
- **PSA** (title-based matching via URL slug normalization)

### Badge & Deep Linking
- Ownership badge injected next to title (dark pill, gold/gray Plex chevron)
- Clickable deep link to Plex Web when owned
- Dynamic toolbar icon (OffscreenCanvas, 3 states: default/owned/not-owned)

### Popup
- Configuration UI (Plex URL, token)
- Connection test with feedback
- Cache status display (item count, last refresh)
- Manual refresh button
- Settings link to options page

### Storage
- `browser.storage.sync` — Plex URL, token, machineIdentifier
- `browser.storage.local` — library index cache

---

## Phase 5: Options Page

> Spec: [`Phase 5 - Options Page.md`](Phase%205%20-%20Options%20Page.md)

Full-tab WXT options page for API credentials, gap detection preferences, and cache management.

- `ParrotOptions` type with defaults in `types.ts`
- Storage helpers (`getOptions`, `saveOptions`) in `storage.ts`
- Background handlers: `GET_OPTIONS`, `SAVE_OPTIONS`, `VALIDATE_TMDB_KEY`, `CLEAR_CACHE`
- TMDB `host_permissions` in `wxt.config.ts`
- Options page UI (`src/entrypoints/options/`) — four card sections:
  1. Plex Server (URL, token, test, save & sync, status)
  2. API Keys (TMDB key input + validation)
  3. Gap Detection (exclude future, exclude specials, min collection size, min owned)
  4. Cache Management (refresh, clear)
- Settings link in popup

---

## Phase 6: TMDB Collection Gap Detection

> Spec: [`Phase 6 - TMDB Collection Gaps.md`](Phase%206%20-%20TMDB%20Collection%20Gaps.md)

Collapsible panel on TMDB movie pages showing owned/missing movies from the same collection.

- TMDB API client (`src/api/tmdb.ts`) — `getMovie`, `getCollection`, `tmdbFetch` helper
- Collection types + `CHECK_COLLECTION` message in `types.ts`
- Collection cache in `storage.local` (30-day TTL)
- `CHECK_COLLECTION` handler in background — fetches movie details, checks collection, compares against library index
- Collection panel component (`src/common/collection-panel.ts`) — dark theme, gold accents, owned/missing lists with Plex deep links
- TMDB content script integration — triggers collection check after ownership badge for movies

---

## Phase 7: TV Episode Gap Detection

> Spec: [`Phase 7 - TV Episode Gaps.md`](Phase%207%20-%20TV%20Episode%20Gaps.md)

Season-level episode gap panel on TMDB and TVDB TV show pages.

- Episode gap types (`SeasonGapInfo`, `EpisodeGapResponse`, `EpisodeGapCacheEntry`) in `types.ts`
- Episode gap cache helpers in `storage.ts` (24h TTL, keyed by `source:id`)
- TMDB TV API functions (`getTvShow`, `getTvSeason`, `findByTvdbId`) in `tmdb.ts`
- Plex episode fetching (`fetchShowEpisodes` via `/allLeaves`) in `plex.ts`
- `CHECK_EPISODES` handler in background — source-based routing, per-season comparison, respects `excludeSpecials` and `excludeFuture`
- Episode gap panel component (`src/common/episode-panel.ts`) — collapsible, shows "X of Y episodes — N of M seasons full", gold checkmarks for complete seasons
- TVDB content script integration — triggers episode check after owned badge
- TMDB content script integration — triggers episode check for TV shows, collection check for movies

### TVDB v4 API Support

Optional TVDB API key for more accurate TV episode numbering on TVDB pages.

- TVDB v4 API client (`src/api/tvdb.ts`) — bearer token auth with in-memory caching, auto-retry on 401, paginated episode fetching (500/page)
- `tvdbApiKey` added to `ParrotOptions` (default: empty, TMDB used as fallback)
- `VALIDATE_TVDB_KEY` handler in background
- Source-based routing in `CHECK_EPISODES`: TVDB pages use TVDB API when key is configured, TMDB pages always use TMDB API
- TVDB `host_permissions` (`https://api4.thetvdb.com/*`) in `wxt.config.ts`
- Options page: TVDB API key input with validation button (marked optional)
