# Parrot

A browser extension that tells you whether media you're browsing is already in your Plex library.

When you visit a movie or TV show page on a supported site, Parrot shows a badge indicating whether you own it. Owned items link directly to the content in Plex Web.

**Companion to [ComPlexionist](https://github.com/StephKoenig/ComPlexionist)** -- ComPlexionist finds gaps in your library; Parrot prevents you from hunting for something you already have.

## How It Works

1. Browse to a supported movie or TV show page
2. Parrot extracts the media ID from the page URL or DOM
3. The ID is checked against a cached index of your Plex library
4. A badge appears next to the title showing ownership status
5. Owned badges link directly to the item in Plex Web

## Supported Sites

| Site | What Parrot Reads |
|------|-------------------|
| **TMDB** | TMDB ID from URL |
| **IMDb** | IMDb ID from URL |
| **TVDB** | TVDB ID from page links |
| **NZBGeek** | TMDB/IMDb/TVDB from page links |
| **RARGB** | TMDB/IMDb/TVDB from page links |
| **NZBForYou** | IMDb from page links |
| **PSA** | Title matching from URL slug |

## Badge States

- **Owned** -- Dark pill with gold Plex chevron icon (links to item in Plex)
- **Not owned** -- Dark pill with gray Plex chevron icon
- **Error** -- Red pill

The toolbar icon also changes per-tab: gold border when owned, gray when not, light gray when inactive.

## Setup

### Prerequisites

- A Plex server with media libraries
- Your Plex authentication token ([how to find it](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/))

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

The extension will index your library and start showing badges on supported sites.

## Development

```bash
npm run dev       # Dev mode with hot reload
npm run build     # Production build
npm test          # Run tests
npm run lint      # Lint
```

### Versioning

Version format: `Major.A.B` (e.g. `1.3.12`)

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
