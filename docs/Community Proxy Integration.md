# Community Proxy Integration (Radarr + Sonarr)

**Status:** Draft
**Date:** 2026-03-13

---

## Overview

Both Radarr and Sonarr maintain free, unauthenticated community API proxies (internally called "SkyHook"):

| Proxy | Base URL | Covers | Ratings |
|-------|----------|--------|---------|
| **Radarr** | `https://api.radarr.video/v1` | Movies | IMDb, TMDB, Rotten Tomatoes, Metacritic, Trakt |
| **Sonarr** | `https://skyhook.sonarr.tv/v1` | TV Shows | Single rating (TVDB-sourced) |

Together they give Parrot **baseline functionality for both movies and TV shows with zero API keys**. New users get a working extension out of the box — Plex server is the only required config.

### Goals

1. **Zero-config media support** — movies and TV shows work without any API keys
2. **Richer movie ratings** — surface Rotten Tomatoes, Metacritic, and Trakt alongside IMDb and TMDB
3. **Keyless TV metadata** — show details, episode lists, and external IDs without TMDB/TVDB keys
4. **Lower API consumption** — reduce calls against users' personal API quotas
5. **Graceful degradation** — fall back to user keys if proxies are down or slow

### Non-Goals

- Removing existing API key fields (they remain as optional fallbacks/overrides)
- Panel redesign for individual rating breakdown (follow-up)

---

## Radarr Proxy (Movies)

Base URL: `https://api.radarr.video/v1`

### Endpoints

| Endpoint | Method | Use in Parrot |
|----------|--------|---------------|
| `/movie/{tmdbId}` | GET | Primary movie metadata + all ratings |
| `/movie/imdb/{imdbId}` | GET | Lookup when we only have an IMDb ID |
| `/movie/bulk` | POST | Future: batch enrichment |
| `/movie/collection/{tmdbId}` | GET | Collection gap detection |
| `/search?q={query}&year={year}` | GET | Title-based fallback lookups |

### Verified Response Shape

Fields use **PascalCase**. The multi-source ratings live under `MovieRatings`:

```json
{
  "TmdbId": 550,
  "ImdbId": "tt0137523",
  "Title": "The Temporal Paradox",
  "OriginalTitle": "The Temporal Paradox",
  "Year": 1999,
  "Overview": "A bored office worker forms an underground club...",
  "Studio": "Phantom Pictures",
  "Runtime": 139,
  "Popularity": 23.84,
  "Status": null,
  "Images": [
    { "CoverType": "poster", "Url": "https://image.tmdb.org/..." },
    { "CoverType": "fanart", "Url": "https://image.tmdb.org/..." }
  ],
  "MovieRatings": {
    "Tmdb":           { "Count": 31586, "Value": 8.438, "Type": "User" },
    "Imdb":           { "Count": 2582869, "Value": 8.8, "Type": "User" },
    "Metacritic":     { "Count": 0, "Value": 67, "Type": "User" },
    "RottenTomatoes": { "Count": 0, "Value": 81, "Type": "User" },
    "Trakt":          { "Count": 61721, "Value": 8.70362, "Type": "User" }
  },
  "Ratings": [{ "Count": 31586, "Value": 8.438, "Origin": "Tmdb", "Type": "User" }],
  "Genres": ["Drama", "Thriller"],
  "Certifications": [{ "Country": "us", "Certification": "R" }],
  "Collection": { "TmdbId": 0, "Title": null },
  "YoutubeTrailerId": "...",
  "Credits": { "Cast": [...], "Crew": [...] },
  "Recommendations": [123, 456, ...]
}
```

### Rating Scales

| Source | Field | Scale | Notes |
|--------|-------|-------|-------|
| TMDB | `MovieRatings.Tmdb.Value` | 0–10 | Vote average |
| IMDb | `MovieRatings.Imdb.Value` | 0–10 | Weighted user average |
| Metacritic | `MovieRatings.Metacritic.Value` | 0–100 | Critic aggregate |
| Rotten Tomatoes | `MovieRatings.RottenTomatoes.Value` | 0–100 | Tomatometer (% positive) |
| Trakt | `MovieRatings.Trakt.Value` | 0–10 | User average |

### What Radarr Replaces (for movies)

