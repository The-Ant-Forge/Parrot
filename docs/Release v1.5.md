# Parrot v1.5 -- Initial Release

**Release date:** 2026-02-16
**Version:** 1.5.1

---

## What is Parrot?

Parrot is a browser extension that tells you whether media you're browsing is already in your Plex library. Visit a movie or TV show page on any supported site and Parrot shows an ownership badge right next to the title. Owned items link directly to the content in Plex Web.

Parrot is the companion to [ComPlexionist](https://github.com/StephKoenig/ComPlexionist) -- ComPlexionist finds gaps in your library; Parrot prevents you from hunting for something you already have.

---

## Highlights

### Ownership Badge on 13 Sites

A compact dark pill appears next to the title on every supported page. Gold Plex chevron = you own it (click to open in Plex). Gray chevron = not in your library. The toolbar icon also changes per-tab.

### Collection Gap Detection

If a movie belongs to a collection, Parrot shows a floating panel listing which movies in the collection you own and which are missing. Owned movies link directly to Plex. Works on all supported sites, not just TMDB.

### Episode Gap Detection

For owned TV shows on TMDB and TVDB, a floating panel shows a season-by-season breakdown of missing episodes. Contiguous complete or missing seasons are grouped into ranges for readability.

### Multi-Server Plex Support

Connect as many Plex servers as you want. Servers are priority-ordered -- the first server in the list is used for deep links when an item exists on multiple servers. Episodes are aggregated across all servers for the most accurate gap detection.

### Compact Library Index

The library index stores items once in a flat array with numeric lookup maps, reducing storage by roughly 60% compared to duplicating full objects across maps. Combined with the `unlimitedStorage` permission, large libraries are handled comfortably.

---

## Supported Sites

| Site | URL Patterns | Matching Strategy |
|------|-------------|-------------------|
| **TMDB** | `/movie/{id}`, `/tv/{id}` | TMDB numeric ID from URL |
| **IMDb** | `/title/{ttID}` | IMDb ID from URL |
| **TVDB** | `/series/{slug}`, `/movies/{slug}` | TVDB numeric ID from page links |
| **Letterboxd** | `/film/{slug}` | TMDB/IMDb from page links |
| **Trakt** | `/movies/{slug}`, `/shows/{slug}` | TMDB/IMDb/TVDB from page links |
| **Trakt App** | `/movies/{slug}`, `/shows/{slug}` | TMDB/IMDb/TVDB from page links (SvelteKit SPA) |
| **Rotten Tomatoes** | `/m/{slug}`, `/tv/{slug}` | Title matching from URL slug |
| **JustWatch** | `/*/movie/{slug}`, `/*/tv-series/{slug}` | Title matching from h1 text |
| **Metacritic** | `/movie/*`, `/tv/*` | IMDb from JSON-LD, title matching fallback |
| **NZBGeek** | `/geekseek.php?movieid=`, `/geekseek.php?tvid=` | TMDB/IMDb/TVDB from page links |
| **RARGB** | `/torrent/*` | TMDB/IMDb/TVDB from page links |
| **NZBForYou** | `/viewtopic.php` | IMDb from page links |
| **PSA** | `/movie/{slug}`, `/tv-show/{slug}` | Title matching from URL slug |

Custom sites can be added through the options page.

---

## Badge States

| State | Appearance | Behaviour |
|-------|-----------|-----------|
| **Not owned** | Dark pill, gray chevron | No click action |
| **Owned** | Dark pill, gold chevron | Click opens item in Plex Web |
| **Owned + Complete** | Split pill: `Plex : Complete` | "Plex" opens Plex, "Complete" toggles gap panel |
| **Owned + Incomplete** | Split pill: `Plex : Incomplete` | "Plex" opens Plex, "Incomplete" toggles gap panel |
| **Error** | Red pill with tooltip | Hover for error details |

Gap panels float as overlays anchored to the badge -- zero layout shift on the host page.

---

## Gap Detection

### Collection Gaps (Movies)

When viewing a movie that belongs to a TMDB collection, Parrot fetches the full collection and compares against your library. The floating panel shows:

- Owned movies (with Plex deep links)
- Missing movies
- Completion ratio (e.g. "3 of 5 owned")

### Episode Gaps (TV Shows)

For owned TV shows, Parrot fetches the full episode list from TMDB (or TVDB when configured) and compares against episodes on your Plex server(s). The panel shows:

- Per-season episode counts
- Contiguous complete/missing seasons grouped into ranges
- Overall completion (e.g. "42 of 50 episodes -- 3 of 5 seasons full")

Respects user options: exclude specials (Season 0), exclude future/unreleased episodes.

### Multi-Server Episode Aggregation

If a show exists on multiple Plex servers, Parrot fetches episodes from all of them and merges ownership before comparing. If Server A has seasons 1-3 and Server B has seasons 4-5, the show appears fully owned.

---

## Multi-Server Support

### Server Management

The options page provides a unified Plex Servers section:

- **Add servers** with URL and token -- Parrot validates the connection and extracts the server name automatically
- **Edit or delete** existing servers inline
- **Priority ordering** -- first server in the list is primary for deep links
- **Status dots** -- green (connected) or red (failed), tested on page load
- **Per-server stats** -- library count and item count displayed per server row (cached, no overhead on page load)

### Index Building

When the library is refreshed, Parrot iterates all servers in priority order and merges items by shared external IDs (TMDB, IMDb, TVDB). An item existing on two servers appears once in the index with both servers' keys recorded.

### Migration

Upgrading from a single-server configuration is automatic. The old `plexConfig` is migrated to a `plexServers` array on first load. The library index is rebuilt to match the new compact format.

---

## Options Page

Four configuration sections on a full-tab settings page:

### Plex Servers
- Server list with status, stats, edit, and delete
- Add/edit server form (URL + token, inline)
- Library info: item count, last synced, storage usage
- Test All, Refresh Library, Clear Library buttons
- Auto-refresh toggle with configurable interval (default: 7 days)

### API Keys
- **TMDB API Key** (required for gap detection) -- with validation button
- **TVDB API Key** (optional, for more accurate TV episode numbering) -- with validation button

### Gap Detection
- Exclude future/unreleased movies
- Exclude specials (Season 0)
- Minimum collection size (default: 2)
- Minimum owned to show gaps (default: 1)
- Show complete collections/series toggle

### Supported Sites
- Table of all built-in and custom sites
- Add custom sites with name, media type, URL pattern, and badge selector
- Reset to defaults

---

## Popup Dashboard

Click the toolbar icon to see:

- **Connection status** -- per-service pills (Plex, TMDB, TVDB) with status dots
- **Library summary** -- total movies and shows indexed
- **Current tab media card** -- if the current tab is on a supported site:
  - TMDB poster thumbnail
  - Title and year
  - Season/episode counts for TV shows
  - Source ID tags (clickable links to TMDB, IMDb, TVDB)
  - Collection summary for movies (e.g. "Saga Name -- 3 of 5 owned")
  - Direct Plex link

---

## Technical Details

### Architecture

- **Manifest V3** with WXT (Vite-based build framework)
- **TypeScript** throughout
- **Service worker** -- library index cache, Plex API proxy, message handling
- **Content scripts** -- one per site (13 total), plus shared modules for badge, gap detection, extractors
- **Storage** -- `browser.storage.sync` for config, `browser.storage.local` for library index, `browser.storage.session` for tab media cache

### Library Index Structure

Items stored once in a flat array. Six lookup maps (3 for movies, 4 for shows) hold numeric indices into the array:

- Movies: `byTmdbId`, `byImdbId`, `byTitle`
- Shows: `byTvdbId`, `byTmdbId`, `byImdbId`, `byTitle`

Title-based matching uses normalized keys (lowercase, stripped articles/punctuation) for fuzzy-resilient lookups.

### Auto-Refresh

When enabled, the library index is automatically refreshed in the background when it exceeds the configured age threshold. The stale index is returned immediately so badge results are instant -- the rebuild happens in the background.

### Permissions

| Permission | Purpose |
|-----------|---------|
| `storage` | Config and library index |
| `unlimitedStorage` | Large libraries (>10MB index) |
| `host_permissions` | Plex server, TMDB API, TVDB API |

No data is collected or transmitted to third parties. Parrot communicates only with the user's own Plex server and the TMDB/TVDB APIs for metadata.

### Test Suite

116 tests across 7 test files covering:

- URL/ID extraction and normalization
- Badge rendering and interaction
- Library index building and multi-server merge
- Link scanning
- Episode panel season grouping
- Plex GUID parsing

---

## Prerequisites

- A Plex server with media libraries
- A Plex authentication token ([how to find it](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/))
- A TMDB API key for gap detection ([get one free](https://www.themoviedb.org/settings/api))
- (Optional) A TVDB API key for accurate TVDB episode numbering ([get one](https://thetvdb.com/api-information))

---

## Installation

### From Source

```bash
git clone https://github.com/StephKoenig/Parrot.git
cd Parrot
npm install
npm run build
```

Then load in Chrome:

1. Go to `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3/` folder

### First-Time Setup

1. Click the Parrot icon in the toolbar
2. Enter your Plex server URL (e.g. `http://192.168.1.100:32400`)
3. Enter your Plex token
4. Click **Save & Sync**
5. Open **Settings** to add your TMDB API key and configure options
6. Additional servers can be added from the options page

---

## Known Limitations

- Chrome only (Firefox support planned but untested)
- No Chrome Web Store listing yet -- install from source
- Custom sites require manual URL pattern and selector configuration
- Title-based matching (Rotten Tomatoes, JustWatch, PSA) depends on slug/heading accuracy and may miss titles with unusual formatting
- Auto-refresh runs on next page visit after the threshold, not on a timer

---

## What's Next

See [TODO.md](TODO.md) for the forward-looking roadmap, including:

- Universal content script with dynamic registration for custom sites
- Chrome Web Store and Firefox AMO publishing
- CI/CD with GitHub Actions
- Additional site support
- Advanced settings (badge position, per-site toggles, theme override)
