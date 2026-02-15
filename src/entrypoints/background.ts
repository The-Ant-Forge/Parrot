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

function buildPlexUrl(machineIdentifier: string, plexKey: string): string {
  return `https://app.plex.tv/desktop/#!/server/${machineIdentifier}/details?key=%2Flibrary%2Fmetadata%2F${plexKey}`;
}

async function handleCheck(
  message: Extract<Message, { type: "CHECK" }>,
  index: LibraryIndex,
): Promise<CheckResponse> {
  const { mediaType, source, id } = message;

  let item: import("../common/types").OwnedItem | undefined;

  if (mediaType === "movie") {
    const map =
      source === "tmdb"
        ? index.movies.byTmdbId
        : index.movies.byImdbId;
    item = map[id];
  } else {
    const map =
      source === "tvdb"
        ? index.shows.byTvdbId
        : source === "tmdb"
          ? index.shows.byTmdbId
          : index.shows.byImdbId;
    item = map[id];
  }

  if (!item) return { owned: false };

  // Build deep link if machineIdentifier is available
  const config = await getConfig();
  const plexUrl = config?.machineIdentifier
    ? buildPlexUrl(config.machineIdentifier, item.plexKey)
    : undefined;

  return { owned: true, item, plexUrl };
}

type IconState = "owned" | "not-owned" | "inactive";

const ICON_COLORS: Record<IconState, { bg: string; border: string; letter: string }> = {
  owned: { bg: "#1a1a1a", border: "#ebaf00", letter: "#ffffff" },
  "not-owned": { bg: "#3a3a3a", border: "#888888", letter: "#888888" },
  inactive: { bg: "#cccccc", border: "#999999", letter: "#666666" },
};

function roundedRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawIcon(size: number, state: IconState): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const c = ICON_COLORS[state];

  // Rounded rectangle background
  const borderWidth = Math.max(1, Math.round(size * 0.08));
  const radius = Math.round(size * 0.18);
  const inset = borderWidth / 2;

  roundedRect(ctx, inset, inset, size - borderWidth, size - borderWidth, radius);
  ctx.fillStyle = c.bg;
  ctx.fill();
  ctx.strokeStyle = c.border;
  ctx.lineWidth = borderWidth;
  ctx.stroke();

  // "P" letter centered
  const fontSize = Math.round(size * 0.6);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = c.letter;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("P", size / 2, size / 2 + size * 0.04);

  return ctx.getImageData(0, 0, size, size);
}

function getIconImageData(state: IconState): Record<string, ImageData> {
  return {
    "16": drawIcon(16, state),
    "32": drawIcon(32, state),
    "48": drawIcon(48, state),
    "128": drawIcon(128, state),
  };
}

async function setTabIcon(tabId: number, state: IconState) {
  try {
    await browser.action.setIcon({ imageData: getIconImageData(state), tabId });
  } catch (err) {
    console.error("Parrot: failed to set tab icon", err);
  }
}

export default defineBackground(() => {
  // Set default inactive icon on startup
  try {
    browser.action.setIcon({ imageData: getIconImageData("inactive") });
  } catch (err) {
    console.error("Parrot: failed to set default icon", err);
  }

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
              if (tabId) await setTabIcon(tabId, "not-owned");
              sendResponse({ owned: false } satisfies CheckResponse);
              break;
            }
            const result = await handleCheck(message, index);
            console.log(
              `Parrot CHECK: ${message.mediaType} ${message.source}:${message.id} → ${result.owned ? "OWNED" : "not owned"}`,
              result.owned ? result.item : "",
            );
            if (tabId) await setTabIcon(tabId, result.owned ? "owned" : "not-owned");
            sendResponse(result);
            break;
          }
        }
      })();
      return true; // keep message channel open for async response
    },
  );
});
