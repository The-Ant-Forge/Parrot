# Badges and Panels

Parrot communicates through two surfaces: the **in-page badge** that injects next to titles on supported sites, and the **popup dashboard** you open via the toolbar icon.

## The in-page badge

<img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/badge-incomplete-collection.png" alt="Badge with rating, resolution, and incomplete state" />

The badge is a dark pill placed next to the title. Fields are separated by `·` and appear as data arrives — you'll often see the pill update from `[Plex]` to `[Plex · 7.2]` to `[Plex · 7.2 · 1080p]` to `[Plex · 7.2 · 1080p · Incomplete]` over a second or two.

### States

| Pill | Meaning |
|------|---------|
| Gray `[Plex]` | Not in your library |
| Gold `[Plex]` | In your library (no metadata yet) |
| Gold `[Plex · 7.2 · 1080p]` | In your library, with rating and resolution |
| Gold `[Plex · 7.2 · 1080p · Complete]` | All collection movies / show episodes accounted for |
| Gold `[Plex · 7.2 · 1080p · Incomplete]` | Some collection movies or show episodes missing |
| Red pill with tooltip | Error reaching Plex or an API |

### Interactions

The pill is a **split-click** control:

- Clicking on **Plex** opens the item in Plex Web (or the parent collection if the movie isn't owned but the collection is partially complete)
- Clicking on **Complete** or **Incomplete** toggles a floating gap panel anchored to the badge

When you click outside the panel, it dismisses automatically. The panel state is preserved while it's open — toggling won't reset which seasons you'd expanded.

## Collection gap panel (movies)

When you're on a movie that belongs to a collection — and you own at least one movie from that collection — clicking **Complete** or **Incomplete** opens a list of every movie in the set:

<img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/collection-gap-panel-Movie.png" alt="Collection gap panel" width="380" />

- ✓ (gold) = owned, with a **Plex** deep link
- ✗ (gray) = missing

Movies are sorted by release year. The header shows the collection name and "X of Y" — how many films you own out of the total in the collection.

The collection lookup runs against the **Radarr** community proxy first (no API key needed). If Radarr doesn't have collection data for that movie, it falls back to the **TMDB API** if you've configured a TMDB key in options.

> **Note:** The default `Minimum in library to show gaps` is 2 — you need to own at least two movies from a collection before the panel appears. If you own only one of the Iron Man films, no panel shows. Lower the threshold to 1 in options if you'd like collections to surface even with a single owned member.

## Episode gap panel (TV shows)

When you're on a TV show that's in your library, the panel shows a season-by-season breakdown:

<img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/collection-gap-panel-TV-series.png" alt="Episode gap panel" width="380" />

- Contiguous fully-complete seasons are grouped into ranges (`S1 - S12 269/269`)
- Contiguous fully-missing seasons are grouped too (`S13 - S37 0/532 (missing all)`)
- Partial seasons show the exact missing episode numbers compactly (`S5 6/10 (e3-5, e10)`)

The header shows totals: `269 of 801 episodes — 12 of 37 seasons full`.

The episode lookup runs against the **Sonarr** community proxy first (no API key needed). It falls back to the TMDB or TVDB v4 API when configured.

## The popup dashboard

Click the toolbar icon while you're on a media page to see a summary of:

- **Library counts** (movies / shows) and last-sync time
- **API status** pills (green = configured, gray = not)
- **Update banner** when a newer release is available
- **Current page metadata** — poster, title, year, ratings from every source, resolution, collection info, show status

<table>
  <tr>
    <td><img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/popup-dashboard-Movie.png" alt="Movie popup" /></td>
    <td><img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/popup-dashboard-TV-Series.png" alt="TV popup" /></td>
  </tr>
  <tr>
    <td align="center"><em>Movie view — IMDb ID, collection info</em></td>
    <td align="center"><em>TV view — seasons, episodes, show status</em></td>
  </tr>
</table>

### The orange Plex link

The gold "Plex" pill (with your server name next to it — "Holodeck" in the screenshots) is a deep link directly to the item in Plex Web. Click it to jump straight to the movie or show page in your Plex instance.

### Source pills

The smaller pills beneath show each rating source's individual score, e.g. `7.5 TMDB 13353` means TMDB has rated the movie 7.5 and its TMDB ID is 13353. Click any pill to open that item on its source site.

## The toolbar icon

The icon itself reflects the **current tab**'s library status:

<table>
  <tr>
    <td align="center"><img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/public/icons/owned-48.png" width="32" alt="Owned icon" /><br /><em>Owned</em></td>
    <td align="center"><img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/public/icons/not-owned-48.png" width="32" alt="Not owned icon" /><br /><em>Not owned</em></td>
    <td align="center"><img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/public/icons/inactive-48.png" width="32" alt="Inactive icon" /><br /><em>Inactive (unsupported page)</em></td>
  </tr>
</table>

When a Parrot update is available, the icon also shows a gold **"!"** badge — see [Updating](Updating).