| Current source | Key needed | Radarr equivalent | Key needed |
|---------------|------------|-------------------|------------|
| TMDB `getMovie()` | TMDB key | `/movie/{tmdbId}` | None |
| TMDB `getCollection()` | TMDB key | `/movie/collection/{tmdbId}` | None |
| TMDB `findByImdbId()` | TMDB key | `/movie/imdb/{imdbId}` | None |
| TMDB `searchMovie()` | TMDB key | `/search?q=...&year=...` | None |
| OMDb `getImdbRating()` | OMDb key | `MovieRatings.Imdb` | None |

---

## Sonarr Proxy (TV Shows)

Base URL: `https://skyhook.sonarr.tv/v1`

### Endpoints

| Endpoint | Method | Use in Parrot |
|----------|--------|---------------|
| `/tvdb/shows/en/{tvdbId}` | GET | Show metadata + full episode list |
| `/tvdb/search/en/?term={query}` | GET | Title-based show search |

### Verified Response Shape

Fields use **camelCase** (different from Radarr's PascalCase):

```json
{
  "tvdbId": 81189,
  "imdbId": "tt0903747",
  "tmdbId": 1396,
  "tvMazeId": 169,
  "tvRageId": 18164,
  "title": "The Crystal Experiment",
  "overview": "A chemistry teacher turns to cooking...",
  "slug": "the-crystal-experiment",
  "status": "Ended",
  "firstAired": "2008-01-20",
  "lastAired": "2013-09-29",
  "runtime": 48,
  "originalNetwork": "AMC",
  "network": "AMC",
  "genres": ["Crime", "Drama", "Thriller"],
  "contentRating": "TV-MA",
  "originalCountry": "usa",
  "originalLanguage": "eng",
  "rating": { "count": 2580091, "value": "9.5" },
  "images": [
    { "coverType": "Banner", "url": "https://artworks.thetvdb.com/..." },
    { "coverType": "Poster", "url": "https://artworks.thetvdb.com/..." }
  ],
  "seasons": [
    { "seasonNumber": 0, "images": [...] },
    { "seasonNumber": 1, "images": [...] }
  ],
  "episodes": [
    {
      "tvdbShowId": 81189,
      "tvdbId": 349232,
      "seasonNumber": 1,
      "episodeNumber": 1,
      "absoluteEpisodeNumber": 1,
      "title": "Pilot",
      "overview": "...",
      "airDate": "2008-01-20",
      "airDateUtc": "2008-01-21T02:00:00Z",
      "runtime": 58,
      "image": "https://artworks.thetvdb.com/...",
      "finaleType": null
    }
  ],
  "actors": [
    { "name": "Bryan Cranston", "character": "Walter White", "image": "..." }
  ],
  "alternativeTitles": [{ "title": "..." }]
}
```

### What Sonarr Provides (for TV)

| Data | Available | Notes |
|------|-----------|-------|
| Show metadata (title, overview, status, network) | Yes | Full details |
| External IDs (TVDB, TMDB, IMDb, TVMaze) | Yes | All cross-references in one call |
| Episode list (season/episode numbers, air dates) | Yes | Complete — enables gap detection |
| Season structure | Yes | Season count with images |
| Single rating | Yes | TVDB-sourced, value is string "9.5" format |
| Multi-source ratings (RT, Metacritic, etc.) | **No** | Only TVDB rating available |
| Cast | Yes | Names, characters, images |

### What Sonarr Replaces (for TV)

| Current source | Key needed | Sonarr equivalent | Key needed |
|---------------|------------|-------------------|------------|
| TMDB `getTvShow()` | TMDB key | `/tvdb/shows/en/{tvdbId}` | None |
| TMDB `getTvSeason()` | TMDB key | Episodes included in show response | None |
| TVDB `getSeriesEpisodes()` | TVDB key | Episodes included in show response | None |
| TVDB `getSeriesDetails()` | TVDB key | `/tvdb/shows/en/{tvdbId}` | None |
| TVMaze `lookupByTvdb()` | None | IDs included in show response | None |
| TVMaze `lookupByImdb()` | None | IDs included in show response | None |

**Key win:** Sonarr returns the **complete episode list** in a single call, which currently requires a TVDB key (via `getSeriesEpisodes`). This makes episode gap detection work keylessly.

### Sonarr Limitation: TVDB ID Required

Sonarr's endpoint is keyed by **TVDB ID**. When content scripts send a CHECK with a different source:

- **Source: `tmdb`** — need TMDB→TVDB mapping. Options:
  1. Use TMDB API `findByTmdbId` (requires TMDB key)
  2. Use TVMaze lookup (free, but doesn't cover all shows)
  3. The library index already stores `tvdbId` for owned items
- **Source: `imdb`** — use TVMaze `lookupByImdb()` (free) → get `tvdbId` → call Sonarr
- **Source: `title`** — use Sonarr's `/tvdb/search/en/?term=...` (free)

For unowned shows where we only have a TMDB ID and no TVDB key, the fallback chain is:
```
1. TVMaze lookupByTmdb (if they add it) or search by title
2. Sonarr search by title
3. TMDB API (if user has key)
```

---

## Shared Architecture

### New Modules

**`src/api/radarr.ts`** — Radarr proxy client (movies):
```typescript
const BASE_URL = "https://api.radarr.video/v1";

interface RadarrRatingEntry { Value: number; Count: number; Type: string; }

interface RadarrMovieRatings {
  Tmdb?:           RadarrRatingEntry;
  Imdb?:           RadarrRatingEntry;
  Metacritic?:     RadarrRatingEntry;
  RottenTomatoes?: RadarrRatingEntry;
  Trakt?:          RadarrRatingEntry;
}

interface RadarrMovie {
  TmdbId: number;
  ImdbId?: string;
  Title: string;
  OriginalTitle?: string;
  Year: number;
  Overview?: string;
  Studio?: string;
  Runtime?: number;
  Status?: string;
  Images?: { CoverType: string; Url: string }[];
  MovieRatings: RadarrMovieRatings;
  Genres?: string[];
  Collection?: { TmdbId: number; Title?: string };
}

export async function getRadarrMovie(tmdbId: number): Promise<RadarrMovie | null>;
export async function getRadarrMovieByImdb(imdbId: string): Promise<RadarrMovie | null>;
export async function getRadarrCollection(collectionTmdbId: number): Promise<RadarrCollection | null>;
export async function searchRadarrMovie(query: string, year?: number): Promise<RadarrMovie[] | null>;
```

**`src/api/sonarr.ts`** — Sonarr proxy client (TV shows):
```typescript
const BASE_URL = "https://skyhook.sonarr.tv/v1";

interface SonarrEpisode {
  tvdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  absoluteEpisodeNumber?: number;
  title: string;
  overview?: string;
  airDate?: string;
  airDateUtc?: string;
  runtime?: number;
  finaleType?: string;
}

interface SonarrShow {
  tvdbId: number;
  imdbId?: string;
  tmdbId?: number;
  tvMazeId?: number;
  title: string;
  overview?: string;
  status: string;
  firstAired?: string;
  lastAired?: string;
  runtime?: number;
  originalNetwork?: string;
  network?: string;
  genres?: string[];
  contentRating?: string;
  rating?: { count: number; value: string };
  images?: { coverType: string; url: string }[];
  seasons?: { seasonNumber: number }[];
  episodes: SonarrEpisode[];
}

export async function getSonarrShow(tvdbId: number): Promise<SonarrShow | null>;
export async function searchSonarrShow(query: string): Promise<SonarrShow[] | null>;
```

### Shared Circuit Breaker

Both proxies share the same resilience pattern but with **independent breakers** (one proxy being down shouldn't disable the other):

```typescript
// In common/circuit-breaker.ts
export function createCircuitBreaker(name: string, maxFailures = 3, cooldownMs = 5 * 60 * 1000) {
  let failures = 0;
  let openUntil = 0;

  return {
    isOpen: () => Date.now() < openUntil,
    recordSuccess: () => { failures = 0; },
    recordFailure: () => {
      if (++failures >= maxFailures) openUntil = Date.now() + cooldownMs;
    },
  };
}

// Usage:
const radarrBreaker = createCircuitBreaker("radarr");
const sonarrBreaker = createCircuitBreaker("sonarr");
```

### Timeout Strategy

Both proxies use a **3-4 second timeout**. Metadata fetches are already async (don't block the CHECK response), so users see ownership status instantly regardless.

### Response Caching

Cached in `browser.storage.local` keyed by stable IDs:

```typescript
// Movie cache: "radarr:movie:{tmdbId}" — TTL 7 days
// Show cache:  "sonarr:show:{tvdbId}"  — TTL 7 days
// Search cache: "radarr:search:{query}:{year}" / "sonarr:search:{query}" — TTL 24 hours

interface ProxyCacheEntry<T> {
  data: T;
  fetchedAt: number;
}
```

On lookup:
1. Check cache — if fresh, return immediately (no network call)
2. If stale, return cached data AND refresh in the background (stale-while-revalidate)
3. If missing, fetch from proxy

### Lookup Priority

**Movies:**
```
1. Radarr proxy  (free, rich data, 5 rating sources)
   ↓ circuit open / fails / times out
2. User's TMDB key  (if configured)  +  OMDb key for IMDb rating
   ↓ keys not configured
3. Return partial/no metadata
```

**TV Shows:**
```
1. Sonarr proxy  (free, full episode data, external IDs)
   ↓ circuit open / fails / times out
2. User's TMDB key  (if configured)  +  TVDB key for episodes
   ↓ keys not configured
3. TVMaze  (free, but limited — no episode gap data)
   ↓ not found
4. Return partial/no metadata
```

**TV Ratings (movies get all ratings from Radarr):**
```
1. Sonarr rating  (single TVDB-sourced rating, always available with show data)
2. User's TMDB key → tmdbRating  (if configured)
3. OMDb key → imdbRating  (if configured and we have imdbId from Sonarr)
```

---

## Changes to `background.ts`

### `fetchTabMetadata()` — Movie Branch

Current flow:
1. Get TMDB movie details (requires TMDB key)
2. Extract IMDb ID
3. Get OMDb rating (requires OMDb key)
4. Send RATINGS_READY

New flow:
1. **Try Radarr proxy** (by TMDB ID or IMDb ID)
2. If successful: extract all metadata + all 5 ratings
3. If failed: fall back to TMDB key → OMDb key (current path)
4. Send RATINGS_READY with expanded rating data

### `fetchTabMetadata()` — TV Branch

Current flow:
1. Get TMDB show details (requires TMDB key)
2. Get TVDB episodes (requires TVDB key)
3. Get OMDb rating (requires OMDb key)
4. Send RATINGS_READY

New flow:
1. **Try Sonarr proxy** (by TVDB ID — available from library index or TVMaze lookup)
2. If successful: extract show metadata + full episode list + external IDs + TVDB rating
3. If failed: fall back to TMDB key → TVDB key (current path)
4. Optionally enrich with TMDB/OMDb ratings if user has keys
5. Send RATINGS_READY

### `handleCheck()` — Cross-Reference

**Movie (source: `imdb`, not in index):**
1. Try Radarr `/movie/imdb/{imdbId}` → get `TmdbId`
2. Fall back to TMDB `findByImdbId` if Radarr fails

**TV (source: `tmdb`, need TVDB ID for Sonarr):**
1. Check library index (owned items already have `tvdbId`)
2. Try TVMaze `lookupByImdb` or search (free)
3. Try Sonarr search by title (free)
4. Fall back to TMDB (if user has key)

### Episode Gap Detection

Currently requires TVDB key for `getSeriesEpisodes()`. Sonarr returns the full episode list in the show response, so:

1. **Try Sonarr** `/tvdb/shows/en/{tvdbId}` → `episodes[]`
2. Compare against Plex library seasons/episodes
3. Fall back to TVDB key → TMDB key (current path)

---

## Expanded Ratings in Types

```typescript
// In types.ts — extend TabMediaInfo
interface TabMediaInfo {
  // ... existing fields ...
  tmdbRating?: number;        // 0-10
  imdbRating?: number;        // 0-10
  rtRating?: number;          // 0-100 (Rotten Tomatoes) — movies only via Radarr
  metacriticRating?: number;  // 0-100 — movies only via Radarr
  traktRating?: number;       // 0-10 — movies only via Radarr
  tvdbRating?: number;        // 0-10 — TV only via Sonarr
}

// RATINGS_READY message gains new fields
{
  type: "RATINGS_READY";
  tmdbRating?: number;
  imdbRating?: number;
  rtRating?: number;
  metacriticRating?: number;
  traktRating?: number;
  tvdbRating?: number;
}
```

### Badge Display Rating

Normalise all sources to 0–10 and average:

```typescript
function computeDisplayRating(ratings: TabMediaInfo): string {
  const values: number[] = [];
  if (ratings.tmdbRating)       values.push(ratings.tmdbRating);            // 0-10
  if (ratings.imdbRating)       values.push(ratings.imdbRating);            // 0-10
  if (ratings.rtRating)         values.push(ratings.rtRating / 10);         // 0-100 → 0-10
  if (ratings.metacriticRating) values.push(ratings.metacriticRating / 10); // 0-100 → 0-10
  if (ratings.traktRating)      values.push(ratings.traktRating);           // 0-10
  if (ratings.tvdbRating)       values.push(ratings.tvdbRating);            // 0-10
  if (values.length === 0) return "";
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return avg.toFixed(1);
}
```

Note: Sonarr's `rating.value` is a **string** ("9.5") — needs `parseFloat()` during extraction.

---

## Options Page

- Existing API key fields (TMDB, TVDB, OMDb) remain but are now labelled as **optional — for faster lookups or as fallback**
- New toggle: **"Use community proxies (Radarr/Sonarr)"** (default: ON)
  - When ON: proxies tried first; user keys are fallback
  - When OFF: current behaviour (user keys only)
- Status indicators show proxy reachability alongside existing key validation

### Storage Changes

```typescript
interface ParrotOptions {
  // ... existing fields ...
  useCommunityProxies: boolean;  // default: true (replaces useRadarrProxy)
}
```

---

## Out-of-the-Box Experience

With community proxies enabled (default), a new user who only configures their Plex server gets:

| Feature | Movies | TV Shows |
|---------|--------|----------|
| Library ownership check | Yes (via Plex index) | Yes (via Plex index) |
| Title, year, overview | Yes (Radarr) | Yes (Sonarr) |
| Poster image | Yes (Radarr) | Yes (Sonarr) |
| IMDb rating | Yes (Radarr) | No (need OMDb key) |
| TMDB rating | Yes (Radarr) | No (need TMDB key) |
| RT / Metacritic / Trakt | Yes (Radarr) | No (movies only) |
| TVDB rating | N/A | Yes (Sonarr) |
| Episode gap detection | N/A | Yes (Sonarr episodes) |
| Collection gap detection | Yes (Radarr) | N/A |
| Cross-reference (IMDb↔TMDB) | Yes (Radarr) | Partial (TVMaze + Sonarr IDs) |

**What API keys add on top:**
- TMDB key → TMDB ratings for TV, richer show metadata, reliable TMDB↔TVDB mapping
- TVDB key → redundant with Sonarr (kept as fallback)
- OMDb key → IMDb ratings for TV shows (Radarr already provides this for movies)

---

## Implementation Sequence

1. **Create `src/common/circuit-breaker.ts`** — shared circuit breaker utility
2. **Create `src/api/radarr.ts`** — Radarr proxy client with PascalCase types
3. **Create `src/api/sonarr.ts`** — Sonarr proxy client with camelCase types
4. **Add `useCommunityProxies` option** — storage, types, defaults
5. **Update `fetchTabMetadata()` movie branch** — Radarr-first with fallback
6. **Update `fetchTabMetadata()` TV branch** — Sonarr-first with fallback
7. **Update `handleCheck()` cross-reference** — proxy-based ID lookups
8. **Update episode gap detection** — Sonarr episode data
9. **Update collection gap detection** — Radarr collection endpoint
10. **Expand rating types** — add RT, Metacritic, Trakt, TVDB to types and messages
11. **Update badge `computeDisplayRating()`** — normalise and average all sources
12. **Add response caching** — storage helpers for proxy cache entries
13. **Update options page** — toggle + labelling changes
14. **Tests** — new API client tests, circuit breaker tests, updated background flow tests
15. **Docs** — update Parrot spec, README, CLAUDE.md

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Radarr proxy goes down | Short timeout + circuit breaker + automatic fallback to user keys |
| Sonarr proxy goes down | Short timeout + independent circuit breaker + fallback to TMDB/TVDB keys + TVMaze |
| Proxies rate-limit Parrot | Local cache (7-day TTL) + stale-while-revalidate; one call per unique media item |
| Response format changes | Version in URL (`/v1/`); type-safe parsing with null checks; independent of each other |
| PascalCase vs camelCase | Separate type definitions per proxy; no shared response types |
| Sonarr requires TVDB ID | Library index provides it for owned items; TVMaze bridge for unowned; Sonarr search for title-only |
| Community perception of freeloading | Lightweight consumer (single lookups); same usage pattern as any Radarr/Sonarr instance |
| Both proxies down simultaneously | Full fallback to current key-based flow; TVMaze still works independently |
