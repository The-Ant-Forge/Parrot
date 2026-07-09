/**
 * Extension version comparison and update checking.
 */

import { fetchWithTimeout } from "../../common/fetch-timeout";
import { getUpdateCheck, saveUpdateCheck } from "../../common/storage";
import { debugLog, errorLog } from "../../common/logger";

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const l = latestParts[i] ?? 0;
    const c = currentParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  content_type: string;
}

/** Pick the Chrome zip asset from a release's assets list, if present. */
export function pickZipAssetUrl(assets: GitHubReleaseAsset[] | undefined): string | undefined {
  if (!Array.isArray(assets)) return undefined;
  // Prefer files like "parrot-1.20.0-chrome.zip"
  const chromeZip = assets.find((a) => /chrome.*\.zip$/i.test(a.name));
  if (chromeZip) return chromeZip.browser_download_url;
  const anyZip = assets.find((a) => a.name.toLowerCase().endsWith(".zip"));
  return anyZip?.browser_download_url;
}

/**
 * Check for a newer release on GitHub and persist the result.
 * Pass `force: true` to skip the throttle and re-fetch immediately.
 */
export async function checkForUpdate(): Promise<void> {
  try {
    const response = await fetchWithTimeout("https://api.github.com/repos/The-Ant-Forge/Parrot/releases/latest", {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!response.ok) {
      errorLog("BG", `update check failed: ${response.status}`);
      return;
    }
    const data = (await response.json()) as {
      tag_name: string;
      html_url?: string;
      assets?: GitHubReleaseAsset[];
    };
    const tagName = data.tag_name;
    const latestVersion = tagName.replace(/^v/, "");
    const downloadUrl = data.html_url ?? `https://github.com/The-Ant-Forge/Parrot/releases/tag/${tagName}`;
    const assetUrl = pickZipAssetUrl(data.assets);
    await saveUpdateCheck({ latestVersion, downloadUrl, assetUrl, checkedAt: Date.now() });
    debugLog("BG", `update check complete — latest: ${latestVersion}, asset: ${assetUrl ?? "none"}`);
  } catch (err) {
    errorLog("BG", "update check failed", err);
  }
}

export async function maybeCheckForUpdate(): Promise<void> {
  const cached = await getUpdateCheck();
  if (cached && Date.now() - cached.checkedAt < UPDATE_CHECK_INTERVAL_MS) return;
  void checkForUpdate(); // fire-and-forget (has its own try/catch)
}
