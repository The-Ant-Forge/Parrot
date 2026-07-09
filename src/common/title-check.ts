/**
 * Shared title-based CHECK logic.
 * Used by content scripts that match by title (PSA, JustWatch, RT,
 * Metacritic, iPlayer, Plex app).
 */

import { debugLog } from "./logger";
import { buildTitleKey, parseSlug, parseTitleFromH1 } from "./normalize";
import type { CheckResponse } from "./types";

export interface TitleCheckOptions {
  /** Alternate title (e.g. slug-derived) tried server-side on a miss. */
  alt?: { title: string; year?: number };
  /** The mediaType is a guess — background retries the opposite type on miss. */
  ambiguousType?: boolean;
}

/** Send a CHECK with title-based matching (single message; retries happen server-side). */
export async function tryTitleCheck(
  mediaType: "movie" | "show",
  title: string,
  year: number | undefined,
  opts?: TitleCheckOptions,
): Promise<CheckResponse> {
  const titleKey = buildTitleKey(title, year);
  const altId = opts?.alt ? buildTitleKey(opts.alt.title, opts.alt.year) : undefined;
  debugLog("TitleCheck", `trying ${mediaType} title:"${title}" year:${year ?? "none"} key:${titleKey}`,
    altId && altId !== titleKey ? `alt:${altId}` : "");
  return await browser.runtime.sendMessage({
    type: "CHECK",
    mediaType,
    source: "title",
    id: titleKey,
    altId: altId !== titleKey ? altId : undefined,
    ambiguousType: opts?.ambiguousType,
  });
}

export interface TitleCheckResult {
  response: CheckResponse;
  /** Primary (merged) title key — what gap checks should key on. */
  titleKey: string;
  title: string;
  year?: number;
}

/**
 * Merge URL-slug and page-heading title info (heading preferred — better
 * formatted; year from whichever has it), then run a single CHECK with the
 * slug key as the server-side fallback when the two differ.
 */
export async function titleCheckWithSlugFallback(
  site: string,
  mediaType: "movie" | "show",
  rawSlug: string,
  headingText: string | undefined,
): Promise<TitleCheckResult> {
  const slug = parseSlug(rawSlug);
  const heading = headingText ? parseTitleFromH1(headingText) : undefined;

  const title = heading?.title ?? slug.title;
  const year = heading?.year ?? slug.year;

  debugLog(site, "merged →", title, year ?? "no year",
    `(slug: ${slug.title}/${slug.year ?? "none"}, heading: ${heading?.title ?? "none"}/${heading?.year ?? "none"})`);

  const response = await tryTitleCheck(mediaType, title, year, {
    // Only a *different* slug title is extra information (a missing year is
    // less info, not different info).
    alt: slug.title !== title ? { title: slug.title, year: slug.year } : undefined,
  });

  return { response, titleKey: buildTitleKey(title, year), title, year };
}
