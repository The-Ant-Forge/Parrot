# Phase 5: Options/Settings Page

## Goal

Create a full-tab WXT options page where users configure API credentials, set gap detection preferences, and manage cache. This is a prerequisite for Phase 6 (TMDB collection gap detection) since it provides the TMDB API key input.

---

## Files

| File | Action |
|------|--------|
| `src/entrypoints/options/index.html` | **New** — options page HTML |
| `src/entrypoints/options/main.ts` | **New** — options page logic |
| `src/entrypoints/options/style.css` | **New** — options page styles |
| `src/common/types.ts` | **Modify** — add `ParrotOptions` type, new messages |
| `src/common/storage.ts` | **Modify** — add `getOptions()`, `saveOptions()` |
| `src/entrypoints/background.ts` | **Modify** — add message handlers |
| `src/entrypoints/popup/main.ts` | **Modify** — add settings link |
| `src/entrypoints/popup/index.html` | **Modify** — add settings link |
| `wxt.config.ts` | **Modify** — add TMDB to host_permissions |

---

## WXT Auto-Discovery

WXT recognises `options/index.html` in `entrypoints/` automatically. No `wxt.config.ts` manifest changes needed. Add `<meta name="manifest.open_in_tab" content="true">` in the HTML `<head>` so it opens in a full browser tab.

---

## Types

```typescript
export interface ParrotOptions {
  tmdbApiKey: string;        // TMDB v3 API key
  excludeFuture: boolean;    // Skip unreleased movies (default: true)
  excludeSpecials: boolean;  // Skip Season 0 episodes (default: true)
  minCollectionSize: number; // Min movies in collection to show gaps (default: 2)
  minOwned: number;          // Min owned movies to trigger gap display (default: 2)
}

export const DEFAULT_OPTIONS: ParrotOptions = {
  tmdbApiKey: "",
  excludeFuture: true,
  excludeSpecials: true,
  minCollectionSize: 2,
  minOwned: 2,
};
```

New message types:
```typescript
| { type: "GET_OPTIONS" }
| { type: "SAVE_OPTIONS"; options: ParrotOptions }
| { type: "VALIDATE_TMDB_KEY"; apiKey: string }
| { type: "CLEAR_CACHE" }
```

---

## Storage

Options stored in `browser.storage.sync` under key `"parrotOptions"` (small JSON, alongside PlexConfig). Helpers follow the existing pattern in `storage.ts`:
- `getOptions(): Promise<ParrotOptions>` — returns stored options or defaults
- `saveOptions(options: ParrotOptions): Promise<void>`

---

## Page Layout

Four sections, styled consistently with the popup (Plex gold accents, `system-ui` font):

### 1. Plex Server
- Server URL input
- Token input (password field)
- Test Connection button with feedback
- Status display (item count, last sync timestamp)

### 2. API Keys
- TMDB API key input + Validate button
  - Validation: `GET https://api.themoviedb.org/3/configuration?api_key={key}` — HTTP 200 = valid
  - Green "Valid" or red error feedback
- TVDB fields reserved for future phase

### 3. Gap Detection Options
- Toggle: "Exclude future/unreleased movies" (default: on)
- Toggle: "Exclude specials (Season 0)" (default: on)
- Number input: "Minimum collection size" (default: 2, min: 2)
- Number input: "Minimum owned to show gaps" (default: 1, min: 1)

### 4. Cache Management
- Display: "Library index: X items, last synced Y"
- Button: "Refresh Library" (sends `BUILD_INDEX`)
- Button: "Clear All Cache" (clears `storage.local`)

---

## Background Handler Additions

| Message | Action |
|---------|--------|
| `GET_OPTIONS` | Read from `storage.sync`, return options (or defaults) |
| `SAVE_OPTIONS` | Write to `storage.sync` |
| `VALIDATE_TMDB_KEY` | Fetch TMDB `/configuration` endpoint, return success/error |
| `CLEAR_CACHE` | Clear `browser.storage.local`, reset in-memory `cachedIndex` |

---

## Popup Settings Link

Add a gear icon or "Settings" text link in the popup that calls `browser.runtime.openOptionsPage()`.

---

## Host Permissions

Add `https://api.themoviedb.org/*` to `host_permissions` in `wxt.config.ts`. TMDB API calls go through the background service worker (same CORS-free pattern as Plex calls).

---

## Verification

1. `npm run build` compiles cleanly
2. Click gear icon in popup -> options page opens in a new tab
3. Enter TMDB API key -> click Validate -> shows "Valid" feedback
4. Toggle options -> save -> reload page -> options persist
5. Click "Clear All Cache" -> library index cleared -> re-sync works
