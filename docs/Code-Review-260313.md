# Code Review — 2026-03-13

**Scope:** Full codebase review post-v1.16 release (community proxy integration, resolution display, title-matching fixes).
**Reviewers:** Claude (internal 28-finding review) + OpenAI Codex (GPT-5.3, 9-finding second opinion).

---

## Summary Table

| # | Category | Finding | Impact | Effort | Agreed |
|---|----------|---------|--------|--------|--------|
| 1 | **Bug** | Missing `host_permissions` for Radarr/Sonarr proxy domains | **CRITICAL** | Trivial | Both |
| 2 | **Feature gap** | `CHECK_COLLECTION` doesn't use Radarr proxy (breaks zero-config) | High | Medium | Both |
| 3 | **Bug** | Zero-value ratings silently dropped by truthy checks | Medium | Trivial | Both |
| 4 | **Test gap** | No tests for `background.ts` message handlers | High | Large | Both |
| 5 | **Resilience** | Proxy cache read-modify-write race condition | Medium | Medium | Codex |
| 6 | **Browser compat** | `OffscreenCanvas` breaks Firefox (no fallback) | High | Medium | Both |
| 7 | **Performance** | Episode gap fetches are serial across servers | Medium | Small | Both |
| 8 | **Performance** | `getOptions()` called on every CHECK via `loadIndex()` | Medium | Small | Internal |
| 9 | **Architecture** | `background.ts` monolith (1500+ lines) | Medium | Large | Both |
| 10 | **Correctness** | UTC date filtering can be off by 1 day | Low | Trivial | Codex |
| 11 | **Accessibility** | Gap panel toggle lacks ARIA attributes | Low | Small | Internal |

---

## Detailed Findings

### 1. CRITICAL — Missing `host_permissions` for community proxy domains

**Both reviewers flagged this as #1 priority.**

`wxt.config.ts:13` lists `host_permissions` but does not include `https://api.radarr.video/*` or `https://skyhook.sonarr.tv/*`. In Manifest V3, service worker `fetch()` to unlisted origins may be silently blocked or trigger CORS errors depending on the browser.

**Evidence:** `wxt.config.ts:13-21`, `src/api/radarr.ts:12` (`BASE_URL`), `src/api/sonarr.ts:12` (`BASE_URL`).

**Fix:** Add two entries to `host_permissions` array.

**Risk:** Without this, the entire community proxy feature may silently fail in production Chrome, falling back to user API keys (or nothing if none configured). This is the most impactful bug — it undermines the zero-config value proposition.

**Note:** In local dev/testing with `wxt dev`, Chrome may be more permissive. The issue manifests in the packed extension.

---

### 2. HIGH — Collection gap check doesn't use Radarr proxy

`CHECK_COLLECTION` handler (background.ts ~line 1410) exits early if `tmdbApiKey` is empty. The Radarr API has `getRadarrCollection()` which returns collection data with all movies — this should be tried first, falling back to TMDB only when the proxy fails.

**Evidence:** `src/entrypoints/background.ts` CHECK_COLLECTION handler, `src/api/radarr.ts:138` (`getRadarrCollection`).

**Fix:** Mirror the pattern used in `fetchTabMetadata` — try Radarr collection first, fall back to TMDB.

---

### 3. MEDIUM — Zero-value ratings silently dropped

`applyRadarrRatings()` at `background.ts:464` uses `if (ratings.Tmdb?.Value)` — this is a truthy check that drops `0`. Similarly, `badge.ts:95-100` (`getRatingText()`) uses `currentRatings.tmdbRating && currentRatings.tmdbRating > 0`.

A rating value of `0` is rare but valid (e.g. a new movie with zero votes on a platform). The badge code is actually fine since `> 0` is explicit, but the Radarr extraction would skip it.

**Fix:** Change to `if (ratings.Tmdb?.Value != null)` or `!== undefined` in `applyRadarrRatings`.

**Impact:** Low in practice (0-rated movies are uncommon), but the fix is trivial.

---

### 4. HIGH — No tests for background.ts message handlers

Both reviewers identified that `background.ts` (~1500 lines) has zero test coverage. The proxy integration/fallback chains, episode gap detection, collection checks, and ownership rechecks are all untested at the integration level.

**Current coverage:** API clients (radarr, sonarr, plex), utilities (badge, extractors, normalize, panel-utils), but not the orchestration layer.

