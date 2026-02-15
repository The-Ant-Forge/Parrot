import { getConfig, saveConfig } from "../../common/storage";
import type {
  PlexConfig,
  TestConnectionResponse,
  BuildIndexResponse,
  StatusResponse,
} from "../../common/types";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const serverUrlInput = $<HTMLInputElement>("serverUrl");
const tokenInput = $<HTMLInputElement>("token");
const testBtn = $<HTMLButtonElement>("testBtn");
const saveBtn = $<HTMLButtonElement>("saveBtn");
const refreshBtn = $<HTMLButtonElement>("refreshBtn");
const feedbackEl = $<HTMLDivElement>("feedback");
const statusEl = $<HTMLDivElement>("status");
const itemCountEl = $<HTMLSpanElement>("itemCount");
const lastSyncEl = $<HTMLSpanElement>("lastSync");

function getFormConfig(): PlexConfig {
  return {
    serverUrl: serverUrlInput.value.trim(),
    token: tokenInput.value.trim(),
  };
}

function showFeedback(message: string, type: "success" | "error" | "info") {
  feedbackEl.textContent = message;
  feedbackEl.className = `feedback ${type}`;
  feedbackEl.hidden = false;
}

function hideFeedback() {
  feedbackEl.hidden = true;
}

function setButtonLoading(btn: HTMLButtonElement, loading: boolean) {
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.textContent ?? "";
    btn.textContent = "...";
  } else {
    btn.textContent = btn.dataset.originalText ?? btn.textContent;
  }
}

function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diffMin = Math.floor((now - ts) / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function showStatus(itemCount: number, lastRefresh: number | null) {
  statusEl.hidden = false;
  itemCountEl.textContent = String(itemCount);
  lastSyncEl.textContent = lastRefresh ? formatTimestamp(lastRefresh) : "never";
}

// --- Event handlers ---

testBtn.addEventListener("click", async () => {
  const config = getFormConfig();
  if (!config.serverUrl || !config.token) {
    showFeedback("Enter both server URL and token", "error");
    return;
  }

  hideFeedback();
  setButtonLoading(testBtn, true);

  const result: TestConnectionResponse = await browser.runtime.sendMessage({
    type: "TEST_CONNECTION",
    config,
  });

  setButtonLoading(testBtn, false);

  if (result.success) {
    showFeedback(
      `Connected! Found ${result.libraryCount} ${result.libraryCount === 1 ? "library" : "libraries"}`,
      "success",
    );
  } else {
    showFeedback(result.error ?? "Connection failed", "error");
  }
});

saveBtn.addEventListener("click", async () => {
  const config = getFormConfig();
  if (!config.serverUrl || !config.token) {
    showFeedback("Enter both server URL and token", "error");
    return;
  }

  hideFeedback();
  setButtonLoading(saveBtn, true);

  // Fetch machineIdentifier before saving
  const testResult: TestConnectionResponse = await browser.runtime.sendMessage({
    type: "TEST_CONNECTION",
    config,
  });
  if (testResult.machineIdentifier) {
    config.machineIdentifier = testResult.machineIdentifier;
  }

  await saveConfig(config);
  showFeedback("Syncing library...", "info");

  const result: BuildIndexResponse = await browser.runtime.sendMessage({
    type: "BUILD_INDEX",
  });

  setButtonLoading(saveBtn, false);

  if (result.success) {
    showFeedback(`Synced ${result.itemCount} items`, "success");
    showStatus(result.itemCount ?? 0, Date.now());
  } else {
    showFeedback(result.error ?? "Sync failed", "error");
  }
});

refreshBtn.addEventListener("click", async () => {
  hideFeedback();
  setButtonLoading(refreshBtn, true);

  const result: BuildIndexResponse = await browser.runtime.sendMessage({
    type: "BUILD_INDEX",
  });

  setButtonLoading(refreshBtn, false);

  if (result.success) {
    showFeedback(`Refreshed — ${result.itemCount} items`, "success");
    showStatus(result.itemCount ?? 0, Date.now());
  } else {
    showFeedback(result.error ?? "Refresh failed", "error");
  }
});

// --- Init: load saved config and status ---

(async () => {
  const config = await getConfig();
  if (config) {
    serverUrlInput.value = config.serverUrl;
    tokenInput.value = config.token;
  }

  const status: StatusResponse = await browser.runtime.sendMessage({
    type: "GET_STATUS",
  });

  if (status.configured && status.lastRefresh) {
    showStatus(status.itemCount, status.lastRefresh);
  }
})();
