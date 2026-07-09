# Code Review — 2026-07-09

> **Implementation status: ALL 24 FINDINGS IMPLEMENTED.**
> Findings **1–7, 9–13, 15, 16, 18, 20–22, 24** shipped in v1.24.0 across five
> commits (`31a2ce1`, `eb2166e`, `0cc10f8`, `fd4bf28` + release docs).
> The deferred set — **8, 14, 17, 19, 23** — landed in the dedicated refactor
> session (2026-07-09, commits `e0fad0c`, `054273e`, `47db840`, `fe6a626`,
> `f11a802`); see Completed.md → "Deferred Refactor Session". Note: #14's
> suspected three-way `excludeFuture` boundary inconsistency turned out not to
> exist — the Sonarr/TVDB `>= today` skip and the TMDB `< today` keep are
> complements; the uniform rule is now documented and tested in
> `bg/season-gaps.ts`.

> **Status: FINAL — two-reviewer merge.** Internal full-checklist pass (23 findings)
> merged with an independent Codex (GPT-5.3) second-opinion pass (10 findings).
> Codex independently confirmed findings **1, 7, 8, 16, 17, 22** — marked
> "⁂ 2nd-opinion agreement" below; treat those severities as high-confidence.
> Codex contributed three deltas now merged in: the tabMedia session
> read-modify-write race (folded into 15), unguarded `.toLowerCase()` on
> optimistic image/status fields (folded into 16), and in-flight request
> coalescing promoted from out-of-scope to finding 24.

**Scope:** Full consolidation review at v1.23.0 — all of `src/`, `tests/`, build
config (`wxt.config.ts`, `package.json`, `tsconfig.json`, `eslint.config.js`,
`vitest.config.ts`), and `scripts/`.

**Baseline verified before review:** `npm test` — 302 tests / 20 files pass;
`npm run lint` clean.

**Checked and found OK (no findings):**

- Content-script DOM hygiene — no `innerHTML` with external data anywhere; the only
  `innerHTML` writes use internally-generated SVG/static strings (`badge.ts`), and all
  panel/popup/options rendering uses `textContent`/`createElement`.
- Token/key leakage — no Plex tokens or API keys appear in any `debugLog`/`errorLog`
  call; `FETCH_REMOTE_URL` logs only the machineIdentifier.
- MV3 lifecycle — all listeners (`onMessage`, `onInstalled`, `tabs.onRemoved`,
  `storage.onChanged`) registered synchronously inside `defineBackground()`; caches
  rebuild lazily on cold start; episode-gap cache flushed on update.
- Zip/tooling contract — `pickZipAssetUrl` regex (`src/entrypoints/bg/version.ts:32`,
  `/chrome.*\.zip$/i`) matches WXT's `parrot-{version}-chrome.zip` naming; bump
  scripts are sound.
- TODO/FIXME/HACK audit — zero stale markers in `src/` or `scripts/`.
- Truthiness on ratings — `applyRadarrRatings` uses `!= null` (fixed in the 260313
  review); remaining `x && x > 0` checks in `badge.ts`/`popup` are explicit and
  deliberate (a 0 average is meaningless to display).
- Radarr contract fixes from v1.22/v1.23 hold: IMDb endpoint unwrapped as array
  (`radarr.ts:134-138`), `RadarrCollection.Movies` optional and guarded everywhere.

---

## Summary Table

*⁂ = independently flagged by both reviewers (high-confidence severity).*

