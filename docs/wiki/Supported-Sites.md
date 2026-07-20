# Supported Sites

Parrot ships with 17 built-in sites. Each one knows how to extract a media identifier (TMDB / IMDb / TVDB ID, title, or slug) from the page and request a library check.

<img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/options-sites.png" alt="Supported Sites table" width="540" />

## Built-in sites

| Site | Media Type | What Parrot reads |
|------|------------|-------------------|
| **BBC iPlayer** | Auto | Title matching from URL slug + DOM title |
| **IMDb** | Auto | IMDb ID directly from URL |
| **JustWatch** | Auto | Title matching from h1 text |
| **KickassTorrents** | Auto | IMDb link, unlinked IMDb URL in the description, or title from the release-name slug (`sNN` marker = TV) |
| **Letterboxd** | Movie | TMDB / IMDb from page links |
| **Metacritic** | Auto | IMDb from JSON-LD `sameAs`, title-matching fallback |
| **NZBForYou** | Auto | IMDb from page links, fallback to TMDB/TVDB/TVMaze link scan |
| **NZBGeek** | Auto | TMDB/IMDb/TVDB from page links |
| **Plex** (app.plex.tv) | Auto | PlexKey from URL (server items), link scan / title fallback (discover) |
| **PSA** | Auto | Title matching from URL slug |
| **RARGB** | Auto | TMDB/IMDb/TVDB from page links |
| **Rotten Tomatoes** | Auto | Title matching from URL slug |
| **TMDB** | Auto | TMDB ID directly from URL (movies + TV) |
| **Trakt** | Auto | TMDB/IMDb/TVDB from page links |
| **Trakt App** | Auto | TMDB/IMDb/TVDB from page links (SPA-aware) |
| **TVDB** | Auto | TVDB ID from page links (series + movies) |
| **TVMaze** | Show | TVDB / IMDb resolved via TVMaze's free API (TV-only) |

"Auto" means the content script figures out movie-vs-show from the URL pattern. "Movie" / "Show" means the site is single-type.

## ID resolution strategies

Different sites expose IDs in different ways. Parrot uses several extraction strategies, often layered:

### Direct URL match

Sites like TMDB and IMDb put the ID right in the URL (`themoviedb.org/movie/550`, `imdb.com/title/tt0137523`). The content script reads it and sends the CHECK message immediately.

### Link scan

Many sites embed external links to TMDB, IMDb, TVDB, or TVMaze somewhere on the page. Parrot scans all `<a href>` elements and picks the highest-authority match (IMDb > TVDB > TMDB > TVMaze). Some sites (RARGB) scope the scan to a specific container to avoid stray sidebar links.

### JSON-LD `sameAs`

Sites with structured data (Metacritic, Rotten Tomatoes) include their identifiers in `<script type="application/ld+json">` blocks. Parrot parses those first; the link scan is fallback.

### Title matching

Title-only sites (JustWatch, PSA, BBC iPlayer, sometimes Rotten Tomatoes) have no machine-readable identifier. Parrot extracts the visible title (and year if present in the h1), normalises it, and looks it up by `"normalized title|year"` key in the library index. If the year-qualified key misses, it widens to a yearless search.

### TVMaze cross-reference

TVMaze pages have a numeric show ID in the URL but no external IDs in the DOM. Parrot sends the TVMaze ID to the background, which queries `api.tvmaze.com` for the show's TVDB and IMDb IDs, then does a normal library lookup.

## Why some sites work better than others

Sites that expose stable external IDs (TMDB, IMDb, NZBGeek) work the most reliably — Parrot knows exactly which movie or show is on screen. Title-matching sites are more brittle:

- Title differs from what Plex has → no match (e.g. Plex stores "Matlock (2024)" but the URL slug is just "matlock")
- Two different shows share the same title → wrong match (Parrot uses year disambiguation when available)
- Page renders dynamically and the h1 isn't in the DOM yet → Parrot waits via MutationObserver, but very slow renders can miss

When in doubt, look in the service worker console (`chrome://extensions/` → Service Worker under Parrot, then reload the page) — every content script logs which strategy ran and what it found.

## Custom sites (planned — not yet active)

The Supported Sites card lets you define custom site entries (name, media type, URL pattern, badge selector) and they're saved to your synced settings — **but they don't take effect yet**. Making them live requires a universal content script with dynamic registration and per-site permission prompts, which is on the roadmap. Until that lands, only the built-in sites inject badges.

Per-site enable/disable is on the same roadmap; the built-in sites are currently always active on their URL patterns.

## Roadmap

Sites we'd like to support eventually:

- TV Time (`tvtime.com/show/*`)
- Simkl (`simkl.com/movies/*`, `simkl.com/tv/*`)

If you want a site added, [open an issue](https://github.com/The-Ant-Forge/Parrot/issues) with the URL pattern and a sample page.
