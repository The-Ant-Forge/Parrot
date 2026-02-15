# Parrot — TODO

Forward-looking roadmap. See [`Completed.md`](Completed.md) for everything already shipped.

---

## Polish & Reliability

**Test Coverage**
- [ ] Unit tests for ID extraction (each content script)
- [ ] Unit tests for `buildLibraryIndex` and GUID extraction
- [ ] Unit tests for title normalization and slug parsing
- [ ] Unit tests for badge component
- [ ] Integration test for message flow (content script -> background -> response)

**Error Handling**
- [ ] Badge tooltip on error (show why check failed)
- [ ] Graceful handling of Plex server going offline mid-session
- [ ] Retry logic for transient network failures during index build
- [ ] Handle `storage.local` quota exceeded (large libraries)

**Performance**
- [ ] Measure index build time for large libraries (1000+ items)
- [ ] Lazy index loading (don't load full index into memory on startup)
- [ ] Debounce MutationObserver callbacks (avoid rapid re-checks on SPA navigation)

---

## Additional Sites

- [ ] Letterboxd (`letterboxd.com/film/{slug}`)
- [ ] Trakt (`trakt.tv/movies/{slug}`, `trakt.tv/shows/{slug}`)
- [ ] JustWatch (`justwatch.com/{locale}/movie/{slug}`)
- [ ] Rotten Tomatoes (`rottentomatoes.com/m/{slug}`)

---

## Multi-Server & Advanced Settings

**Multi-Server Support**
- [ ] Allow multiple Plex server configurations
- [ ] Merge indexes from multiple servers
- [ ] Per-server sync status in popup

**Advanced Settings**
- [ ] Configurable badge position (before/after title)
- [ ] Toggle per-site enablement
- [ ] Custom refresh interval (default 24h)
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

## Ideas

- Episode-level matching on episode-specific pages (e.g. TMDB `/tv/{id}/season/{n}/episode/{n}`)
- Tiered cache TTL (ended shows = longer cache, continuing shows = shorter)
- Badge variant for partial ownership ("Partial" vs "Owned")
- Cross-reference with ComPlexionist collection gap data
