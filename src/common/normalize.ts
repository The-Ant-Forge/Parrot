/**
 * Title normalization utilities for title-based library lookups.
 * Used when a site has no external IDs (TMDB/IMDb/TVDB) and we
 * must match by title + optional year instead.
 */

/** Normalize a title string for fuzzy matching: lowercase, hyphens→spaces, strip punctuation, collapse whitespace. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a lookup key from a normalized title and optional year. */
export function buildTitleKey(title: string, year?: number): string {
  const norm = normalizeTitle(title);
  return year ? `${norm}|${year}` : norm;
}

/** Parse a URL slug into a title string and optional trailing year.
 *  Handles both hyphen-separated (PSA) and underscore-separated (Rotten Tomatoes) slugs. */
export function parseSlug(slug: string): { title: string; year?: number } {
  const yearMatch = slug.match(/[-_](\d{4})$/);
  let year: number | undefined;
  let titleSlug = slug;

  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    if (y >= 1900 && y <= 2099) {
      year = y;
      titleSlug = slug.slice(0, -(yearMatch[0].length));
    }
  }

  const title = titleSlug.replace(/[-_]/g, " ").trim();
  return { title, year };
}