**Approach:** Extract pure logic into testable modules first (Finding #9), then add handler-level tests. Priority paths:
- CHECK handler with proxy fallback chain
- CHECK_EPISODES with Sonarr path
- CHECK_COLLECTION with Radarr path
- RATINGS_READY delivery

**Effort:** Large — this is a structural effort best done alongside Finding #9.

---

### 5. MEDIUM — Proxy cache read-modify-write race condition

`setProxyCache()` in `storage.ts:130-135` does a read-modify-write on a single `proxyCache` object. If two concurrent proxy responses arrive (e.g. Radarr movie lookup + Radarr collection lookup), one write can overwrite the other's entry.

**Mitigation:** In practice, the service worker is single-threaded and most awaits are sequential, so actual data loss is unlikely. However, `Promise.all` patterns or fire-and-forget calls could trigger this.

**Fix options:**
1. Use per-key storage keys instead of a shared object (simplest, eliminates the problem)
2. Add a write queue/mutex
3. Accept the risk (low probability in current code)

**Recommendation:** Option 1 — switch to per-key storage. This also improves cache eviction granularity.

---

### 6. HIGH — `OffscreenCanvas` breaks Firefox

`drawIcon()` at `background.ts:409` uses `new OffscreenCanvas()`. Firefox's MV3 service workers have limited `OffscreenCanvas` support. The `catch` around `setTabIcon()` prevents crashes but means Firefox users never see dynamic toolbar icons.

**Fix options:**
1. Fall back to static icon PNGs pre-rendered at build time (most compatible)
2. Use the `chrome.offscreen` API to create an offscreen document for canvas rendering
3. Detect Firefox and skip dynamic icons

**Recommendation:** Pre-rendered static PNGs for the 3 states (owned/not-owned/inactive) at each required size. This eliminates the canvas dependency entirely and works everywhere.

---

### 7. MEDIUM — Episode gap fetches are serial across servers

`background.ts:1076` loops servers sequentially with `await fetchShowEpisodes(server, plexKey)`. For users with 2-3 Plex servers, this multiplies latency.

**Fix:** `Promise.allSettled()` to fetch from all servers in parallel.

```typescript
const results = await Promise.allSettled(
  servers.filter(s => ownedShow.plexKeys[s.id])
    .map(s => fetchShowEpisodes(s, ownedShow.plexKeys[s.id]))
);
```

---

### 8. MEDIUM — `getOptions()` called on every CHECK

`loadIndex()` calls `getOptions()` (storage read) on every content script CHECK. The options rarely change.

**Fix:** Cache options in a module-level variable, refresh on `SAVE_OPTIONS` message. Already partially done for servers; extend the pattern.

---

### 9. MEDIUM (structural) — background.ts monolith

At ~1500 lines, `background.ts` handles: message routing, library index management, Plex API orchestration, metadata enrichment, icon rendering, tab state, and gap detection. This makes it hard to test and prone to regressions.

**Proposed decomposition:**
- `src/entrypoints/bg/message-router.ts` — switch dispatch
- `src/entrypoints/bg/metadata-enricher.ts` — `fetchTabMetadata`, rating extraction
- `src/entrypoints/bg/gap-detection.ts` — episode + collection gap handlers
- `src/entrypoints/bg/icon-renderer.ts` — `drawIcon`, `setTabIcon`
- `src/entrypoints/bg/index-manager.ts` — `loadIndex`, `buildAndSave`

**Effort:** Large. Best done incrementally — extract one module at a time with tests.

---

### 10. LOW — UTC date filtering can be off by 1 day

`new Date().toISOString().split("T")[0]` returns UTC date. A user browsing at 11pm EST would get tomorrow's UTC date, potentially including an episode that hasn't aired locally yet (or excluding one that just did).

**Impact:** Edge case — affects episode filtering near midnight UTC. The worst case is showing one extra/fewer "upcoming" episode.

**Fix (if desired):** Use local date: `new Date().toLocaleDateString('en-CA')` (returns YYYY-MM-DD format).

---

### 11. LOW — Gap panel toggle lacks ARIA attributes

The gap panel toggle button is a `<span>` with a click handler but no `role="button"`, `tabindex`, or `aria-expanded` attributes. Screen readers won't identify it as interactive.

**Fix:** Add `role="button"`, `tabindex="0"`, `aria-expanded`, and keyboard handler (Enter/Space).

---

## Proposed Action Plan

### Phase 1 — Quick Wins (can do now)

| # | Action | Effort |
|---|--------|--------|
| 1 | Add `host_permissions` for Radarr + Sonarr | 5 min |
| 3 | Fix truthy check in `applyRadarrRatings` | 5 min |
| 10 | UTC → local date | 5 min |
| 11 | ARIA on gap toggle | 15 min |
| 8 | Cache options in background.ts | 20 min |

### Phase 2 — Medium Effort

| # | Action | Effort |
|---|--------|--------|
| 2 | Radarr collection path in CHECK_COLLECTION | 1-2 hrs |
| 6 | Static icon PNGs replacing OffscreenCanvas | 1-2 hrs |
| 7 | Parallel server fetches | 30 min |
| 5 | Per-key proxy cache storage | 1 hr |

### Phase 3 — Structural

| # | Action | Effort |
|---|--------|--------|
| 9 | Decompose background.ts | 4-6 hrs |
| 4 | Background handler tests | 4-6 hrs (best after #9) |

---

## Codex-Only Findings (noted but deferred)

- **Date filtering (Finding 6/10):** Both reviewers mentioned this. Impact is very low — accepted as known limitation.
- **Cache race (Finding 5):** Codex flagged this. Real-world risk is low in single-threaded service worker, but per-key storage is a cleaner design.

## Internal-Only Findings (deferred)

These were in the internal 28-finding review but not prioritized for immediate action:
- Content script `$(selector)` patterns could benefit from null checks
- Some content scripts have similar boilerplate (already consolidated in v1.15)
- Episode panel overflow handling on very long season lists
