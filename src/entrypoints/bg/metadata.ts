/**
 * Metadata extraction helpers for Radarr/Sonarr API responses.
 */

import type { RadarrMovie, RadarrMovieRatings } from "../../api/radarr";
import type { SonarrShow } from "../../api/sonarr";
import type { TabMediaInfo } from "../../common/types";

/** Extract ratings from a Radarr movie response into TabMediaInfo fields. */
export function applyRadarrRatings(info: TabMediaInfo, ratings: RadarrMovieRatings) {
  if (ratings.Tmdb?.Value != null) info.tmdbRating = ratings.Tmdb.Value;
  if (ratings.Imdb?.Value != null) info.imdbRating = ratings.Imdb.Value;
  if (ratings.RottenTomatoes?.Value != null) info.rtRating = ratings.RottenTomatoes.Value;
  if (ratings.Metacritic?.Value != null) info.metacriticRating = ratings.Metacritic.Value;
  if (ratings.Trakt?.Value != null) info.traktRating = ratings.Trakt.Value;
}

/** Apply metadata from a Radarr movie response to TabMediaInfo. */
export function applyRadarrMetadata(info: TabMediaInfo, movie: RadarrMovie) {
  info.title = movie.Title;
  info.year = movie.Year;
  if (!info.tmdbId) info.tmdbId = movie.TmdbId;
  if (!info.imdbId && movie.ImdbId) info.imdbId = movie.ImdbId;
  // Extract poster from images array
  const poster = movie.Images?.find(i => i.CoverType.toLowerCase() === "poster");
  if (poster?.Url) info.posterUrl = poster.Url;
  if (movie.MovieRatings) applyRadarrRatings(info, movie.MovieRatings);
}

/** Apply metadata from a Sonarr show response to TabMediaInfo. */
export function applySonarrMetadata(info: TabMediaInfo, show: SonarrShow) {
  info.title = show.title;
  if (show.firstAired) info.year = parseInt(show.firstAired.slice(0, 4), 10);
  if (!info.tmdbId && show.tmdbId) info.tmdbId = show.tmdbId;
  if (!info.imdbId && show.imdbId) info.imdbId = show.imdbId;
  if (!info.tvdbId) info.tvdbId = show.tvdbId;
  info.showStatus = show.status;
  info.seasonCount = show.seasons?.filter(s => s.seasonNumber > 0).length;
  info.episodeCount = show.episodes?.length;
  // Extract poster from images array
  const poster = show.images?.find(i => i.coverType.toLowerCase() === "poster");
  if (poster?.url) info.posterUrl = poster.url;
  // TVDB rating (value is a string)
  if (show.rating?.value) {
    const parsed = parseFloat(show.rating.value);
    if (!isNaN(parsed)) info.tvdbRating = parsed;
  }
}

/** Check if TabMediaInfo has any rating values populated. */
export function hasAnyRatings(info: TabMediaInfo): boolean {
  return info.tmdbRating !== undefined || info.imdbRating !== undefined
    || info.rtRating !== undefined || info.metacriticRating !== undefined
    || info.traktRating !== undefined || info.tvdbRating !== undefined;
}
