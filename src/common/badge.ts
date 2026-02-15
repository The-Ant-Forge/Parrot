import type { CheckResponse } from "./types";

const BADGE_ATTR = "data-parrot-badge";

type BadgeStatus = "owned" | "not-owned" | "error";

// Plex chevron icon as inline SVG (extracted from official logo)
const PLEX_ICON_SVG = (fill: string) =>
  `<svg viewBox="100 10 35 48" width="14" height="14" style="vertical-align:middle;flex-shrink:0"><polygon points="117.9,33.9 104.1,13.5 118.3,13.5 132,33.9 118.3,54.2 104.1,54.2" fill="${fill}"/></svg>`;

const STYLES: Record<BadgeStatus, { bg: string; color: string; border: string; icon: string }> = {
  owned: { bg: "#282828", color: "#fff", border: "#ebaf00", icon: "#ebaf00" },
  "not-owned": { bg: "#3a3a3a", color: "#888", border: "#555", icon: "#888" },
  error: { bg: "#f44336", color: "#fff", border: "#d32f2f", icon: "#fff" },
};

function applyStyles(el: HTMLElement, status: BadgeStatus) {
  const s = STYLES[status];
  Object.assign(el.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    padding: "1px 6px 1px 4px",
    borderRadius: "10px",
    fontSize: "11px",
    fontWeight: "600",
    lineHeight: "1.3",
    backgroundColor: s.bg,
    color: s.color,
    border: `1px solid ${s.border}`,
    marginLeft: "8px",
    verticalAlign: "middle",
    fontFamily: "system-ui, -apple-system, sans-serif",
    whiteSpace: "nowrap",
  });
}

function setBadgeContent(badge: HTMLSpanElement, status: BadgeStatus) {
  const s = STYLES[status];
  if (status === "error") {
    badge.innerHTML = "";
    badge.textContent = "!";
  } else {
    badge.innerHTML = `${PLEX_ICON_SVG(s.icon)}<span style="margin-top:1px">Plex</span>`;
  }
}

export function createBadge(): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.setAttribute(BADGE_ATTR, "true");
  badge.style.display = "none";
  return badge;
}

export function updateBadge(badge: HTMLSpanElement, status: BadgeStatus) {
  setBadgeContent(badge, status);
  applyStyles(badge, status);
}

export function updateBadgeFromResponse(
  badge: HTMLSpanElement,
  response: CheckResponse,
) {
  const status = response.owned ? "owned" : "not-owned";

  if (response.owned && response.plexUrl) {
    // Replace span with a clickable <a> link
    const link = document.createElement("a");
    link.setAttribute(BADGE_ATTR, "true");
    link.href = response.plexUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.textDecoration = "none";
    link.style.cursor = "pointer";
    setBadgeContent(link as unknown as HTMLSpanElement, status);
    applyStyles(link, status);
    badge.replaceWith(link);
  } else {
    setBadgeContent(badge, status);
    applyStyles(badge, status);
  }
}

export function findExistingBadge(): HTMLSpanElement | null {
  return document.querySelector(`[${BADGE_ATTR}]`);
}

export function removeBadge() {
  findExistingBadge()?.remove();
}

export function injectBadge(anchor: Element): HTMLSpanElement {
  const existing = findExistingBadge();
  if (existing) return existing;

  const badge = createBadge();
  anchor.appendChild(badge);
  return badge;
}
