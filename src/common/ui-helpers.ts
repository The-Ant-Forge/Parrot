/** Shared UI helpers for popup and options pages. */

export function showFeedback(el: HTMLDivElement, message: string, type: "success" | "error" | "info") {
  el.textContent = message;
  el.className = `feedback ${type}`;
  el.hidden = false;
}

export function hideFeedback(el: HTMLDivElement) {
  el.hidden = true;
}

export function setButtonLoading(btn: HTMLButtonElement, loading: boolean) {
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.textContent ?? "";
    btn.textContent = "...";
  } else {
    btn.textContent = btn.dataset.originalText ?? btn.textContent;
  }
}

export function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diffMin = Math.floor((now - ts) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return `${Math.floor(diffMin / 1440)}d ago`;
}
