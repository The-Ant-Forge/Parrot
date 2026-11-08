# Parrot — TODO

Forward-looking roadmap. Shipped work is recorded in the [GitHub release notes](https://github.com/The-Ant-Forge/Parrot/releases).

---

## Future Enhancements

### User-Configurable Sites (advanced)
- [ ] Universal content script with dynamic registration (`browser.scripting.registerContentScripts`)
- [ ] Per-site permission request (`browser.permissions.request`)

### Episode Gap Checking

- [ ] Configurable aired-episode grace period — replace the implicit "aired today or later doesn't count as missing" boundary (`excludeFuture` in `season-gaps.ts`) with a user-set "don't count episodes aired in the last N days" option. Today the only knobs are the excludeFuture on/off toggle plus 24h caches (`eg:*`, Sonarr fresh TTL).
- [ ] Options label "Exclude future/unreleased movies" is misleading — it also governs TV episodes (`excludeFuture` gates both `collection.ts` and `season-gaps.ts`). Reword.

### Code Hygiene

- [ ] Adopt `noUncheckedIndexedAccess` — wxt 0.21's generated tsconfig enables it; we override it to `false` in the root `tsconfig.json` because turning it on surfaces ~200 `T | undefined` errors across src + tests. Worth adopting incrementally: it catches exactly the "index into a map/array and trust the result" bug class.
- [ ] Add unit tests for `gap-checker.ts` (needs browser.runtime mocking)
- [ ] Add unit tests for `url-observer.ts` (needs MutationObserver mocking)
- [ ] `prettier --check .` reports style issues in 100 files, and has for a
  while: the same 100 files are flagged by prettier 3.9.6 and 3.9.9 alike, so
  this is accumulated drift, not a formatter change. `npm run format` fixes it
  but produces a 100-file diff, so it wants a commit of its own rather than a
  ride-along on unrelated work. Consider adding a `format:check` script so it
  cannot silently regrow.

**Dependency majors**
- [ ] `typescript` 6.0 -> 7 - **blocked upstream**: typescript-eslint 8.72.1 (latest as of 2026-11-08) still peers on `typescript >=4.8.4 <6.1.0`, and there is no v9 line yet. On 6.0.3 (the newest in range) since 2026-11-08, with no deprecation warnings, so 7 should be a version bump once typescript-eslint supports it.
- [ ] Remove the `trustPolicyExclude` entry for `@webext-core/isolated-element@1.1.5` from `pnpm-workspace.yaml` once wxt moves past it (it pulls the 1.x line).

---

## Additional Sites

- [ ] TV Time (`tvtime.com/show/*`)
- [ ] Simkl (`simkl.com/movies/*`, `simkl.com/tv/*`)

---

## Advanced Settings

- [ ] Configurable badge position (before/after title)
- [ ] Toggle per-site enablement
- [ ] Show/hide "not owned" badge (default: hidden)
- [ ] Dark/light badge theme override

**Integration with ComPlexionist**
- [ ] Shared ignore lists (if user ignores a show in desktop app, respect in extension)
- [ ] Link to ComPlexionist from extension popup

---

## Publishing

**Chrome Web Store**
- [ ] Store listing assets (screenshots, icon, description)
- [ ] Privacy policy (extension accesses local Plex server only)
- [ ] Submit for review

**Firefox Add-ons**
- [ ] Firefox-specific testing
- [ ] Submit to AMO

**CI/CD**
- [ ] GitHub Actions workflow for extension builds
- [ ] Auto-zip on tag push
- [ ] Automated version bumping in CI

---

## Plex API Modernisation

Plex officially published OpenAPI docs (Sep 2025) and introduced a new auth flow:

- [ ] **New auth flow** — device key registration → JWT → `X-Plex-Token` exchange with 7-day refresh. Current direct-token approach still works but doesn't handle token expiry gracefully.
- [ ] **Pagination for large libraries** — `X-Plex-Container-Start` / `X-Plex-Container-Size` headers. Current index builder fetches everything in one shot which may timeout on very large libraries (10k+ items).
- [ ] **Review official API docs** ([developer.plex.tv](https://developer.plex.tv)) for any new endpoints or fields we could leverage (e.g. better resolution/codec metadata).

Reference: [Plex Pro Week '25 blog post](https://www.plex.tv/blog/plex-pro-week-25-api-unlocked/)

---

## Ideas

- Episode-level matching on episode-specific pages (e.g. TMDB `/tv/{id}/season/{n}/episode/{n}`)
- Tiered cache TTL (ended shows = longer cache, continuing shows = shorter)
- Cross-reference with ComPlexionist collection gap data

---

## Closed Without Action

Recorded so consolidation reviews don't keep re-adding them. Reopen if a real report justifies it.

- **Retry logic for transient network failures during index build** (open since Phase 9) - the failure mode that actually bit us was a moved server, now handled by `bg/self-heal.ts` plus `lastRefreshError` surfacing. No evidence of plain transient failures.
- **Measure index build time for large libraries (1000+ items)** (open since Phase 9) - no success criterion and no complaint driving it. If large-library work ever happens, do it alongside "Pagination for large libraries" under Plex API Modernisation.
