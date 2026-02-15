# Phase 6: TMDB Collection Gap Detection

## Goal

When viewing a movie page on TMDB, if that movie belongs to a collection and the user owns some but not all movies in it, show a collapsible gap panel listing owned and missing movies.

**Prerequisite:** Phase 5 (Options Page) must be complete — provides the TMDB API key.

---

## Files

| File | Action |
|------|--------|
| `src/api/tmdb.ts` | **New** — TMDB API client |
| `src/common/types.ts` | **Modify** — add collection types, `CHECK_COLLECTION` message |
| `src/common/collection-panel.ts` | **New** — DOM component for gap display |
| `src/entrypoints/background.ts` | **Modify** — add `CHECK_COLLECTION` handler |
| `src/entrypoints/tmdb.content.ts` | **Modify** — trigger collection check after ownership check |
| `src/common/storage.ts` | **Modify** — add collection cache helpers |

---

## TMDB API Client (`src/api/tmdb.ts`)

Two endpoints, following ComPlexionist's proven patterns:

```typescript
// Auth: API key as query param
// Base: https://api.themoviedb.org/3

async function getMovie(apiKey: string, movieId: number)
// GET /movie/{movieId}?api_key={key}
// Returns movie details — we only need belongs_to_collection

async function getCollection(apiKey: string, collectionId: number)
// GET /collection/{collectionId}?api_key={key}
// Returns all movies in collection with release dates
```

```typescript
interface CollectionMovie {
  id: number;           // TMDB movie ID
  title: string;
  release_date: string; // "YYYY-MM-DD" or ""
  poster_path: string | null;
}
```

---

## Collection Cache

Store fetched collection data in `browser.storage.local` under `"tmdbCollections"`:

```typescript
Record<string, { data: CollectionData; fetchedAt: number }>
```

TTL: 30 days (collections rarely change).

---

## Message Protocol

New message type:
```typescript
| { type: "CHECK_COLLECTION"; tmdbMovieId: string }
```

Response:
```typescript
interface CollectionCheckResponse {
  hasCollection: boolean;
  collection?: {
    name: string;
    totalMovies: number;
    ownedMovies: { title: string; year?: number; plexUrl?: string }[];
    missingMovies: { title: string; releaseDate?: string; tmdbId: number }[];
  };
}
```

---

## Background Handler Logic (`CHECK_COLLECTION`)

1. Load options -> get TMDB API key (bail if not configured)
2. Call `getMovie(tmdbMovieId)` -> get `belongs_to_collection.id`
3. If no collection -> return `{ hasCollection: false }`
4. Check collection cache; fetch `getCollection(collectionId)` if stale/missing
5. Filter parts based on options:
   - If `excludeFuture`: only include movies where `release_date < today` (strict `<` for timezone buffer, per ComPlexionist pattern)
6. Check which parts are in the library index (by TMDB ID)
7. Apply `minCollectionSize` and `minOwned` filters
8. Return owned/missing lists

---

## Collection Panel Component (`src/common/collection-panel.ts`)

A collapsible panel injected below the ownership badge on TMDB movie pages:

```
+-------------------------------------------+
| > Spy Saga Collection -- 2 of 5 owned     |  <- collapsed by default
+-------------------------------------------+
|  [check] The First Mission (2002)  [Plex] |  <- owned, links to Plex
|  [check] The Sequel (2004)         [Plex] |
|  [x] The Third One (2007)                 |  <- missing
|  [x] The Reboot (2012)                    |
|  [x] The Finale (2020)                    |
+-------------------------------------------+
```

- Dark theme matching badge styling (`#282828` bg, `#ebaf00` gold accents)
- Owned movies: gold checkmark, clickable Plex deep link
- Missing movies: gray X, release year shown
- Header: "Collection Name -- X of Y owned"
- Collapsed by default, click to expand
- Only shown when there are gaps (all owned = no panel)

---

## TMDB Content Script Changes

After the existing ownership badge flow completes:

1. If `mediaType` is `"movie"`, send `CHECK_COLLECTION` with the TMDB ID
2. On response, if `hasCollection && missingMovies.length > 0`, inject collection panel
3. Panel placed after the badge anchor (`section.inner_content h2`)

---

## Styling

Inline styles (same pattern as `badge.ts`). Content scripts can't share external CSS across sites. The panel is TMDB-only for now, so keeping styles self-contained in `collection-panel.ts` is fine.

---

## Key Patterns from ComPlexionist

- **Date timezone buffer:** Use strict `<` (not `<=`) for release date comparison, matching ComPlexionist's `is_released` property
- **Collection cache TTL:** 30 days (same as ComPlexionist)
- **min_collection_size / min_owned filters:** Prevent noise from tiny collections or single-movie matches
- **TMDB auth:** API key as query param (`?api_key={key}`), not header

---

## Verification

1. `npm run build` compiles cleanly
2. Browse to a TMDB movie in a collection you partially own
3. Ownership badge appears (existing behaviour)
4. Collection panel appears below, showing owned/missing breakdown
5. Click an owned movie -> opens in Plex Web
6. Movie not in a collection -> no panel shown
7. All movies owned -> no panel shown (no gaps)
