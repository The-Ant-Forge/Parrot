# KickassTorrents Site Support — Spec (2026-07-21)

Add `kickasstorrents.to` as Parrot's 18th content script. Torrent detail pages
mix movies and TV with no structural type indicator; the release-name slug and
the background's existing dual-lookup machinery carry the disambiguation.

## Scope

- **Domains:** `kickasstorrents.to` only (plus subdomains). Mirrors out of scope.
- **Pages:** torrent detail pages — path ends `-t{digits}.html`.
  Match patterns: `*://kickasstorrents.to/*-t*.html`, `*://*.kickasstorrents.to/*-t*.html`.
- **Badge anchor:** the first `<h1>` (verified: holds the release title, e.g.
  `Hitmen 2020 S01-S02 1080p WEB-DL HEVC x265 5.1 BONE`).

## Detection waterfall

1. **IMDb link scan** (document-wide) — existing `extractImdbId()` over all
   `a[href]`. Covers the "good pages".
2. **Plain-text IMDb** — new extractor scanning `div#desc` text for
   `imdb.com/title/(tt\d+)` (case-insensitive). The description block is
   `#desc` (title excluded), so comment sections can't contribute a wrong id.
   Verified page shape: the URL appears as bare text inside a `<p>`, e.g.
   `https://www.imdb.com/title/tt0388482/`.
3. **Slug title fallback** — parse title/year from the URL slug and run a
   single title CHECK (server-side alt handling, below). Runs only when no
   IMDb id was found anywhere.

If none of the three produce anything (no `-t*.html` slug match), no badge.

## Media-type disambiguation

- **Season marker in slug** (`-sNN-` or `-sNNeNN-`, incl. ranges like
  `-s01-s02-`) → authoritative **show**.
- **IMDb id found, no marker** → send CHECK as `movie`; the background's
  existing IMDb dual-lookup retries the opposite type and reports the match
  via `resolvedMediaType`. (Same contract as NZBForYou.)
- **Title fallback, no marker** → `ambiguousType: true` on the title CHECK
  (v1.25.0 server-side opposite-type retry).

## Release-slug parsing

New pure function `parseKickassSlug(pathname)` in `src/common/extractors.ts`
(returns `null` when the path isn't a torrent detail page):

```
{ title: string; year?: number; mediaType: "movie" | "show" | undefined }
```

Rules, applied to the hyphen-token list after stripping `-t{digits}.html`:

1. **Season marker** — first token matching `/^s\d{1,2}(?:e\d{1,3})?$/i`
   → `mediaType: "show"`; tokens before the marker form the title; if the
   token immediately before the marker is a plausible year, it's the year and
   is excluded from the title.
2. **No marker** — the **last plausible year token** (1900..currentYear+1) is
   the year; tokens before it form the title; `mediaType` stays undefined
   (ambiguous). "Last plausible" handles numeric titles: in
   `2001-a-space-odyssey-1968-…` the year is 1968; in
   `blade-runner-2049-2017-…` 2049 is not plausible, so 2017 wins.
3. **No marker, no year** — cut the title at the first known release-noise
   token (`1080p 2160p 720p 480p bluray blu ray web webrip dl hdtv remux
   uhd hdr hdr10 dv hevc x264 x265 h264 h265 aac dts truehd atmos uncut
   extended remastered upscaled proper repack internal complete`); if none,
   the whole slug is the title.

Worked examples (real):

| Slug | Result |
|---|---|
| `the-specialist-1994-1080p-bluray-hevc-x265-5-1-bone-t6685416` | movie?, "the specialist", 1994 (ambiguous → dual lookup) |
| `ms-x-2026-s01-1080p-web-dl-hevc-x265-5-1-bone-t6685457` | show, "ms x", 2026 |
| `transporter-2-2005-uncut-upscaled-bluray-2160p-…-t6685539` | movie?, "transporter 2", 2005 |
| `hitmen-2020-s01-s02-1080p-web-dl-…-t…` | show, "hitmen", 2020 |

## Components

- `src/entrypoints/kickass.content.ts` — waterfall + badge + gap checks,
  modeled on `nzbforyou.content.ts` (IMDb-first, `resolvedMediaType`
  promotion, `checkGaps` for owned-or-movie).
- `src/common/extractors.ts` — `parseKickassSlug()` + `findImdbIdInText(text)`
  (pure; regex `imdb\.com\/title\/(tt\d+)`).
- `src/common/sites.ts` — `DEFAULT_SITES` entry (KickassTorrents, auto type).
- Title CHECK goes through the existing `tryTitleCheck()` with
  `ambiguousType` when the slug had no season marker.

## Error handling

Same pattern as sibling scripts: everything after badge injection in
`try/catch` → `showErrorBadge`. No badge (silent return) when the page yields
no id and no parseable slug.

## Testing

Extractor tests in `tests/extractors.test.ts` (or the existing extractor test
file): the four real slugs above, numeric-title edge (`2001-…-1968`),
implausible-year edge (`…-2049-2017-…`), no-year noise-cut, non-detail path →
null, `findImdbIdInText` hit/miss/first-of-several. Content script itself is
untested, consistent with all sibling scripts.

## Documentation updates

- `docs/Parrot spec.md` — site table + architecture tree + content-script count (18).
- `README.md` — supported-sites table row.
- `CLAUDE.md` — "17 `*.content.ts` scripts" → 18.
- `docs/wiki/Supported-Sites.md` — new row (publish via `npm run wiki:sync`).
