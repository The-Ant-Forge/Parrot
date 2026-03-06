# Parrot — Browser Extension

Read agents.md

## Project basics

- **Purpose:** Browser extension that checks if media you're browsing (TMDB, TVDB, IMDb) is already in your Plex library
- **Companion to:** [ComPlexionist](https://github.com/The-Ant-Forge/ComPlexionist) (finds library gaps; Parrot prevents duplicate hunting)
- **Tech stack:** TypeScript, Manifest V3, Vite/WXT
- **Target browsers:** Chrome (primary), Firefox (secondary)
- **Full spec:** `docs/Parrot spec.md`

---

## Architecture

```
src/
├── entrypoints/
│   ├── background.ts              # Library index cache, Plex API proxy
│   ├── *.content.ts               # Content scripts (one per supported site)
│   ├── options/                   # Full-tab options page
│   └── popup/                     # Settings/status popup
├── api/
│   ├── plex.ts                    # Plex API client
│   ├── tmdb.ts                    # TMDB v3 API client
│   ├── tvdb.ts                    # TVDB v4 API client (optional)
│   ├── tvmaze.ts                  # TVMaze API client (free, no key)
│   └── omdb.ts                    # OMDb API client (IMDb ratings, optional)
└── common/
    ├── types.ts                   # Shared types
    ├── storage.ts                 # Storage helpers
    ├── badge.ts                   # Smart badge (wrapper+pill, floating panel)
    ├── gap-checker.ts             # Shared gap detection orchestration
    ├── collection-panel.ts        # Collection gap panel component
    ├── episode-panel.ts           # Episode gap panel component
    ├── panel-utils.ts             # Shared panel styling utilities
    ├── extractors.ts              # URL/ID extractors + DOM link scanner + JSON-LD
    ├── url-observer.ts            # Debounced URL change observer for SPAs
    ├── normalize.ts               # Title normalization + h1 text parsing
    ├── dom-utils.ts               # DOM utilities (waitForElement)
    ├── title-check.ts             # Title-based CHECK with year fallback
    ├── ui-helpers.ts              # Shared UI helpers (feedback, button loading, timestamps)
    ├── logger.ts                  # Debug/error logging gated by settings toggle
    └── sites.ts                   # Supported site definitions
```

### Data Flow

1. Content script extracts media ID from URL/DOM (via `extractors.ts`)
2. Sends message to service worker: `{ type: "CHECK", mediaType: "movie", source: "tmdb", id: "550" }`
3. Service worker checks cached library index
4. Returns library status + plexUrl
5. Content script injects smart badge (wrapper+pill architecture)
6. For items in library, `gap-checker.ts` triggers collection or episode gap detection
7. Gap data delivered to badge via `setBadgeGapData()` as floating panel

### Library Index (Compact, Multi-Server)

Parrot supports N Plex servers. On setup/refresh, it fetches all items from each server and builds a merged index. Items are stored once in `items[]`; lookup maps hold numeric indices (two-step lookup). Items existing on multiple servers share a single `OwnedItem` with `plexKeys: Record<serverId, ratingKey>`. Servers are priority-ordered (first = primary for deep linking).

Lookup maps:
- `movies.byTmdbId`, `movies.byImdbId`, `movies.byTitle`
- `shows.byTvdbId`, `shows.byTmdbId`, `shows.byImdbId`, `shows.byTitle`

Stored in `browser.storage.local` (with `unlimitedStorage` permission). Auto-refreshed on configurable interval (default 7 days).

---

## Development

### Setup
```bash
npm install
```

### Dev mode (with hot reload)
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Test
```bash
npm test
```

### Lint
```bash
npm run lint
```

### Load in Chrome
1. Go to `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select `.output/chrome-mv3/` folder

### Versioning

Version format: `Major.A.B` (e.g. `1.12.15`)

| Segment | Meaning | How it changes |
|---------|---------|----------------|
| Major | Major version | Manual edit in `package.json` |
| A | Commit number | `npm run version:commit` (resets B to 0) |
| B | Build number | Auto-incremented on every `npm run build` via prebuild script |

- **Single source of truth:** `package.json` → `wxt.config.ts` reads from it
- **Scripts:** `scripts/bump-build.js` (B++), `scripts/bump-commit.js` (A++, B=0)
- All segments can be manually edited in `package.json` if needed

### Releases
Before doing a release chack that all primary document are updated and current with respect to what you know of the changes made. This includes TODO.md, completed.md, parrot spec.md and readme.md (in the root). Then do a commit and push to capture those changes int he remote before starting the normal release procedure.

All releases should have a thorough description in markdown format. Descriptions should start with an intro paragraph giving a broad summary of changes, improvements and fixes then list in order:
1. New Features: What they are, how they work and what benefit they bring
2. Code improvements: What changes to existing feature or code was made and why.
3. Bug fixes: What bugs were fixed and how
4. Anything else we want to say about this release

---

## Working style

### Keep diffs focused
- One logical change per commit
- Avoid unrelated reformatting

### Planning sessions → write a spec
Whenever we do a planning session (plan mode), always write the finalised specification into `docs/` as a named document. This ensures we have a durable reference if context is lost or the session is interrupted.

### Update docs before committing
Before committing, check if `docs/Parrot spec.md`, `README.md` and `CLAUDE.md` need updating to reflect the changes (new sites, new features, architectural changes, etc.) and check whether a `docs/TODO.md` can be checked. If an entire TODO section is completed then move the section to Completed.md in the same folder.

### Compile/test locally after changes
1. Make a small, targeted change
2. Run tests/linting after each change
3. Only then commit/push

### Documentation or commentary
Never use real movie or tv show names. Always make up example ones.

---

## Storage

- **`browser.storage.sync`** — Plex servers, options, custom sites (syncs across devices)
- **`browser.storage.local`** — Library index, collection/episode caches (`unlimitedStorage`)

---

## Code Review Phases

Periodically we do a consolidation review covering all source, tests, build config, and metadata.

### Review Checklist
1. **Dead code** — unused functions, classes, modules, imports, config keys
2. **Dead dependencies** — libraries that are unused or underused relative
   to what we could replace inline
3. **Duplication** — repeated or near-identical logic that should be shared
4. **Naming & consistency** — mixed conventions, unclear names, stale comments
5. **Error handling** — inconsistent patterns, swallowed exceptions, missing
   user-facing messages
6. **Security** — input validation gaps, credential handling, OWASP patterns
7. **Type safety** — missing annotations, `Any` overuse, type errors
8. **Test gaps** — untested code paths, stale tests, missing edge cases
9. **Documentation drift** — specs, docstrings, or README sections that no
   longer match the code
10. **Performance** — unnecessary work, avoidable allocations, slow patterns
11. **Robustness** — race conditions, resource leaks, missing cleanup
12. **TODO/FIXME/HACK audit** — resolve or remove stale markers

### Deliverable
A review document in `docs/` named `Code-Review-YYMMDD.md` (or similar) with:
- Summary table: Category, Description, Action, Impact, Effort, Risk
- Detailed findings grouped by category, ordered by impact then effort
- Out-of-scope items noted for TODO.md

### Process
1. Produce the review document — do NOT implement during review
2. Review and approve findings with the user
3. Implement approved items in focused commits
4. Re-run tests after each change