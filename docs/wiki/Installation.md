# Installation

Parrot isn't (yet) on the Chrome Web Store, so you install it as an unpacked extension. This is a one-time setup — once it's loaded, it'll keep running and you can update it via the built-in **Update Parrot** button.

## Prerequisites

- A Plex Media Server running somewhere (home network is fine; remote access works too — see [Remote Access](Remote-Access))
- Your Plex authentication token — [how to find it](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)
- Google Chrome, Chromium, or any Chromium-derived browser (Edge, Brave, Vivaldi). Firefox support exists in the codebase but isn't actively distributed

## Option A — Install from a release (recommended)

1. Open the **[latest release on GitHub](https://github.com/The-Ant-Forge/Parrot/releases/latest)**
2. Download `parrot-X.Y.Z-chrome.zip` from the Assets section
3. Unzip it to a folder you'll keep — the extension loads from disk, not from the ZIP. A typical location is `Documents/Browser Extensions/Parrot/`
4. Open `chrome://extensions/`
5. Turn on **Developer Mode** in the top right
6. Click **Load unpacked**
7. Select the unzipped folder

The Parrot icon will appear in the toolbar. Pin it via the puzzle icon if you'd like it always visible.

## Option B — Build from source

If you want to hack on Parrot or run the latest unreleased code:

```bash
git clone https://github.com/The-Ant-Forge/Parrot.git
cd Parrot
npm install
npm run build
```

The build output lives at `.output/chrome-mv3/`. Load that folder via **Load unpacked** in `chrome://extensions/`.

For Firefox: `npm run build:firefox` produces `.output/firefox-mv2/`.

## First-time configuration

Once installed, click the toolbar icon. You'll see the setup form:

<img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/popup-not-configured.png" alt="Initial setup popup" width="380" />

1. **Plex Server URL** — e.g. `http://192.168.1.100:32400`. Use your server's LAN IP, not `localhost` (the extension service worker is sandboxed)
2. **Plex Token** — paste your token
3. Click **Save & Sync**

Parrot will build an in-memory index of every movie and show across all your libraries. For a 6000-movie / 1700-show library this typically takes 10-30 seconds the first time, then is instant on subsequent reloads (the index is cached for 7 days).

Once the index finishes, visit a supported site like [TMDB](https://www.themoviedb.org) and the badge will appear next to the title.

## What next?

- **[Configuration](Configuration)** — Add multiple Plex servers, optional API keys, gap detection thresholds
- **[Remote Access](Remote-Access)** — Set up your `.plex.direct` URL so the badge keeps working while travelling
- **[Badges and Panels](Badges-and-Panels)** — Understand what the pill is telling you