| ID | Category | Description | Action | Impact | Effort | Risk |
|----|----------|-------------|--------|--------|--------|------|
| 1 ⁂ | Async races | `fetchTabMetadata` stale-write on SPA nav; `RATINGS_READY`/`OWNERSHIP_UPDATED` applied without page-identity guard | Add generation/identity guard in background + content listener | High | M | Med |
| 2 | Correctness | `findByImdbId` called without `mediaType` in `lookupWithCrossRefs` and `FIND_TMDB_ID` → cross-namespace TMDB ID confusion | Pass the known mediaType through | Med | S | Low |
| 3 | Correctness | Removing the last Plex server leaves the stale library index active (badges keep saying OWNED) | Clear index when server list becomes empty | Med | S | Low |
| 4 | Correctness | Popup setup Save ignores `TEST_CONNECTION` failure; saves broken server with unstable `server-{timestamp}` id | Gate save on test success (mirror options page) | Med | S | Low |
| 5 | Correctness | `tvmaze.content.ts` gap-check fallback passes a TVMaze ID with `source: "tvdb"` | Skip gap check when no TVDB/TMDB id resolved | Med | S | Low |
| 6 | Error handling | `onMessage` switch has no top-level catch and no default — a throw or unknown type leaves `sendResponse` hanging | Wrap switch in try/catch; respond on default | Med | S | Low |
| 7 ⁂ | Graceful degradation | No `AbortController` timeout: `tmdb.ts`, `tvdb.ts`, `tvmaze.ts`, `checkForUpdate`, inline `VALIDATE_TMDB_KEY`, `validateOmdbKey` | Add timeouts tuned per operation (~10 s) | Med | M | Low |
| 8 ⁂ | Async races | Two-CHECK title retries (iPlayer/PSA/Metacritic/RT slug fallback; plex-app movie→show) share the tabMedia last-write-wins race | Assessed: same race class as v1.22 IMDb fix; converge on server-side dual title lookup | Med | M | Med |
| 9 | Performance/caching | Sonarr 7-day proxy cache defeats the 24 h episode-gap TTL for continuing shows | Shorter TTL for continuing shows, or dual TTL | Med | S | Low |
| 10 | Performance/caching | No schema version on library index / proxy / collection caches; only episode cache flushes on update; expired entries never pruned | Add `schemaVersion`, prune-on-write or on-update | Med | M | Low |
| 11 | Docs drift | `CLAUDE.md` says "Read agents.md" — the file does not exist | Remove the line or create the file | Med | S | Low |
| 12 | Docs drift | Spec: plexFetch "3-second timeout" (code is 30 s); `Message` union missing 4 newer types; manifest host list missing plex.tv + api.github.com | Update `docs/Parrot spec.md` | Med | S | Low |
| 13 | Docs drift / feature gap | Custom sites UI stores config nothing consumes; wiki claims custom sites work and "Chrome will prompt for the permission" | Fix wiki wording now; feature itself stays on TODO | Med | S | Low |
| 14 | Duplication | `CHECK_EPISODES` Sonarr and TVDB season-grouping blocks are ~45 duplicated lines each | Extract shared `computeSeasonGaps()` (also unlocks tests, see 17) | Med | M | Med |
| 15 | Async races | Read-modify-write on shared storage keys: collection + episode-gap caches AND the `tabMedia` session mirror (`persistTabMedia`/`removeTabMedia`) — concurrent writes can drop entries | Per-key storage like `pc:*`; serialize session writes | Med | S | Low |
| 16 ⁂ | API contract | Optimistic community-API types: `SonarrShow.episodes`/`.status`, `PlexResource.connections`, `RadarrImage.CoverType` — incl. unguarded `.toLowerCase()` in `bg/metadata.ts` | Make optional + guard; compiler then enforces | Low | S | Low |
| 17 ⁂ | Test gaps | `CHECK`, `CHECK_EPISODES`, `CHECK_COLLECTION` handler logic untested (~600 lines); `tvdb.ts` client (login retry, pagination) untested | Extract pure logic into `bg/`, add handler tests + tvdb client tests | Med | L | Med |
| 18 | Dead code | `clearProxyCache`, `isRadarrCircuitOpen`, `isSonarrCircuitOpen` exported, never called; `SiteDefinition.badgeSelector`/`enabled` never consumed at runtime | Delete or wire up | Low | S | Low |
| 19 | Duplication | `formatTimestamp` duplicated (options vs ui-helpers, divergent >24 h behavior); title merge-and-fallback pattern duplicated across 4 content scripts; `radarrFetch`/`sonarrFetch` near-identical | Consolidate incrementally | Low | M | Low |
| 20 | Naming/consistency | Mixed log tags ("RT"/"RottenTomatoes"); stale "sync function" comment in `check-helpers.ts`; `minOwned` fallback 1 vs default 2; popup rating average uses 2 sources vs badge's 6 | Trivial cleanups | Low | S | Low |
| 21 | MV3 lifecycle | `cachedOpts`/`cachedIndex` not invalidated when `storage.sync`/`local` changes arrive from another synced device | Extend `storage.onChanged` handler | Low | S | Low |
| 22 ⁂ | Manifest | `GET /` server-identity fetch (`testConnection`) isn't matched by the `*/library/*` host permissions — works only via Plex's CORS | Document, or broaden pattern deliberately | Low | S | Med |
| 23 | Tooling | ESLint has no type-aware rules (`no-floating-promises` would catch the fire-and-forget bug class); `scripts/` and root configs excluded from linting | Enable type-checked config; widen `files` | Low | M | Low |
| 24 | Async races | Duplicate in-flight requests not coalesced (proxy cache-miss stampede, per-server plexFetch probes); `setProxyCache` fire-and-forget hides storage failures | In-flight promise map keyed by cache key / server; await cache commits | Low | M | Low |

---

## Detailed Findings

### Async races & message flows

#### 1. `fetchTabMetadata` stale-write race; ratings/ownership messages have no page-identity guard — **High / M**

**Where:**
- `src/entrypoints/background.ts:843-847` — `CHECK` persists `TabMediaInfo` then fires `fetchTabMetadata(tabId, mediaInfo)` fire-and-forget.
- `src/entrypoints/background.ts:617-618` — at the end of enrichment (potentially many seconds later after Radarr → TMDB → OMDb chains), it calls `persistTabMedia(tabId, info)` and `sendRatingsToTab(tabId, info)` **unconditionally**.
- `src/common/badge.ts:453-482` — the content-side listener applies `RATINGS_READY` and `OWNERSHIP_UPDATED` to whatever badge currently exists, with no check that the message refers to the media currently on screen (`OWNERSHIP_UPDATED` even carries `source`/`id`, but the badge update at 462-471 happens before/regardless of the callback).

**Why it matters:** On SPA sites (TMDB, IMDb, Trakt, Plex app — all use `observeUrlChanges`) the user can navigate from *The Copper Meridian* to *Harbor of Glass* while the first page's enrichment is still in flight. When it completes:

1. `persistTabMedia` overwrites the new page's tab entry — the popup dashboard shows *The Copper Meridian*'s poster/ratings while the user is on *Harbor of Glass*.
2. `RATINGS_READY` restyles *Harbor of Glass*'s badge with *The Copper Meridian*'s ratings.
3. The `OWNERSHIP_UPDATED` TMDB re-check flip (background.ts:510-518) can mark the wrong page owned.

This is the same last-write-wins family as the v1.22 IMDb dual-CHECK bug, just across navigations instead of within one page.

