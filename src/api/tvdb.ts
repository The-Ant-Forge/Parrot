const BASE_URL = "https://api4.thetvdb.com/v4";

export interface TVDBEpisode {
  seasonNumber: number;
  number: number;
  name: string | null;
  aired: string | null;
}

// In-memory bearer token (lives for the service worker's lifetime)
let cachedToken: string | null = null;

async function login(apiKey: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ apikey: apiKey }),
  });

  if (res.status === 401) {
    throw new Error("Invalid TVDB API key");
  }
  if (!res.ok) {
    throw new Error(`TVDB login failed: ${res.status}`);
  }

  const data = await res.json();
  const token = data?.data?.token;
  if (!token) {
    throw new Error("TVDB login: no token in response");
  }
  return token;
}

async function tvdbFetch<T>(apiKey: string, path: string): Promise<T> {
  if (!cachedToken) {
    cachedToken = await login(apiKey);
  }

  let res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${cachedToken}`,
      Accept: "application/json",
    },
  });

  // Token expired — re-authenticate and retry
  if (res.status === 401) {
    cachedToken = await login(apiKey);
    res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${cachedToken}`,
        Accept: "application/json",
      },
    });
  }

  if (!res.ok) {
    throw new Error(`TVDB API error: ${res.status}`);
  }

  return (await res.json()) as T;
}

interface TVDBEpisodesResponse {
  data: {
    episodes: Array<{
      seasonNumber: number;
      number: number;
      name: string | null;
      aired: string | null;
    }>;
  };
}

/**
 * Fetch all episodes for a series, handling pagination.
 * Uses the "default" season type.
 */
export async function getSeriesEpisodes(
  apiKey: string,
  seriesId: string,
): Promise<TVDBEpisode[]> {
  const allEpisodes: TVDBEpisode[] = [];
  let page = 0;

  while (true) {
    const data = await tvdbFetch<TVDBEpisodesResponse>(
      apiKey,
      `/series/${seriesId}/episodes/default?page=${page}`,
    );

    const episodes = data?.data?.episodes ?? [];
    if (episodes.length === 0) break;

    for (const ep of episodes) {
      if (ep.seasonNumber != null && ep.number != null) {
        allEpisodes.push({
          seasonNumber: ep.seasonNumber,
          number: ep.number,
          name: ep.name ?? null,
          aired: ep.aired ?? null,
        });
      }
    }

    if (episodes.length < 500) break;
    page++;
  }

  return allEpisodes;
}

/**
 * Validate a TVDB API key by attempting to log in.
 */
export async function validateTvdbKey(apiKey: string): Promise<boolean> {
  try {
    await login(apiKey);
    return true;
  } catch {
    return false;
  }
}
