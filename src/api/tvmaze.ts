export interface TvMazeExternals {
  tvdbId: number | null;
  imdbId: string | null;
}

const TVMAZE_BASE = "https://api.tvmaze.com";

function parseExternals(data: Record<string, unknown>): TvMazeExternals {
  return {
    tvdbId: (data.externals as Record<string, unknown>)?.thetvdb as number | null ?? null,
    imdbId: (data.externals as Record<string, unknown>)?.imdb as string | null ?? null,
  };
}

/** Get external IDs for a TVMaze show by its TVMaze numeric ID. */
export async function getTvMazeExternals(tvmazeId: string): Promise<TvMazeExternals> {
  const res = await fetch(`${TVMAZE_BASE}/shows/${tvmazeId}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TVMaze API error: ${res.status}`);
  return parseExternals(await res.json());
}

/** Look up a show by IMDb ID → returns TVDB ID (and IMDb ID back). */
export async function lookupByImdb(imdbId: string): Promise<TvMazeExternals | null> {
  const res = await fetch(`${TVMAZE_BASE}/lookup/shows?imdb=${encodeURIComponent(imdbId)}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TVMaze lookup error: ${res.status}`);
  return parseExternals(await res.json());
}

/** Look up a show by TVDB ID → returns IMDb ID (and TVDB ID back). */
export async function lookupByTvdb(tvdbId: string): Promise<TvMazeExternals | null> {
  const res = await fetch(`${TVMAZE_BASE}/lookup/shows?thetvdb=${encodeURIComponent(tvdbId)}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TVMaze lookup error: ${res.status}`);
  return parseExternals(await res.json());
}
