/**
 * Extension version comparison and update checking.
 */

import { getUpdateCheck, saveUpdateCheck } from "../../common/storage";
import { debugLog, errorLog } from "../../common/logger";

const UPDATE_CHECK_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

async function checkForUpdate(): Promise<void> {
  try {
    const response = await fetch("https://api.github.com/repos/The-Ant-Forge/Parrot/releases/latest", {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!response.ok) {
      errorLog("BG", `update check failed: ${response.status}`);
      return;
    }
    const data = await response.json();
    const tagName = data.tag_name as string;
    const latestVersion = tagName.replace(/^v/, "");
    const downloadUrl = (data.html_url as string) ?? `https://github.com/The-Ant-Forge/Parrot/releases/tag/${tagName}`;
    await saveUpdateCheck({ latestVersion, downloadUrl, checkedAt: Date.now() });
    debugLog("BG", `update check complete — latest: ${latestVersion}`);
  } catch (err) {
    errorLog("BG", "update check failed", err);
  }
}

export async function maybeCheckForUpdate(): Promise<void> {
  const cached = await getUpdateCheck();
  if (cached && Date.now() - cached.checkedAt < UPDATE_CHECK_INTERVAL_MS) return;
  checkForUpdate(); // fire-and-forget
}
