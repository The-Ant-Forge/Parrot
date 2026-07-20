# Parrot — Browser Extension

## Project basics

- **Purpose:** Browser extension that checks if media you're browsing (TMDB, TVDB, IMDb) is already in your Plex library
- **Companion to:** [ComPlexionist](https://github.com/The-Ant-Forge/ComPlexionist) (finds library gaps; Parrot prevents duplicate hunting)
- **Tech stack:** TypeScript, Manifest V3, Vite/WXT
- **Target browsers:** Chrome. (Firefox builds exist but aren't distributed or tested — don't spend effort there.)
- **Full spec (incl. component map + message types):** `docs/Parrot spec.md`

---

## Architecture (orientation only — see spec for the full map)

- `src/entrypoints/` — `background.ts` service worker (CHECK handling, library index, metadata enrichment) + `bg/` helper modules; 18 `*.content.ts` scripts (one per site); `options/`; `popup/`
- `src/api/` — one client per external service: `plex.ts` (+ `plex-tv.ts` server discovery), community proxies `radarr.ts`/`sonarr.ts`, fallbacks `tmdb.ts`/`tvdb.ts`/`omdb.ts`, `tvmaze.ts`
- `src/common/` — shared types, storage, badge + gap panels, extractors, gap-checker, check-helpers, circuit breaker, logger
- `scripts/` — version bump scripts, `sync-wiki.js`

### Data Flow

1. Content script extracts media ID from URL/DOM (via `extractors.ts`)
2. Sends message to service worker: `{ type: "CHECK", mediaType: "movie", source: "tmdb", id: "550" }`
3. Service worker checks cached library index
4. Returns library status + plexUrl
5. Content script injects smart badge (wrapper+pill architecture)
6. Service worker enriches metadata via community proxies (Radarr for movies, Sonarr for TV) → falls back to user API keys
7. Ratings from up to 6 sources (TMDB, IMDb, RT, Metacritic, Trakt, TVDB) sent to badge via `RATINGS_READY`
8. For items in library, `gap-checker.ts` triggers collection or episode gap detection
9. Gap data delivered to badge via `setBadgeGapData()` as floating panel

### Community Proxies (Zero-Config)

Parrot uses free community API proxies by default (toggle: `useCommunityProxies`):

- **Radarr** (`api.radarr.video/v1`) — movie metadata + 5 rating sources, collection data
- **Sonarr** (`skyhook.sonarr.tv/v1`) — TV show metadata + full episode lists + external IDs

Both use circuit breakers (3 failures → 5-min cooldown) and 4-second timeouts. User API keys (TMDB, TVDB, OMDb) serve as fallback when proxies are unavailable.

### Library Index (Compact, Multi-Server)

Merged index across N priority-ordered Plex servers: items stored once in `items[]`, lookup maps (`byTmdbId`/`byImdbId`/`byTvdbId`/`byTitle` per media type) hold numeric indices. Lives in `browser.storage.local` (`unlimitedStorage`), auto-refreshed every 7 days by default. Details in the spec.

---

## Development

```bash
npm install
npm run dev      # hot-reload dev mode
npm run build    # production build (auto-bumps build number)
npm test         # vitest
npm run lint     # eslint
```

Load in Chrome: `chrome://extensions/` → Developer Mode → Load unpacked → `.output/chrome-mv3/`

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

### Wiki

The GitHub wiki at <https://github.com/The-Ant-Forge/Parrot/wiki> is sourced from `docs/wiki/` in this repo. GitHub serves it from a separate git repo (`Parrot.wiki.git`), which lives at `../Parrot.wiki/` next to the main checkout.

**To publish wiki updates:** edit the markdown under `docs/wiki/`, then:

```bash
npm run wiki:sync                    # default commit message
npm run wiki:sync -- "your message"  # custom commit message
```

The script (`scripts/sync-wiki.js`) copies every `*.md` from `docs/wiki/` (except its own `README.md`) into the wiki clone, commits, and pushes. No-op when nothing changed.

If the wiki clone doesn't exist yet, the script prints the exact `git clone` command. If the clone fails with "Repository not found", the wiki repo isn't bootstrapped — create any page via <https://github.com/The-Ant-Forge/Parrot/wiki> first, then retry.

Wiki images use absolute `raw.githubusercontent.com` URLs so screenshots only live in `docs/screenshots/` (versioned once with the code), not duplicated into the wiki repo.

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
2. **Dead dependencies** — unused or replaceable libraries
3. **Duplication** — repeated logic that should be shared
4. **Naming & consistency** — mixed conventions, unclear names, stale comments
5. **Error handling & reporting** — inconsistent patterns, swallowed exceptions,
   missing user-facing messages, silent catch blocks
6. **Security boundaries** — input validation, XSS/innerHTML in content scripts,
   message origin checks, credential handling, token leakage in logs
7. **Type safety** — missing annotations, unsafe assertions, and truthiness
   bugs on numeric/string fields where `0` or `""` are valid values
   (`if (x.Value)` vs `if (x.Value != null)` — this shipped a real bug)
8. **Async races & message flows** — content scripts firing more than one
   message for the same page state; background caches written by
   fire-and-forget async work (`tabMediaCache`, session memos);
   last-write-wins overwrites; duplicate in-flight requests that should
   coalesce. (The v1.22/v1.23 popup race lived here for months.)
9. **Test gaps** — untested paths, stale tests, missing edge cases
10. **Documentation drift** — spec, README, CLAUDE.md, `docs/wiki/` +
    published wiki, screenshots out of sync with code
11. **Performance, caching & quotas** — hot-path storage reads, bundle size,
    cache TTL policy, API rate limits, redundant network calls. Include
    **cache entry versioning**: when parsing/shape changes, do stale cached
    entries (7-day proxy TTLs) mask the fix? Which caches flush on extension
    update, which don't?
12. **MV3 lifecycle** — service worker cold starts, idempotent listeners, SPA
    navigation, tab sleep/wake, alarm/reconnect logic
13. **Content script safety** — DOM injection hygiene (no raw innerHTML with
    external data), style isolation, duplicate badge prevention, host page
    breakage
14. **API contract drift** — verify types against REAL captured responses
    (inspect cached `pc:*` entries in `chrome.storage.local`), not just by
    re-reading the type definitions. Prefer optional fields for
    community-API types so the compiler forces absence checks. (Both Radarr
    bugs were invisible in code, obvious in cached JSON.)
15. **Storage schema migration** — backward compat when stored data shapes change
16. **Manifest & permissions** — unused permissions, missing host_permissions
    matches, web_accessible_resources, CSP
17. **Graceful degradation** — every network call has an AbortController
    timeout tuned to its operation (a connection test and a full-library
    fetch differ by 10×); offline/rate-limit/proxy-down behaviour, circuit
    breaker coverage, stale-cache fallback, user-facing failure messages
18. **Tooling contracts** — release zip naming vs update-checker asset regex,
    `wiki:sync` source-of-truth, version bump scripts, anything in `scripts/`
19. **TODO/FIXME/HACK audit** — resolve or remove stale markers
20. **Cross-browser compat** — low priority: Chrome-only user base. Don't
    spend review time on Firefox; just avoid gratuitously breaking it.

### Deliverable
A review document in `docs/` named `Code-Review-YYMMDD.md` (or similar) with:
- Summary table: Category, Description, Action, Impact, Effort, Risk
- Detailed findings grouped by category, ordered by impact then effort
- Out-of-scope items noted for TODO.md

### Process
1. Produce the review document — do NOT implement during review
2. Optionally get a second-opinion review (`/consult-codex` or
   `/consult-gemini`) and merge findings before presenting
3. Review and approve findings with the user
4. Implement approved items in focused commits
5. Re-run tests after each change