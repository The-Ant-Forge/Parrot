# Configuration

Open the options page via the gear icon in the popup, or via `chrome://extensions/` → Parrot → **Details** → **Extension options**. There are four cards: Plex Servers, API Keys, Gap Detection, and Supported Sites.

## Plex Servers

<img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/options-plex-servers.png" alt="Plex Servers card" width="540" />

### Adding a server

1. Enter the **Server URL** (e.g. `http://192.168.1.100:32400`)
2. Enter the **Plex Token**
3. (Optional) Enter or **Auto-detect** a **Remote URL** — see [Remote Access](Remote-Access)
4. Click **Save Server**

Parrot tests the connection and pulls the server's identifier and friendly name automatically. If the test succeeds, the server is added to the list and Parrot rebuilds the library index.

### Multiple servers

You can add as many servers as you want — Parrot will merge items by external IDs (TMDB/IMDb/TVDB) so a movie that exists on two servers is only counted once. The order in the list is the **priority order**: when an item exists on multiple servers, the deep link goes to the first one in the list. Reorder by deleting and re-adding (proper drag-and-drop is on the roadmap).

### Library info

The status block shows the current item count, when the index was last synced, and storage usage. The buttons let you:

- **Test All** — quick connectivity check across every server
- **Refresh Library** — force a rebuild of the index
- **Clear Library** — wipe the cached index entirely

### Auto-refresh

By default the index rebuilds itself every 7 days in the background. You can change the interval or disable auto-refresh entirely.

## API Keys

<img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/options-api-keys.png" alt="API Keys card" width="540" />

Most things work without any user keys thanks to the **Radarr** and **Sonarr** community proxies. The proxies provide:

- **Radarr** (`api.radarr.video`) — movie metadata + 5 rating sources (TMDB, IMDb, RT, Metacritic, Trakt), collection data
- **Sonarr** (`skyhook.sonarr.tv`) — TV show metadata + full episode lists with air dates, TVDB rating

The proxies have circuit breakers — 3 consecutive failures triggers a 5-minute cooldown during which Parrot falls back to user keys.

### Optional keys

| Key | What it adds | When to bother |
|-----|--------------|----------------|
| **TMDB** | Movie + TV metadata fallback, TV show ratings, collection fallback when Radarr lacks it | Recommended — fills in cases where the proxy has gaps (we've seen this on stub TMDB entries) |
| **TVDB** | More accurate TV episode numbering for shows where TVDB and TMDB disagree | Only if Sonarr proxy data looks off for a specific show |
| **OMDb** | IMDb ratings for movies where Radarr lacks them | If you want IMDb scores on niche / very new movies |

Each key has a **Validate** button next to it that does a tiny test request to confirm the key works before you save.

## Gap Detection

<img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/episode-gap-panel.png" alt="Gap Detection card" width="540" />

These options control when collection and episode gap panels appear:

| Option | Default | What it does |
|--------|---------|--------------|
| **Exclude future/unreleased movies** | On | Filters out movies whose release date is in the future before counting collection members |
| **Exclude specials (Season 0)** | On | Hides Season 0 (specials) from episode gap calculations |
| **Minimum collection size** | 2 | Collections with fewer than this many movies don't show a panel |
| **Minimum in library to show gaps** | 2 | If you own fewer than this many movies from a collection, no panel shows — keeps trivial single-movie matches from spamming the UI |
| **Show complete collections/series** | Off | When on, the panel expands by default even when there's nothing missing |
| **Debug logging** | Off | Turns on `debugLog` output in the service worker console — useful for diagnosing badge issues |

## Supported Sites

<img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/options-sites.png" alt="Supported Sites card" width="540" />

The built-in sites are enabled by default. You can:

- **Toggle individual sites** off if you don't want Parrot to inject on them
- **Add a custom site** with a URL pattern and CSS selector for the badge anchor
- **Reset Defaults** to revert any changes

See [Supported Sites](Supported-Sites) for details on what each one reads.

## About

The About card at the bottom shows the installed version, latest available release, and a button to **Check for updates** on demand. See [Updating](Updating) for the full flow.

<img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/options-about-update.png" alt="About card" width="540" />
