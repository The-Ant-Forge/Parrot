# Parrot — TODO

Forward-looking roadmap. See [`Completed.md`](Completed.md) for everything already shipped.

---

## Future Enhancements

### User-Configurable Sites (advanced)
- [ ] Universal content script with dynamic registration (`browser.scripting.registerContentScripts`)
- [ ] Per-site permission request (`browser.permissions.request`)

### Polish & Reliability (remaining)

**Error Handling**
- [ ] Graceful handling of Plex server going offline mid-session
- [ ] Retry logic for transient network failures during index build

**Performance**
- [ ] Measure index build time for large libraries (1000+ items)

### Code Hygiene

- [ ] Add unit tests for `gap-checker.ts` (needs browser.runtime mocking)
- [ ] Add unit tests for `url-observer.ts` (needs MutationObserver mocking)

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
