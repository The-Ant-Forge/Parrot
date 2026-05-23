# Troubleshooting

Most issues with Parrot come from one of five places: a content script not finding a media ID, a Plex server unreachable, a community proxy lacking data, the library index being stale, or a misconfigured option threshold. This page walks through the diagnosis flow.

## The single best diagnostic: the service worker console

Almost every bug report can be solved in 30 seconds with the service worker log:

1. Open `chrome://extensions/`
2. Find the Parrot card and click **Service Worker** under "Inspect views"
3. With the DevTools console open, reload the page where Parrot is misbehaving
4. Read the log — every content script and the background reports what it's doing

For deeper output, turn on **Debug logging** in the Gap Detection options card. This widens the verbosity of `debugLog` calls.

## Common scenarios

### Badge doesn't appear at all

**Likely cause:** Content script didn't run, or the badge anchor element wasn't found.

Check:
- Is the site in the Supported Sites list and **enabled**?
- Open the service worker console — do you see any `Parrot {SITE}: ...` lines for this page?
- If no log lines appear, the URL might not match the content script's patterns
- If lines appear but no badge: the content script's `injectBadge` target (e.g. `<h1>`) may not exist on the page. Site DOMs change over time

### Badge says "not in library" but the movie/show IS in your library

**Likely cause:** Index out of date, or the title couldn't be matched.

Check:
- Open options → Plex Servers and click **Refresh Library** to rebuild the index
- For title-matching sites (PSA, JustWatch, BBC iPlayer, Rotten Tomatoes), look at the log for the title key being looked up. If Plex stores the title with a year suffix (e.g. "Matlock (2024)") and the URL slug is just "matlock", the title key won't match
- Make sure your Plex library has external IDs populated. Plex must be set up to match items via TMDB/TVDB/IMDb agents — without external IDs, only title matching works

### Badge is gold but no Complete/Incomplete toggle

**Likely cause:** Collection or episode data couldn't be fetched.

For movies:
- Check the service worker log for `COLLECTION:` lines
- "no collection" — the movie genuinely isn't in a collection per Radarr/TMDB
- "Radarr returned collection X with no Movies" — Radarr's data is incomplete; configure a TMDB key for fallback
- No COLLECTION line at all — the gap-checker didn't fire; check that `useCommunityProxies` is on or a TMDB key is set

For TV shows:
- Check for `EPISODES:` lines. "no index" means library isn't loaded; "Episode data unavailable" panel shown when Sonarr proxy + TMDB/TVDB keys can all fail
- The panel only appears for shows you own — the show needs to be in your Plex library first

### Badge fails with "TypeError: Failed to fetch"

**Likely cause:** A network call timed out (typically `BUILD_INDEX` or `CHECK_EPISODES` against your Plex server).

Check:
- If you're away from home, ensure the Remote URL is configured. See [Remote Access](Remote-Access)
- If you're at home, ensure your Plex server is actually reachable at the configured URL (try opening it directly in another tab)
- For very large libraries (10k+ items), the 30-second per-attempt timeout may not be enough on slow hardware — open an issue

### Ratings missing despite Radarr having them

**Likely cause:** Stale Radarr cache or an unexpected response shape.

Check:
- In the SW console run: `(await chrome.storage.local.get("pc:radarr:movie:TMDBID"))` to inspect the cached response
- If `MovieRatings` is all null, Radarr genuinely lacks ratings for that movie (try `pc:radarr:imdb:TTID` instead — sometimes Radarr's TMDB and IMDb entries diverge)
- Clear a specific cache entry: `chrome.storage.local.remove("pc:radarr:movie:TMDBID")` then reload the page

### Collection panel doesn't appear

**Likely cause:** You haven't met the **Minimum in library to show gaps** threshold (default 2).

Check:
- Options → Gap Detection → **Minimum in library to show gaps** — lower to `1` if you want collections to surface with a single owned member
- The collection itself might be smaller than **Minimum collection size** (default 2)

### Update badge "!" won't go away

**Likely cause:** Cached check is stale, or the install didn't actually replace the files.

Check:
- Options → About → installed version should match the latest release
- If installed < latest, replace the unpacked folder with the new ZIP contents and click **Reload** on the Parrot card at `chrome://extensions/`
- If installed >= latest, click **Check for updates** to force a re-check

### Service worker keeps unloading

**Normal!** Chrome aggressively suspends MV3 service workers when idle. Parrot is designed to handle this — caches reload on demand and the library index persists in `browser.storage.local`. If you see "stopped" or "inactive" next to the Service Worker link in `chrome://extensions/`, that's expected. Click any Parrot interface (popup, options page, or trigger a CHECK by visiting a media page) and it wakes back up.

## When to file an issue

Open a [GitHub issue](https://github.com/The-Ant-Forge/Parrot/issues) with:

1. **Parrot version** — see options → About
2. **Browser + OS** — Chrome 124 on macOS, Edge on Windows, etc.
3. **The site / URL** where Parrot misbehaved
4. **Service worker console output** — most important. Copy the full log starting from the page reload
5. **Any options that aren't defaults** — community proxies on/off, key configurations (don't paste the actual keys), threshold values

Screenshots help too, especially for badge state issues.
