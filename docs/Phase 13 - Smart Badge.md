# Phase 13 — Smart Badge with Floating Gap Panel

Redesigns the badge as a unified smart pill with four states and moves gap panels to floating overlays anchored to the badge. Zero layout shift, lighter DOM footprint, and intuitive split-click interaction.

---

## Badge States

| State | Appearance | Interaction |
|-------|-----------|-------------|
| Not owned | `[Plex]` gray | None |
| Owned (no gap data) | `[Plex]` gold | Click opens Plex |
| Owned + complete | `[Plex : Complete]` gold | "Plex" opens Plex, "Complete" toggles panel |
| Owned + incomplete | `[Plex : Incomplete]` gold | "Plex" opens Plex, "Incomplete" toggles panel |

---

## Badge DOM Structure

### States 1–2 (no gap data): single-click badge

```html
<span data-parrot-badge style="position:relative; display:inline-flex">
  <span class="parrot-pill" style="[pill styling]">
    <!-- For not-owned: plain content. For owned+plexUrl: <a> wrapping icon+text -->
    <svg>...</svg>
    <span>Plex</span>
  </span>
</span>
```

### States 3–4 (with gap data): split-click badge

```html
<span data-parrot-badge style="position:relative; display:inline-flex">
  <span class="parrot-pill" style="[pill styling]">
    <a class="parrot-plex-link" href="..." target="_blank">
      <svg>...</svg> <span>Plex</span>
    </a>
    <span class="parrot-gap-toggle" aria-expanded="false" style="cursor:pointer">
       : Complete
    </span>
  </span>
  <!-- Floating panel (appended when toggle clicked, removed when hidden) -->
  <div style="position:absolute; z-index:99999; ...">
    ...panel content...
  </div>
</span>
```

The outer `<span data-parrot-badge>` is the stable wrapper (never replaced). It has `position: relative` to anchor the floating panel. Inner content rebuilds on state transitions.

---

## Floating Panel

- Panel is a child of the wrapper, positioned `absolute` relative to the wrapper's `position: relative`
- Default: drops down from badge, left-aligned
- After render, viewport bounds are checked via `requestAnimationFrame` + `getBoundingClientRect`:
  - If panel extends below viewport → flips above (`bottom: 100%`)
  - If panel extends past right edge → right-aligns (`right: 0` instead of `left: 0`)
- Sizing: `min-width: 280px`, `max-width: 400px`, `max-height: 400px` with `overflow-y: auto`
- Panel DOM stays in memory when hidden (preserves expand/collapse state of internal headers)

### Dismissal

- Click the toggle text again (same toggle)
- Click anywhere outside the badge wrapper (capture-phase document listener)
- Listener added when panel opens, removed when panel closes
- `removeBadge()` also tears down listeners

---

## Changes

### `badge.ts` — Major Rewrite

Wrapper+pill architecture replaces the old span-replaced-with-anchor approach.

**New/changed exports:**

| Function | Change |
|----------|--------|
| `createBadge()` | Creates wrapper span with `position: relative` + inner `.parrot-pill` |
| `updateBadge()` | Targets inner pill for styles and content |
| `updateBadgeFromResponse()` | Rebuilds inner pill content (no more `replaceWith`) |
| `showErrorBadge()` | Targets inner pill |
| `setBadgeGapData(data)` | **NEW** — adds split-click toggle + stores panel element |
| `removeBadge()` | Also cleans up panel, click-outside listener, module state |
| `updateBadgeCompleteness()` | **REMOVED** — replaced by `setBadgeGapData()` |

**New type:** `GapPanelData { state: "complete" | "incomplete"; panelElement: HTMLDivElement }`

**Module-level state:** `currentPanelElement`, `clickOutsideHandler`, `panelVisible`, `currentPlexUrl`

### `gap-checker.ts` — Rewired

- Removed `anchor` from `GapCheckParams`
- Calls `createCollectionPanel()` + `setBadgeGapData()` instead of `injectCollectionPanel()` + `updateBadgeCompleteness()`
- Calls `createEpisodePanel()` + `setBadgeGapData()` instead of `injectEpisodePanel()` + `updateBadgeCompleteness()`
- Always passes a panel element to `setBadgeGapData` (even for "complete" state)

### Panel Modules — Cleaned Up

- `collection-panel.ts` — removed `removeCollectionPanel()` and `injectCollectionPanel()` exports
- `episode-panel.ts` — removed `removeEpisodePanel()` and `injectEpisodePanel()` exports
- `panel-utils.ts` — removed `injectPanel()` export, removed `marginTop` from `createPanelContainer()`

### Content Scripts — Simplified

All 12 content scripts:
- Removed `removeCollectionPanel` and `removeEpisodePanel` imports and calls
- Removed `anchor` from `checkGaps()` calls
- `removeBadge()` now handles all cleanup (panel is a child of badge wrapper)

`nzbforyou.content.ts` — additional simplification:
- Removed local `BADGE_ATTR`, `removeAllBadges()`, `injectBadges()`
- Uses standard `injectBadge()` and `removeBadge()` from badge.ts
- Targets only `h3.first` (dropped `h2.topic-title` second badge)

### Tests

- `tests/badge.test.ts` — rewritten for wrapper+pill architecture
- Removed `updateBadgeCompleteness` tests
- Added `setBadgeGapData` tests: completeness text, split-click zones, toggle show/hide, click-outside dismissal, aria-expanded, panel cleanup on removeBadge
- Added old-style TVDB query parameter URL test to `tests/scan-links.test.ts`
- Total: 99 tests across 6 test files (up from 89)

---

## Post-Release Bug Fixes

### Badge visibility
`createBadge()` set `display: none` on the wrapper but `updateBadge`, `updateBadgeFromResponse`, and `showErrorBadge` never made it visible. All three now set `display: inline-flex` on the wrapper.

### Badge vertical alignment
Added `vertical-align: middle` to the wrapper style for proper centering within tall title elements (e.g. h1 tags).

### TVDB old-style URL matching
The Phase 12 regex tightening (`/series/(\d+)/`) only matched new-style TVDB URLs like `/series/12345`. NZBGeek uses old-style query parameter format (`?tab=series&id=12345`). Added second pattern to `scanLinksForExternalId()` to match both formats.
