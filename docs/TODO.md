# Parrot — TODO

Forward-looking roadmap. See [`Completed.md`](Completed.md) for everything already shipped.

---

## Future Enhancements

### User-Configurable Sites (advanced)
- [x] Custom site CRUD in options page (add/remove/reset)
- [ ] Universal content script with dynamic registration (`browser.scripting.registerContentScripts`)
- [ ] Per-site permission request (`browser.permissions.request`)

### Polish & Reliability (remaining)

> Spec: [`Phase 9 - Consolidation Polish and Reliability.md`](Phase%209%20-%20Consolidation%20Polish%20and%20Reliability.md)

**Error Handling**
- [ ] Graceful handling of Plex server going offline mid-session
- [ ] Retry logic for transient network failures during index build

**Performance**
- [ ] Measure index build time for large libraries (1000+ items)

---

## Additional Sites

- [x] Letterboxd (`letterboxd.com/film/{slug}`)
- [x] Trakt (`trakt.tv/movies/{slug}`, `trakt.tv/shows/{slug}`)
- [x] JustWatch (`justwatch.com/{locale}/movie/{slug}`)
- [x] Rotten Tomatoes (`rottentomatoes.com/m/{slug}`)
- [ ] Metacritic (`metacritic.com/movie/*`, `metacritic.com/tv/*`)
- [ ] TV Time (`tvtime.com/show/*`)
- [ ] Simkl (`simkl.com/movies/*`, `simkl.com/tv/*`)

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
- Cross-reference with ComPlexionist collection gap data
