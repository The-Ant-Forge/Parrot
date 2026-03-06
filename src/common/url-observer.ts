/**
 * Observe URL changes in SPAs using a debounced MutationObserver.
 * Calls the handler when location.href changes, debounced to avoid
 * rapid re-checks during SPA navigation transitions.
 */
export function observeUrlChanges(handler: () => void, debounceMs = 150): () => void {
  let lastUrl = location.href;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        handler();
      }, debounceMs);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
