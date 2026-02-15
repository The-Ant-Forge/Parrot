import { getConfig, getLibraryIndex, saveLibraryIndex } from "../common/storage";
import { testConnection, buildLibraryIndex } from "../api/plex";
import type {
  Message,
  CheckResponse,
  StatusResponse,
  TestConnectionResponse,
  BuildIndexResponse,
  LibraryIndex,
} from "../common/types";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedIndex: LibraryIndex | null = null;

async function loadIndex(): Promise<LibraryIndex | null> {
  if (!cachedIndex) {
    cachedIndex = await getLibraryIndex();
    if (cachedIndex) {
      const movieTmdb = Object.keys(cachedIndex.movies.byTmdbId).length;
      const movieImdb = Object.keys(cachedIndex.movies.byImdbId).length;
      const showTvdb = Object.keys(cachedIndex.shows.byTvdbId).length;
      const showTmdb = Object.keys(cachedIndex.shows.byTmdbId).length;
      const showImdb = Object.keys(cachedIndex.shows.byImdbId).length;
      console.log(
        `Parrot: loaded index from storage — movies: ${movieTmdb} tmdb / ${movieImdb} imdb, shows: ${showTvdb} tvdb / ${showTmdb} tmdb / ${showImdb} imdb`,
      );
    } else {
      console.log("Parrot: no index found in storage");
    }
  }
  return cachedIndex;
}

function handleCheck(
  message: Extract<Message, { type: "CHECK" }>,
  index: LibraryIndex,
): CheckResponse {
  const { mediaType, source, id } = message;

  if (mediaType === "movie") {
    const map =
      source === "tmdb"
        ? index.movies.byTmdbId
        : index.movies.byImdbId;
    const item = map[id];
    return item ? { owned: true, item } : { owned: false };
  }

  // show
  const map =
    source === "tvdb"
      ? index.shows.byTvdbId
      : source === "tmdb"
        ? index.shows.byTmdbId
        : index.shows.byImdbId;
  const item = map[id];
  return item ? { owned: true, item } : { owned: false };
}

async function setIconOwned(tabId: number, owned: boolean) {
  if (owned) {
    await browser.action.setBadgeText({ text: "✓", tabId });
    await browser.action.setBadgeBackgroundColor({ color: "#4caf50", tabId });
  } else {
    await browser.action.setBadgeText({ text: "", tabId });
  }
}

export default defineBackground(() => {
  // Auto-refresh stale index on startup
  (async () => {
    const config = await getConfig();
    if (!config) return;

    const index = await loadIndex();
    if (!index || Date.now() - index.lastRefresh > STALE_THRESHOLD_MS) {
      try {
        const freshIndex = await buildLibraryIndex(config);
        await saveLibraryIndex(freshIndex);
        cachedIndex = freshIndex;
        console.log(`Parrot: auto-refreshed index (${freshIndex.itemCount} items)`);
      } catch (err) {
        console.error("Parrot: auto-refresh failed", err);
      }
    }
  })();

  browser.runtime.onMessage.addListener(
    (message: Message, _sender, sendResponse) => {
      (async () => {
        switch (message.type) {
          case "TEST_CONNECTION": {
            const result: TestConnectionResponse = await testConnection(
              message.config,
            );
            sendResponse(result);
            break;
          }

          case "BUILD_INDEX": {
            const config = await getConfig();
            if (!config) {
              sendResponse({
                success: false,
                error: "Not configured",
              } satisfies BuildIndexResponse);
              break;
            }
            try {
              const index = await buildLibraryIndex(config);
              await saveLibraryIndex(index);
              cachedIndex = index;
              sendResponse({
                success: true,
                itemCount: index.itemCount,
              } satisfies BuildIndexResponse);
            } catch (err) {
              sendResponse({
                success: false,
                error: String(err),
              } satisfies BuildIndexResponse);
            }
            break;
          }

          case "GET_STATUS": {
            const config = await getConfig();
            const index = await loadIndex();
            sendResponse({
              configured: !!config,
              lastRefresh: index?.lastRefresh ?? null,
              itemCount: index?.itemCount ?? 0,
            } satisfies StatusResponse);
            break;
          }

          case "CHECK": {
            const tabId = _sender.tab?.id;
            const index = await loadIndex();
            if (!index) {
              console.log("Parrot CHECK: no index loaded, returning not owned");
              if (tabId) await setIconOwned(tabId, false);
              sendResponse({ owned: false } satisfies CheckResponse);
              break;
            }
            const result = handleCheck(message, index);
            console.log(
              `Parrot CHECK: ${message.mediaType} ${message.source}:${message.id} → ${result.owned ? "OWNED" : "not owned"}`,
              result.owned ? result.item : "",
            );
            if (tabId) await setIconOwned(tabId, result.owned);
            sendResponse(result);
            break;
          }
        }
      })();
      return true; // keep message channel open for async response
    },
  );
});