**⁂ 2nd-opinion agreement:** Codex independently ranked this #1 ("no request
versioning, so older async enrichment can overwrite newer tab state") and proposed
the same fix shape: a per-tab request version/token with stale completions ignored.

**Suggested fix:** cheap identity guard, no re-architecture needed:
- In `fetchTabMetadata`, before the final `persistTabMedia`/`sendRatingsToTab`/`OWNERSHIP_UPDATED`, re-read `getTabMedia(tabId)` and bail if `(source, id)` no longer match `info`. (A monotonic per-tab generation counter works too and is cheaper than a storage read.)
- Include `source`/`id` on `RATINGS_READY` and have `badge.ts` ignore messages that don't match the media the content script last checked (content script would register its current identity with the badge module).

Interim half-fix: the ownership-flip message already sends `source`/`id`; making `badge.ts:462` verify them would stop the worst symptom.

#### 8. Two-CHECK title retries share the tabMedia race (includes known-deferred plex-app assessment) — **Med / M**

**Where:**
- `src/entrypoints/plex-app.content.ts:71-92` (`checkViaTitle`) — movie CHECK, then show CHECK on miss. *(Known-deferred; assessment requested.)*
- `src/entrypoints/iplayer.content.ts:39-45`, `psa.content.ts:37-44`, `metacritic.content.ts:78-84`, `rottentomatoes.content.ts:80-86` — merged-title CHECK, then slug-title CHECK on miss.

**Assessment for plex-app:** yes, it has the same `tabMediaCache` race that v1.22 fixed for IMDb. Both CHECKs write `tabMedia` and each spawns its own `fetchTabMetadata`; the two enrichment chains race, and the *movie*-typed miss (owned:false, movie metadata) can finish after the *show*-typed hit and overwrite it — the "popup shows Unknown while badge is correct" symptom the v1.22 fix eliminated for IMDb. The same applies to the slug-fallback retries in the other four scripts (second CHECK uses a *different* title key, so its enrichment result is a genuinely different search).

**Severity note:** bounded — the second CHECK only fires when the first returns `owned:false`, and both refer to the same page's media, so the wrong data is usually "less enriched" rather than "different film". Lower urgency than finding 1.

**Suggested fix (matches the v1.22 pattern):** teach `handleCheck` to do the retry server-side. For `source: "title"`, `lookupItem` already widens year-qualified keys; adding (a) an opposite-mediaType retry for ambiguous callers (plex-app) and (b) an alternate-key retry (`altId` on the CHECK message for the slug key) would make all five sites single-CHECK. The finding-1 generation guard also neutralizes this race as a side effect — if finding 1 is implemented first, this one can be downgraded to consistency cleanup.

#### 6. `onMessage` handler: no top-level catch, no default case — **Med / S**

**Where:** `src/entrypoints/background.ts:681-1479`. The async IIFE runs a 20-case switch; the listener always `return true` (keeps the channel open).

**Why it matters:** several handlers have no internal try/catch (`TEST_ALL_SERVERS`, `GET_STATUS`, `CHECK`, `GET_TAB_MEDIA`, `PLEX_LOOKUP`, `SAVE_OPTIONS`…). If any awaited call throws (e.g. `getServers()` rejecting on a transient storage error, or a future refactor introducing a throw in `handleCheck`), `sendResponse` is never called: the content script's `await browser.runtime.sendMessage(...)` rejects with "message port closed" only when the SW eventually unloads — until then it just hangs, and the badge stays in its blank injected state with no error pill. Same for any unknown/future message type (no `default:`).

**Suggested fix:** wrap the switch in try/catch that logs via `errorLog` and calls `sendResponse({ error: String(err) })`; add a `default:` that responds immediately. Cheap, and makes every content-script `catch (err) { showErrorBadge(...) }` path actually reachable for background faults.

**Related (from the second-opinion pass):** the fully-empty catches around the session-cache ops (`background.ts:86,102,115`) and the startup `.catch(() => {})` calls (`:666,675`) should at minimum emit a `debugLog` breadcrumb with context — same "silent catch" class the OMDb bug hid in.

#### 15. Read-modify-write races on shared storage keys (collection, episode-gap, and tabMedia session caches) — **Med / S**

