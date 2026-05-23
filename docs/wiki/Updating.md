# Updating

Parrot ships via GitHub Releases rather than the Chrome Web Store. Since Chrome blocks side-loaded extensions from auto-installing, the update flow is **alert → click → manual reload** rather than fully automatic. The mechanism makes it as painless as possible.

## How updates are detected

The service worker polls GitHub's releases API at most once every 24 hours. Result is cached locally. The auto-check fires:

- On every service worker startup (with the 24h throttle)
- On demand when you click **Check for updates** in options (force-refresh, bypasses the throttle)

## Update available indicator

When a newer release is detected, you'll see two cues:

### 1. Toolbar badge

A gold **"!"** appears in the bottom-right corner of the Parrot toolbar icon. This is global (appears regardless of which tab is active) and persists until the next time the extension actually updates.

### 2. About card on the options page

<img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/options-about-update.png" alt="About card with Update Parrot button" width="540" />

Open options and scroll to the bottom. You'll see:

- **Installed version** — what's currently running
- **Latest release** — what's on GitHub
- **Last checked** — when Parrot last looked
- **Check for updates** — force a re-check now
- **Update Parrot** — appears only when an update is available

### 3. Popup banner

The popup also shows a small banner: `v1.X.Y available — click to download`.

## How to update

When you click **Update Parrot** (in options) or the popup banner:

1. A new tab opens to the latest release's ZIP asset URL (`parrot-X.Y.Z-chrome.zip`)
2. Your browser downloads the ZIP
3. Unzip it, **replacing the contents** of your existing Parrot folder (the one you originally loaded as unpacked)
4. Go to `chrome://extensions/` and click the **Reload** icon on the Parrot card

That's it. The badge "!" will clear automatically after the new version starts up.

### Why manual reload?

Chrome (and Firefox) deliberately block side-loaded unpacked extensions from being installed or replaced via JavaScript — this is a malware countermeasure. The only way to auto-install would be to publish through the Chrome Web Store / Firefox AMO. Publishing is on the roadmap; until then, this manual step is the trade-off.

## Bypassing the throttle

If you've just made a release and want Parrot to pick it up immediately rather than waiting up to 24 hours, click **Check for updates** in the About card. That's the same code path with the 24h throttle bypassed.

## What gets carried over

Configuration that survives a reload:

- Plex servers + tokens
- API keys (TMDB, TVDB, OMDb)
- Gap detection options
- Auto-refresh settings
- Supported sites + custom site additions

Configuration is stored in `browser.storage.sync` (servers, options, custom sites) and `browser.storage.local` (library index, caches), neither of which is wiped when you reload an unpacked extension.

The episode-gap cache **is** cleared on update (in case the logic changed between versions), but the library index is preserved so you don't need to re-sync.
