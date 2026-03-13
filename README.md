# Parrot

A browser extension that tells you whether media you're browsing is already in your Plex library.

When you visit a movie or TV show page on a supported site, Parrot shows a badge indicating whether its in your library. Library items link directly to the content in Plex Web.

**Companion to [ComPlexionist](https://github.com/The-Ant-Forge/ComPlexionist)** -- ComPlexionist finds gaps in your library; Parrot prevents you from hunting for something you already have.

## Features

- **Library status badge** on 16 supported sites -- dark pill with gold/gray Plex chevron
- **Resolution display** -- see media quality (SD, 720p, 1080p, 4K) on badges and popup dashboard
- **Zero-config community proxies** -- free Radarr and Sonarr proxies provide movie and TV metadata out of the box; no API keys needed for basic functionality, just configure your Plex server
- **Media ratings** -- up to 6 sources for movies (TMDB, IMDb, Rotten Tomatoes, Metacritic, Trakt) and TVDB rating for TV shows
- **Deep linking** -- badges link directly to the item in Plex Web
- **Collection gap detection** -- see which movies from the same collection are in your library and which are missing
- **Episode gap detection** -- on TMDB and TVDB TV show pages, see a season-by-season breakdown of missing episodes
- **Multi-server support** -- configure multiple Plex servers with priority ordering
- **Dynamic toolbar icon** -- changes per-tab to reflect library status
- **Options page** -- configure Plex servers, API keys, gap detection preferences, and cache management

## How It Works

1. Browse to a supported movie or TV show page
2. Parrot extracts the media ID from the page URL or DOM
3. The ID is checked against a cached index of your Plex library
4. A badge appears next to the title showing whether it's in your library
5. For movies in TMDB collections, a gap panel shows which movies you have and which are missing
6. For TV shows in your library, an episode gap panel shows missing episodes by season

## Supported Sites

| Site | What Parrot Reads |
|------|-------------------|
| **BBC iPlayer** | Title matching from URL slug + DOM title |
| **IMDb** | IMDb ID from URL |
| **JustWatch** | Title matching from h1 text |
| **Letterboxd** | TMDB/IMDb from page links |
| **Metacritic** | IMDb from JSON-LD sameAs, title matching fallback |
| **NZBForYou** | IMDb from page links, link scan fallback (TMDB/TVDB/TVMaze) |
| **NZBGeek** | TMDB/IMDb/TVDB from page links |
| **Plex** | PlexKey from URL (server items), link scan/title fallback (discover) |
| **PSA** | Title matching from URL slug |
| **RARGB** | TMDB/IMDb/TVDB from page links |
| **Rotten Tomatoes** | Title matching from URL slug |
| **TMDB** | TMDB ID from URL (movies + TV) |
| **Trakt** | TMDB/IMDb/TVDB from page links |
| **Trakt App** | TMDB/IMDb/TVDB from page links |
| **TVDB** | TVDB ID from page links (series + movies) |
| **TVMaze** | TVDB/IMDb via TVMaze API (shows only) |

## Badge States

- **Not in library** -- Dark pill with gray Plex chevron: `[Plex]`
- **In library** -- Dark pill with gold Plex chevron, click opens Plex: `[Plex]`
- **In library + complete** -- Split-click pill: "Plex" opens Plex, "Complete" toggles gap panel: `[Plex · Complete]`
- **In library + incomplete** -- Split-click pill: "Plex" opens Plex, "Incomplete" toggles gap panel: `[Plex · Incomplete]`
- **Error** -- Red pill with tooltip

Fields are separated by `·` and may include ratings and resolution: `[Plex · 7.2 · 1080p · Complete]`.

Gap panels float as overlays anchored to the badge (no page layout shift).

The toolbar icon also changes per-tab: gold border when in library, gray when not, light gray when inactive.

## Ratings

Parrot can display media ratings from multiple sources on both the in-page badge and the popup dashboard.

- **Movies** -- up to 5 rating sources: TMDB, IMDb, Rotten Tomatoes, Metacritic, and Trakt. The Radarr community proxy provides most of these automatically; no API keys needed.
- **TV shows** -- TVDB rating via the Sonarr community proxy, plus TMDB rating if a TMDB key is configured.
- **Fallback** -- if community proxies are unavailable, Parrot falls back to user-configured API keys (TMDB, OMDb).

When multiple sources are available, the badge and popup status line show the averaged score. The popup ID pills show each source's individual score (e.g. `7.2 TMDB 550`, `8.8 IMDb tt0137523`). Ratings are fetched for all items, whether in your library or not.

## Gap Detection

### Collection Gaps (TMDB Movies)

When viewing a movie that belongs to a collection on any supported site, Parrot shows a collapsible panel listing which movies in the collection are in your library and which are missing. This works even for movies not yet in your library -- if the collection is partially complete, the badge upgrades to "Plex : Incomplete" with the full collection panel. Movies in your library link to Plex.

### Episode Gaps (TV Shows)

When viewing a TV show that's in your library on TMDB or TVDB, Parrot shows a collapsible season-by-season panel indicating how many episodes you have per season and which are missing.

- Works out of the box via the Sonarr community proxy -- no API keys required
- Falls back to TMDB API or TVDB v4 API (when configured) if the proxy is unavailable

## Setup

### Prerequisites

- A Plex server with media libraries
- Your Plex authentication token ([how to find it](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/))
- (Optional) A TMDB API key -- the community proxy handles movie metadata and most ratings; a TMDB key adds TV show ratings and serves as a fallback ([get one free](https://www.themoviedb.org/settings/api))
- (Optional) A TVDB API key -- the Sonarr proxy provides episode data; a TVDB key serves as a fallback for episode numbering ([get one](https://thetvdb.com/api-information))
- (Optional) An OMDb API key -- the Radarr proxy provides IMDb ratings for movies; an OMDb key serves as a fallback ([get one free](https://www.omdbapi.com/apikey.aspx))

### Install from Source

```bash
npm install
npm run build
```

Then load in Chrome:
1. Go to `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3/` folder

### Configure

1. Click the Parrot extension icon in the toolbar
2. Enter your Plex server URL (e.g. `http://192.168.1.100:32400`)
3. Enter your Plex token
4. Click **Save & Sync**
5. Open **Settings** to configure API keys and gap detection options

The extension will index your library and start showing badges on supported sites.

## Development

```bash
npm run dev       # Dev mode with hot reload
npm run build     # Production build
npm test          # Run tests
npm run lint      # Lint
```

### Versioning

Version format: `Major.A.B` (e.g. `1.12.15`)

- **Major** -- manual edit in `package.json`
- **A** (commit) -- `npm run version:commit` (resets B to 0)
- **B** (build) -- auto-incremented on every `npm run build`

## Tech Stack

- TypeScript
- [WXT](https://wxt.dev/) (Vite-based browser extension framework)
- Manifest V3
- Vitest

## License

MIT
