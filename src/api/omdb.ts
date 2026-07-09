import { fetchWithTimeout } from "../common/fetch-timeout";

const BASE_URL = "https://www.omdbapi.com";
const TIMEOUT_MS = 4000;

interface OMDbResponse {
  Response: string;
  imdbRating?: string;
  Error?: string;
}

/**
 * Fetch the IMDb rating for a title via the OMDb API.
 * Returns the rating as a number (0-10) or null if unavailable.
 */
export async function getImdbRating(
  apiKey: string,
  imdbId: string,
): Promise<number | null> {
  const url = `${BASE_URL}/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url, {
    headers: { Accept: "application/json" },
  }, TIMEOUT_MS);
  if (!res.ok) return null;

  const data = (await res.json()) as OMDbResponse;
  if (data.Response !== "True" || !data.imdbRating || data.imdbRating === "N/A") {
    return null;
  }
  const rating = parseFloat(data.imdbRating);
  return isNaN(rating) ? null : rating;
}

/**
 * Validate an OMDb API key by making a test request.
 */
export async function validateOmdbKey(apiKey: string): Promise<boolean> {
  try {
    const url = `${BASE_URL}/?i=tt0000001&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
    }, TIMEOUT_MS);
    if (!res.ok) return false;
    const data = (await res.json()) as OMDbResponse;
    // Invalid key returns Response: "False" with Error: "Invalid API key!"
    return data.Response === "True" || !data.Error?.includes("Invalid API key");
  } catch {
    return false;
  }
}