**Where:**
- `src/common/storage.ts:60-65` (`saveCachedCollection`) and `:80-85` (`saveCachedEpisodeGaps`) — `get` whole map → mutate → `set` whole map.
- `src/entrypoints/background.ts:75-115` (`persistTabMedia` / `removeTabMedia` session mirror) — same `get → mutate → set` on the single `tabMedia` session key, flagged by the second-opinion pass (its #2): two tabs' CHECKs completing concurrently can interleave and drop the other tab's entry, which then makes the popup show nothing for that tab until its next CHECK.

**Why it matters:** the 260313 review flagged this exact pattern for the proxy cache and it was fixed by moving to per-key `pc:*` storage — but these three kept the old pattern. The tabMedia case is the hottest path of the three (every CHECK writes it) and interacts with finding 1's stale-write race. The collection/episode drops are harmless (refetched later); severity raised to Med on account of the session store.

**Suggested fix:** per-key storage (`cc:{id}`, `eg:{cacheKey}`, `tm:{tabId}`) like the proxy cache — per-key writes eliminate the read-modify-write window without needing a mutex. Folds neatly into finding 10 (add `schemaVersion`/pruning while touching the format).

#### 24. Duplicate in-flight requests not coalesced; fire-and-forget cache writes — **Low / M**

*(Promoted from out-of-scope: the second-opinion pass ranked this Medium, citing two concrete sites.)*

**Where:**
- `src/api/radarr.ts:114-123` / `src/api/sonarr.ts:105-114` — `cachedRadarrFetch`/`cachedSonarrFetch`: two concurrent cache misses on the same key (e.g. two tabs opening the same title, or CHECK + fetchTabMetadata both wanting `radarr:movie:{id}`) each hit the proxy. `setProxyCache` is also called without `await`, so a storage failure is invisible and the racing callers can double-write.
- `src/api/plex.ts:55-70` — the per-server `lastWorkingUrl` memo is written per successful attempt with no coalescing of concurrent probes; during a home/away flap, N concurrent CHECKs each pay their own timeout-and-fallback walk and thrash the memo.

**Why it matters:** efficiency (duplicate proxy hits) plus a mild correctness edge (hidden storage failures). No user-visible harm observed — hence Low here despite the second opinion's Medium — but it's the same fire-and-forget family that `no-floating-promises` (finding 23) would make visible.

**Suggested fix:** a small in-flight `Map<key, Promise>` in each cached-fetch helper (delete on settle), `await` the cache commit; same pattern per-server in `plexFetch`. Do it opportunistically when those files are next touched for findings 7/9.

---

### Correctness / type safety

#### 2. `findByImdbId` invoked without `mediaType` where the type is known — **Med / S**

**Where:**
- `src/entrypoints/background.ts:329-330` — `lookupWithCrossRefs` TMDB fallback: `const resolver = source === "imdb" ? findByImdbId : findByTvdbId; const tmdbId = await resolver(options.tmdbApiKey, id);` — `mediaType` is a parameter of the enclosing function but not passed.
- `src/entrypoints/background.ts:1290-1291` — `FIND_TMDB_ID` handler: `message.mediaType` exists on the message type (`types.ts:110`) and *is* sent by `gap-checker.ts:124-129` for shows, but the resolver call ignores it.

**Why it matters:** `findByImdbId` without `mediaType` returns `movie_results[0]` preferentially (`tmdb.ts:188`). TMDB movie IDs and TV IDs are **separate numeric namespaces**. Concrete failure: the v1.22 dual-lookup retries a missed movie CHECK as `show`; `lookupWithCrossRefs("show", "imdb", tt…)` falls through TVMaze (it's a movie, 404) to the TMDB fallback, which returns the *movie's* TMDB id, which is then looked up in `shows.byTmdbId` — if the user owns an unrelated show whose TV id collides numerically, CHECK returns a false OWNED with `resolvedMediaType: "show"` and the wrong item's Plex link. In `FIND_TMDB_ID`, a show gap check resolving via IMDb can get a movie id back, and `CHECK_EPISODES` → `getTvShow(movieId)` then 404s (silent "no gaps") or, on collision, computes gaps for the wrong show.

Low probability per lookup, but the inputs are every IMDb-sourced page view, and the fix is one argument.

**Suggested fix:** `resolver(options.tmdbApiKey, id, mediaType === "movie" ? "movie" : "show")` at both sites (findByTvdbId ignores the extra arg — or branch explicitly). `fetchTabMetadata` (background.ts:466) already does this correctly; make the other two match.

#### 3. Deleting the last server leaves the stale library index live — **Med / S**

**Where:** `src/entrypoints/options/main.ts:227-254` (`deleteServer`). When `servers.length > 0` it rebuilds; the `else` branch just shows "All servers removed" and zeroes the *displayed* counts. Neither `storage.local`'s `libraryIndex` nor the background's `cachedIndex` is touched.

**Why it matters:** the user believes Parrot is disconnected, but every CHECK still resolves against the old index — badges keep showing OWNED with Plex deep links to a server that's no longer configured (`resolveItemPlex` returns undefined so links vanish, but `owned: true` remains). The popup shows "0 items" (GET_STATUS reads `index.itemCount` — actually it would show the stale count too, since the index is still loaded). Misleading either way.

**Suggested fix:** in the `else` branch, send `CLEAR_CACHE` (or a narrower new `CLEAR_INDEX` message that removes `libraryIndex` + calls `setIndex(null)` without nuking the update-check and proxy caches — see finding 10's cache-scoping discussion).

#### 4. Popup setup Save ignores connection-test failure — **Med / S**

**Where:** `src/entrypoints/popup/main.ts:84-127`. `saveBtn` runs `TEST_CONNECTION`, then proceeds straight to `saveServers([newServer])` without checking `testResult.success` — unlike the options page (`options/main.ts:277-281`), which returns on failure.

**Why it matters:** with a typo'd URL, `machineIdentifier` is undefined, so the server is saved with the fallback id `server-{Date.now()}` — a non-stable id that (a) can never merge with the real machineIdentifier entry created later from the options page, and (b) produces junk `plexKeys` keys in the index. The subsequent BUILD_INDEX fails with an error toast, but the broken server row persists. Also note `saveServers([newServer])` replaces the whole array — correct today because the setup view only shows when zero servers exist, but a fragile invariant worth a comment.

**Suggested fix:** mirror the options page — bail with feedback when `!testResult.success`; only fall back to a synthetic id when the test succeeded but identity fetch failed (same as options page behavior).

#### 5. TVMaze content script can pass a TVMaze ID as a TVDB source — **Med / S**

**Where:** `src/entrypoints/tvmaze.content.ts:30-36`:

```ts
checkGaps({
  mediaType: "show",
  source: response.item?.tvdbId ? "tvdb" : response.item?.tmdbId ? "tmdb" : "tvdb",
  id: String(response.item?.tvdbId ?? response.item?.tmdbId ?? info.id),
  ...
```

When the owned item carries neither a TVDB nor a TMDB id (possible — the tvmaze CHECK path can match via the IMDb map, `background.ts:206-208`), the fallback sends `source: "tvdb"` with the **TVMaze** numeric id.

**Why it matters:** `CHECK_EPISODES` then looks up `shows.byTvdbId[tvmazeId]`. Usually a miss (silent no-panel — benign), but on numeric collision with a genuinely-owned show's TVDB id it computes an episode-gap panel for an entirely different show (e.g. the panel on *Lanterns of Meridian Bay* lists seasons of *The Quiet Cartographer*).

**Suggested fix:** when the item has neither id, skip `checkGaps` (or resolve via `FIND_TMDB_ID` first). Two-line change.

#### 16. Optimistic community-API types — **Low / S** ⁂

**Where:**
- `src/api/sonarr.ts:60` — `episodes: SonarrEpisode[]` is required on `SonarrShow`, but skyhook **search** results (`/tvdb/search/en/`) omit it. Every call site already guards (`show.episodes?.length` at `bg/metadata.ts:39`, `sonarrShow?.episodes?.length` at `background.ts:1054`) — the guards contradict the type, which is exactly the "optimistic type" pattern that bit `RadarrCollection.Movies`.
- `src/api/plex-tv.ts:31` — `connections: PlexConnection[]` required; `pickRemoteUrl` (`:78`) calls `server.connections.find(...)` unguarded. plex.tv normally always sends the array, but an offline/partial resource entry without it would throw inside `FETCH_REMOTE_URL` (caught, degrades to "Discovery failed" — acceptable, but the type should tell the truth). *(Independently flagged by the second-opinion pass.)*
- **From the second-opinion pass:** `RadarrImage.CoverType` (`radarr.ts:33`) and Sonarr's `coverType` are consumed via unguarded `.toLowerCase()` in `bg/metadata.ts:25` and `:41`, and `SonarrShow.status` (`sonarr.ts:47`) is required-typed. A proxy response with a malformed image entry would throw inside `applyRadarrMetadata`/`applySonarrMetadata` — caught upstream, but it silently kills the whole enrichment (no poster, no ratings) for one bad array element.

**Suggested fix:** `episodes?: SonarrEpisode[]`, `connections?: PlexConnection[]` (+ `?? []` in `pickRemoteUrl`), `CoverType?`/`coverType?` + `typeof === "string"` guard (or `?.toLowerCase()`), `status?`. Compiler will then enforce the guards that today are only by convention.

---

### Graceful degradation (network timeouts)

#### 7. Several clients still have no `AbortController` timeout — **Med / M**

Audit result (checklist item: OMDb history, plexFetch 3 s→30 s history):

| Client | Timeout? | Notes |
|---|---|---|
| `plex.ts` | ✅ 30 s per attempt (`plex.ts:19`) | tuned + commented |
| `radarr.ts` / `sonarr.ts` | ✅ 4 s | |
| `plex-tv.ts` | ✅ 4 s | |
| `omdb.ts getImdbRating` | ✅ 4 s | but `clearTimeout` not in `finally` (`omdb.ts:20-25`) — a rejected fetch leaves the timer to fire a no-op abort; cosmetic |
| **`omdb.ts validateOmdbKey`** | ❌ none (`omdb.ts:39-52`) | options-page button can hang the full browser default (~300 s) |
| **`tmdb.ts tmdbFetch`** | ❌ none (`tmdb.ts:61-70`) | used by CHECK cross-refs, metadata, collections, episode gaps — a hung TMDB response stalls badge enrichment and `CHECK_EPISODES` indefinitely |
| **`tvdb.ts login/tvdbFetch`** | ❌ none (`tvdb.ts:13-66`) | `getSeriesEpisodes` pagination multiplies exposure |
| **`tvmaze.ts` (all 3 fns)** | ❌ none (`tvmaze.ts:16-42`) | sits directly in the CHECK hot path for tvmaze/imdb shows — a hung TVMaze call delays the CHECK **response itself** (badge stuck invisible), not just enrichment |
| **`bg/version.ts checkForUpdate`** | ❌ none (`version.ts:44`) | fire-and-forget, low harm |
| **`background.ts VALIDATE_TMDB_KEY`** | ❌ none (`background.ts:869`) | also: inline fetch in background.ts instead of a `tmdb.ts` `validateTmdbKey()` — inconsistent with TVDB/OMDb validators |

**Concrete failure:** TVMaze has had multi-minute brownouts; during one, every show CHECK from tvmaze.com and every IMDb show cross-ref waits on a dead socket — the badge never appears and the user assumes Parrot is broken, when a 10 s abort would have fallen through to the next cross-ref or "not owned".

**Suggested fix:** small shared helper `fetchWithTimeout(url, init, ms)` (or reuse the radarr/sonarr pattern); ~10 s for TMDB/TVDB/TVMaze (they're fast when healthy but sit on interactive paths), 10 s for validators, anything for the update check. Move the TMDB key validation into `tmdb.ts` while touching it.

---

### Performance & caching

#### 9. Sonarr 7-day lookup cache defeats the 24 h episode-gap TTL — **Med / S**

**Where:** `src/api/sonarr.ts:102` (`LOOKUP_TTL = 7 days` on `getSonarrShow`) vs `src/common/storage.ts:12` (`EPISODE_GAP_TTL_MS = 24 h`).

**Why it matters:** the 24 h gap TTL exists so continuing shows pick up newly-aired episodes daily. But when the gap cache expires, `CHECK_EPISODES` recomputes from `getSonarrShow(...)` — which serves the **same 7-day-old episode list** from the proxy cache. Net effect: for a weekly show like *The Ninth Meridian*, the badge can show "Complete" for up to 7 days after a new episode airs even though Plex is missing it. The Plex side (`fetchShowEpisodes`) is always fresh, so the asymmetry only ever hides gaps, never invents them.

**Suggested fix:** either (a) drop `LOOKUP_TTL` for `sonarr:show:*` to 24 h (episode lists are the payload; metadata staleness is harmless), or (b) keep 7 d for ended shows and 24 h when `show.status` is continuing — matching the "tiered TTL" idea already in TODO.md's Ideas section.

#### 10. Cache/version hygiene: no schema versioning, uneven flush-on-update, no pruning — **Med / M**

**Where:** `src/common/storage.ts` (all caches), `src/entrypoints/background.ts:671-679` (`onInstalled`).

Current state per store:

| Store | Flushed on extension update? | Expired entries pruned? | Schema version? |
|---|---|---|---|
| `libraryIndex` | no | n/a | **no** |
| `episodeGaps` | **yes** (`clearEpisodeGapCache`) | no (only skipped on read) | no |
| `tmdbCollections` (30 d TTL) | no | **never** — expired entries live forever | no |
| `pc:*` proxy cache | no | **never** | no |
| `updateCheck` | no | n/a | no |

**Why it matters (two distinct risks):**
1. *Stale entries masking parsing changes* — the episode cache is flushed on update precisely because cached results bake in old logic; but `tmdbCollections` bakes in parsed shapes too, and `libraryIndex` bakes in `buildTitleKey`/`parseTitleFromH1` normalization. When v1.x changes title normalization (it has, historically), existing users keep matching against keys built by the old algorithm for up to 7 days (until auto-refresh) with no signal. A `schemaVersion` field on `LibraryIndex`, checked in `loadIndex()`, would force a rebuild exactly when the code that builds it changes.
2. *Unbounded growth* — expired collection/proxy entries are skipped on read but never removed; a heavy browser (many titles viewed) accumulates them indefinitely. `unlimitedStorage` means no hard failure, but `CLEAR_CACHE`'s `storage.local.clear()` being the only cleanup is blunt (it also nukes `updateCheck`, un-earning the "!" badge state).

**Suggested fix:** (a) add `schemaVersion` constants to `LibraryIndex` and the collection cache, rebuild/ignore on mismatch; (b) in `onInstalled(update)`, clear `pc:*` and `tmdbCollections` alongside `episodeGaps` — they're cheap to refill and this makes "which caches flush on update" a one-word answer: all; (c) opportunistic prune of expired keys during `setProxyCache`/`saveCachedCollection` or on update.

#### 21. Background caches not invalidated on cross-device sync changes — **Low / S**

**Where:** `src/entrypoints/background.ts:1488-1492` — `storage.onChanged` invalidates `cachedServers` on `plexServers` changes, but not `cachedOpts` on `parrotOptions` changes (covered only via the `SAVE_OPTIONS` message, i.e. same-device saves) and not `cachedIndex`/`cachedServers` local edits from another profile.

**Why it matters:** options changed on machine A propagate via `storage.sync` to machine B, whose long-lived service worker keeps serving stale options (e.g. `useCommunityProxies` toggled off, keys added) until it happens to unload. Self-heals within ~30 s of SW idle, so Low.

**Suggested fix:** add `if (areaName === "sync" && changes.parrotOptions) cachedOpts = null;` to the existing listener.

---

### Duplication

#### 14. `CHECK_EPISODES` Sonarr and TVDB grouping blocks are near-clones — **Med / M**

**Where:** `src/entrypoints/background.ts:1055-1099` (Sonarr) vs `:1103-1148` (TVDB). Both do: filter specials → filter future-unowned → group by season → count owned vs missing → build `SeasonGapInfo[]`. The only deltas are field names (`episodeNumber`/`title`/`airDate` vs `number`/`name`/`aired`).

**Why it matters:** any gap-logic change (e.g. the `excludeFuture` boundary semantics, which use `>= today` here but `< today` in the TMDB block at :1180-1185 — note the TMDB filter keeps episodes airing *today* out while the other two keep them **in**; subtle three-way inconsistency) must be made twice-or-thrice and can drift. It's also the single biggest obstacle to testing this 300-line handler (finding 17).

**Suggested fix:** extract `computeSeasonGaps(episodes: {season, episode, name?, airDate?}[], ownedSet, opts): SeasonGapInfo[]` into `src/entrypoints/bg/` with two thin adapters mapping Sonarr/TVDB/TMDB shapes. Resolve the aired-today boundary deliberately while unifying.

#### 19. Smaller duplications — **Low / M**

- **`formatTimestamp`** — `options/main.ts:124-131` re-implements `ui-helpers.ts:23-30` with divergent >24 h behavior (`toLocaleDateString()` vs `"3d ago"`). The popup imports the shared one; options doesn't, despite importing three sibling helpers from the same module on line 2. Pick one behavior (the options variant is arguably better for "last sync") and share it.
- **Title merge-and-fallback pattern** — `iplayer.content.ts:26-45`, `psa.content.ts:24-44`, `metacritic.content.ts:63-96`, `rottentomatoes.content.ts:65-98` each hand-roll: parse slug + parse h1 → prefer h1 → CHECK → retry slug title on miss. ~40 lines × 4, and any fix (e.g. finding 8's single-CHECK conversion) must touch all four. Extract `titleCheckWithSlugFallback(mediaType, slug, h1Text)` into `title-check.ts`.
- **`radarrFetch`/`sonarrFetch` + `cachedRadarrFetch`/`cachedSonarrFetch`** — byte-identical apart from base URL/log tag (`radarr.ts:76-124`, `sonarr.ts:67-115`). A `createProxyClient(baseUrl, tag)` factory would halve both files. Low urgency; do it if either file is touched for finding 7/9.

---

### Dead code

#### 18. Unused exports and inert config fields — **Low / S**

- `clearProxyCache` (`src/common/storage.ts:134-138`) — never called anywhere (CLEAR_CACHE uses `storage.local.clear()` wholesale). Either use it for the scoped clearing suggested in findings 3/10, or delete.
- `isRadarrCircuitOpen` (`radarr.ts:154`), `isSonarrCircuitOpen` (`sonarr.ts:130`) — exported, zero call sites (including tests).
- `SiteDefinition.badgeSelector` and `.enabled` (`types.ts:272-274`) — populated for all 16 `DEFAULT_SITES` and for user-created custom sites, but **no runtime code reads either field**; each content script hardcodes its own selectors, and there is no per-site enable/disable. The fields imply capabilities that don't exist (see finding 13). Keep only if the TODO "Universal content script" lands; otherwise trim to what the options table actually renders.

---

### Test gaps

#### 17. Background handler logic untested; `tvdb.ts` client untested — **Med / L**

**Where/assessment (requested by checklist item 9):** `background.ts` is 1,493 lines; `bg/` extraction so far covers `library.ts`, `metadata.ts`, `version.ts` (all tested — good progress since the 260313 review). What remains untested and is *worth* extracting, in value order:

1. **Season-gap computation** (background.ts:1043-1220) — pure once `ownedSet` + episode list are inputs; extraction is finding 14. Highest bug density in the file (three near-duplicate blocks, boundary conditions on specials/future episodes/season 0).
2. **`handleCheck` + `lookupWithCrossRefs`** (background.ts:190-341) — the core product decision path (which index map, which cross-ref, IMDb dual-lookup, `resolvedMediaType`). Testable today by injecting a fake `LibraryIndex` and mocking the api modules; would have caught finding 2 mechanically. Move to `bg/check.ts` taking `{index, options, resolvers}`.
3. **Collection filtering** (background.ts:1406-1455) — `excludeFuture`/`minCollectionSize`/`minOwned` logic; pure given `collParts` + index.
4. **`fetchTabMetadata` orchestration** — hardest (side-effectful, messaging); only worth handler-level tests after the generation guard from finding 1 exists, since that's the behavior most needing regression protection.

**Not** worth extracting: the thin validator/status/storage-usage handlers — they're glue.

Separately: `src/api/tvdb.ts` is the **only API client with no test file** (`tests/api-{omdb,plex-tv,radarr,sonarr,tmdb,tvmaze}.test.ts` all exist). Its two riskiest behaviors — 401 → re-login → retry (`tvdb.ts:51-59`, including the module-level `cachedToken` state) and the 500-per-page pagination loop termination (`tvdb.ts:90-112`) — are exactly the kind of thing that regresses silently. Small, mock-fetch tests in the established style would close it.

---

### Documentation drift

#### 11. `CLAUDE.md` line 3: "Read agents.md" — file does not exist — **Med / S**

**Where:** `D:\Dev\Parrot\CLAUDE.md:3`; repo root contains only `CLAUDE.md` and `README.md` (verified case-insensitively, full tree). Every agent session starts by chasing a dead reference; if agents.md was meant to carry instructions, they're silently absent. Remove the line or restore the file.

#### 12. `docs/Parrot spec.md` stale on three points — **Med / S**

- **Line 284:** "Each attempt has a 3-second timeout" — code is 30 s (`plex.ts:19`, deliberately retuned with an explanatory comment). The spec describes the *old, known-wrong* value.
- **Message Protocol block (~line 240):** missing `UPDATE_ICON`, `PLEX_LOOKUP`, `FETCH_REMOTE_URL`, and `CHECK_FOR_UPDATE`, and shows `FIND_TMDB_ID` without its `mediaType` field — 4 of 20 message types absent vs `types.ts:91-116`.
- **Manifest section (~line 710):** `host_permissions` list omits `https://plex.tv/*` and `https://api.github.com/*`, both present in `wxt.config.ts` and both load-bearing (remote-URL discovery, update check).

#### 13. Wiki oversells custom sites — **Med / S**

**Where:** `docs/wiki/Supported-Sites.md:64-74` — "Custom sites use the link-scan strategy by default… adding a custom site requires the extension to have permission for that host. Chrome will prompt for the permission when you save." Also `docs/wiki/Configuration.md:77`, `docs/Parrot spec.md:697-698`.

**Reality:** custom sites are stored in `browser.storage.sync` and rendered in the options table (`options/main.ts:680-728`), and **nothing else consumes them** — no dynamic `scripting.registerContentScripts`, no `permissions.request` (grep-verified: zero hits in `src/`), no universal content script. Saving a custom site has no effect on any page, and no permission prompt ever appears. The implementation gap itself is *known and tracked* (TODO.md → "User-Configurable Sites (advanced)") — the finding here is that user-facing docs describe the unbuilt feature as working. Fix the wiki/spec wording now ("planned"), independent of when the feature lands. Consider hiding or labeling the "Add site" button until then.

---

### Naming & consistency

#### 20. Assorted small inconsistencies — **Low / S**

- `rottentomatoes.content.ts` logs as `"RT"` (`:19,34,46,…`) but errors as `"RottenTomatoes"` (`:59,102`) — grepping a debug session by site tag misses half the lines.
- `check-helpers.ts:26-27` comment: "Kept as a sync function … but the signature stays Promise-returning" — the function is literally declared `async` (`:29`); the comment describes an intermediate state that no longer exists. Also `_id` param is now unused.
- `options/main.ts:109`: `minOwned: Math.max(1, parseInt(...) || 1)` — the empty-input fallback is 1 while `DEFAULT_OPTIONS.minOwned` is 2 (`types.ts:82`) and the spec says "default: 2, min: 1". Clearing the field silently sets a different value than the documented default. Use `|| DEFAULT_OPTIONS.minOwned`.
- Popup average rating uses TMDB+IMDb only (`popup/main.ts:248-250`) while the badge averages all six sources (`badge.ts:92-104`) — the same title shows two different numbers in badge vs popup. If deliberate (popup lacks RT/MC/Trakt/TVDB fields? it doesn't — `TabMediaInfo` carries all six), align them or comment why.
- `letterboxd.content.ts:10` and `tvdb-movies.content.ts:11` include `"tvmaze"` in their scan sources on movie-only pages, then send `mediaType: "movie"` with `source: "tvmaze"` — a combination the background treats as show-only (`background.ts:197`). Harmless miss today; drop `tvmaze` from those two scanner lists.

---

### Manifest & permissions

#### 22. `GET /` identity fetch isn't covered by the `*/library/*` host permissions — **Low / S (risk Med if "fixed" carelessly)**

**Where:** `plex.ts:129` (`plexFetch(config, "/")` in `testConnection`) vs `wxt.config.ts` host permissions `http://*/library/*`, `https://*/library/*`. Every other Plex path starts with `/library/`; the identity call does not match any granted origin pattern, so it runs as a plain cross-origin fetch relying on the Plex server's CORS handling (Plex does send permissive CORS headers, which is why deep-linking works in practice).

**Why it matters:** it works, but by accident of Plex's CORS posture, not by grant — a Plex hardening release or a reverse-proxy that strips CORS headers would break machineIdentifier/friendlyName discovery (symptom: servers save with `server-{timestamp}` ids and no deep links) while all other calls keep working; that's a confusing partial failure. The counterpoint: broadening to `http://*/*` is a big permission-warning regression for users — **not** recommended. Options: (a) leave as-is but document the CORS dependency in the spec next to the endpoint table; (b) use `/identity` — no, same path problem; (c) narrow real fix isn't available with wildcard hosts, so (a) is likely the right call, consciously.

---

### Tooling

#### 23. Lint coverage and rule depth — **Low / M**

**Where:** `eslint.config.js` — `files: ["src/**/*.ts", "tests/**/*.ts"]` with plain `tseslint.configs.recommended` (non-type-aware).

- The fire-and-forget/unawaited-promise bug class (findings 1, 8; also `persistTabMedia` called unawaited at `background.ts:534,617` and `setProxyCache` at `radarr.ts:122`) is exactly what `@typescript-eslint/no-floating-promises` flags — but it needs the type-checked config (`recommendedTypeChecked` + `parserOptions.projectService`). Given how many real bugs here were of this class, this is cheap insurance; expect an initial wave of findings to triage (some intentional fire-and-forgets will need `void` operators — that's the point: they become visible and deliberate).
- `scripts/*.js`, `wxt.config.ts`, `vitest.config.ts`, `eslint.config.js` itself are outside the lint globs entirely.
- Minor: `scripts/sync-wiki.js:74-76` interpolates the commit message into a shell string with only `"`-escaping; a message containing `%CD%`-style cmd expansions or backslash-trailing quotes could misfire. It's a local dev script, so just use `execFileSync("git", ["commit", "-m", commitMessage], …)` when next touched.

---

## Out of scope / TODO candidates

Items observed during review that belong on the roadmap rather than in this review's fix list:

- **Universal custom-site content script + per-site permissions** — already in TODO.md; finding 13 only covers the doc wording. When built, it should consume `badgeSelector`/`enabled` (finding 18).
- **Tiered cache TTLs (ended vs continuing shows)** — already in TODO.md "Ideas"; finding 9 is the minimal version of it.
- **Negative-result caching for community proxies** — misses (404s) are refetched on every page view of an unmatched title; a short-TTL negative cache would cut proxy load. Weigh against masking newly-added titles.
- **Popup/options server-save flow consolidation** — after finding 4, the two flows are near-identical and could share a helper module.
- **Plex API pagination for 10k+ libraries** and **new JWT auth flow** — already in TODO.md.
- **Per-site enable/disable toggle** — already in TODO.md "Advanced Settings"; would give `SiteDefinition.enabled` a purpose.
- **`errorLog` gated by `debugLogging`** — current design means production errors are invisible unless the user pre-enables debug logging. Deliberate (zero console noise), but consider a ring buffer in `storage.session` surfaced on the options page so "it doesn't work" reports come with evidence. Listed here because changing it is a product decision, not a bug fix.

---

*Prepared 2026-07-09 (internal pass + Codex second opinion merged same day). Line numbers refer to the working tree at v1.23.0 (commit c03ea4e).*
