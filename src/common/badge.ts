import type { CheckResponse } from "./types";

const BADGE_ATTR = "data-parrot-badge";
const PILL_CLASS = "parrot-pill";
const PLEX_LINK_CLASS = "parrot-plex-link";
const GAP_TOGGLE_CLASS = "parrot-gap-toggle";

type BadgeStatus = "owned" | "not-owned" | "error";

// Plex chevron icon as inline SVG (extracted from official logo)
function plexIconSvg(fill: string) {
  return `<svg viewBox="100 10 35 48" width="14" height="14" style="vertical-align:middle;flex-shrink:0"><polygon points="117.9,33.9 104.1,13.5 118.3,13.5 132,33.9 118.3,54.2 104.1,54.2" fill="${fill}"/></svg>`;
}

/** Create a styled Plex link element (icon + "Plex" text). */
function createPlexLink(url: string, iconColor: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = PLEX_LINK_CLASS;
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  Object.assign(link.style, {
    textDecoration: "none",
    cursor: "pointer",
    color: "inherit",
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    webkitTextStroke: "0",
  });
  link.innerHTML = `${plexIconSvg(iconColor)}<span style="margin-top:1px">Plex</span>`;
  return link;
}

const STYLES: Record<BadgeStatus, { bg: string; color: string; border: string; icon: string }> = {
  owned: { bg: "#282828", color: "#fff", border: "#ebaf00", icon: "#ebaf00" },
  "not-owned": { bg: "#3a3a3a", color: "#888", border: "#555", icon: "#888" },
  error: { bg: "#f44336", color: "#fff", border: "#d32f2f", icon: "#fff" },
};

// --- Module-level state for floating panel ---
let currentPanelElement: HTMLDivElement | null = null;
let clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
let panelVisible = false;
let currentPlexUrl: string | undefined;
let currentBadgeStatus: BadgeStatus = "not-owned";
let currentRatings: { tmdbRating?: number; imdbRating?: number } | null = null;
let currentGapData: GapPanelData | null = null;
let currentResolution: string | undefined;
let ratingsListenerSetup = false;

// --- Internal helpers ---

function applyPillStyles(el: HTMLElement, status: BadgeStatus) {
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
    verticalAlign: "middle",
    fontFamily: "system-ui, -apple-system, sans-serif",
    whiteSpace: "nowrap",
    webkitTextStroke: "0",
  });
}

function ensurePill(wrapper: HTMLElement): HTMLSpanElement {
  let pill = wrapper.querySelector<HTMLSpanElement>(`.${PILL_CLASS}`);
  if (!pill) {
    pill = document.createElement("span");
    pill.className = PILL_CLASS;
    wrapper.appendChild(pill);
  }
  return pill;
}

function getRatingText(): string {
  if (!currentRatings) return "";
  const values: number[] = [];
  if (currentRatings.tmdbRating && currentRatings.tmdbRating > 0) values.push(currentRatings.tmdbRating);
  if (currentRatings.imdbRating && currentRatings.imdbRating > 0) values.push(currentRatings.imdbRating);
  if (values.length === 0) return "";
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return avg.toFixed(1);
}

function createSeparator(): HTMLSpanElement {
  const sep = document.createElement("span");
  Object.assign(sep.style, { marginTop: "1px", opacity: "0.45" });
  sep.textContent = "·";
  return sep;
}

function createRatingSpan(): HTMLSpanElement | null {
  const text = getRatingText();
  if (!text) return null;
  const span = document.createElement("span");
  Object.assign(span.style, {
    marginTop: "1px",
    opacity: "0.8",
  });
  span.textContent = text;
  return span;
}

function setPillContent(pill: HTMLElement, status: BadgeStatus, plexUrl?: string) {
  pill.innerHTML = "";

  const s = STYLES[status];
  if (status === "error") {
    pill.textContent = "!";
    return;
  }

  if (status === "owned" && plexUrl) {
    pill.appendChild(createPlexLink(plexUrl, s.icon));
  } else {
    pill.innerHTML = `${plexIconSvg(s.icon)}<span style="margin-top:1px">Plex</span>`;
  }

  const ratingSpan = createRatingSpan();
  if (ratingSpan) {
    pill.appendChild(createSeparator());
    pill.appendChild(ratingSpan);
  }

  if (currentResolution && status === "owned") {
    pill.appendChild(createSeparator());
    const resSpan = document.createElement("span");
    Object.assign(resSpan.style, { marginTop: "1px", opacity: "0.8" });
    resSpan.textContent = currentResolution;
    pill.appendChild(resSpan);
  }
}

// --- Floating panel positioning ---

function positionPanel(wrapper: HTMLElement, panel: HTMLDivElement) {
  // Default: below, left-aligned
  Object.assign(panel.style, {
    position: "absolute",
    top: "100%",
    bottom: "",
    left: "0",
    right: "",
    marginTop: "4px",
    marginBottom: "",
    zIndex: "99999",
    minWidth: "280px",
    maxWidth: "400px",
    maxHeight: "400px",
    overflowY: "auto",
  });

  // Adjust after layout
  requestAnimationFrame(() => {
    const panelRect = panel.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // If panel extends below viewport, flip to above
    if (panelRect.bottom > viewportHeight) {
      panel.style.top = "";
      panel.style.bottom = "100%";
      panel.style.marginTop = "";
      panel.style.marginBottom = "4px";
    }

    // If panel extends past right edge, right-align
    if (panelRect.right > viewportWidth) {
      panel.style.left = "";
      panel.style.right = "0";
    }
  });
}

// --- Click-outside dismissal ---

function setupClickOutside(wrapper: HTMLElement) {
  if (clickOutsideHandler) teardownClickOutside();
  const handler = (e: MouseEvent) => {
    if (!wrapper.contains(e.target as Node)) {
      hidePanel();
    }
  };
  document.addEventListener("click", handler, true);
  clickOutsideHandler = handler;
}

function teardownClickOutside() {
  if (clickOutsideHandler) {
    document.removeEventListener("click", clickOutsideHandler, true);
    clickOutsideHandler = null;
  }
}

// --- Panel toggle ---

function showPanel() {
  const wrapper = findExistingBadge();
  if (!wrapper || !currentPanelElement) return;

  wrapper.appendChild(currentPanelElement);
  positionPanel(wrapper, currentPanelElement);
  panelVisible = true;

  const toggle = wrapper.querySelector<HTMLElement>(`.${GAP_TOGGLE_CLASS}`);
  if (toggle) toggle.setAttribute("aria-expanded", "true");

  setupClickOutside(wrapper);
}

function hidePanel() {
  if (currentPanelElement?.parentElement) {
    currentPanelElement.remove();
  }
  panelVisible = false;

  const wrapper = findExistingBadge();
  const toggle = wrapper?.querySelector<HTMLElement>(`.${GAP_TOGGLE_CLASS}`);
  if (toggle) toggle.setAttribute("aria-expanded", "false");

  teardownClickOutside();
}

function togglePanel() {
  if (panelVisible) {
    hidePanel();
  } else {
    showPanel();
  }
}

function resetPanelState() {
  hidePanel();
  currentPanelElement = null;
  currentPlexUrl = undefined;
}

// --- Exported API ---

export interface GapPanelData {
  state: "complete" | "incomplete";
  panelElement: HTMLDivElement;
  resolution?: string;
}

/** Create the stable badge wrapper (hidden initially). */
export function createBadge(): HTMLSpanElement {
  const wrapper = document.createElement("span");
  wrapper.setAttribute(BADGE_ATTR, "true");
  Object.assign(wrapper.style, {
    position: "relative",
    zIndex: "2147483647",
    display: "none",
    verticalAlign: "middle",
    marginLeft: "8px",
  });
  // Create inner pill
  const pill = document.createElement("span");
  pill.className = PILL_CLASS;
  wrapper.appendChild(pill);
  return wrapper;
}

/** Update badge with owned/not-owned/error status and optional tooltip. */
export function updateBadge(badge: HTMLSpanElement, status: BadgeStatus, tooltip?: string) {
  const pill = ensurePill(badge);
  setPillContent(pill, status);
  applyPillStyles(pill, status);
  badge.style.display = "inline-flex";
  badge.title = tooltip ?? "";
}

/** Show red error badge with tooltip. */
export function showErrorBadge(badge: HTMLSpanElement, reason: string) {
  const pill = ensurePill(badge);
  setPillContent(pill, "error");
  applyPillStyles(pill, "error");
  badge.style.display = "inline-flex";
  badge.title = reason;
}

/** Update badge from CHECK response. Stores plexUrl for later split-click. */
export function updateBadgeFromResponse(
  badge: HTMLSpanElement,
  response: CheckResponse,
) {
  const status = response.owned ? "owned" : "not-owned";
  currentPlexUrl = response.plexUrl;
  currentBadgeStatus = status;
  currentResolution = response.resolution;

  const pill = ensurePill(badge);
  setPillContent(pill, status, response.plexUrl);
  applyPillStyles(pill, status);
  badge.style.display = "inline-flex";
}

/**
 * Set gap data on the badge. Transitions to split-click mode:
 * "Plex" part links to Plex, ": Complete/Incomplete" part toggles the floating panel.
 */
export function setBadgeGapData(data: GapPanelData) {
  const wrapper = findExistingBadge();
  if (!wrapper) return;

  // Clean up any previous panel state
  hidePanel();
  currentPanelElement = data.panelElement;
  currentGapData = data;
  currentBadgeStatus = "owned";
  if (data.resolution) currentResolution = data.resolution;

  const pill = ensurePill(wrapper);
  const s = STYLES.owned;

  // Upgrade pill to owned styling (transitions gray → gold when collection data arrives)
  applyPillStyles(pill, "owned");

  // Rebuild pill content with split-click zones
  pill.innerHTML = "";

  // Left zone: Plex link (or plain text if no plexUrl)
  if (currentPlexUrl) {
    pill.appendChild(createPlexLink(currentPlexUrl, s.icon));
  } else {
    pill.innerHTML = `${plexIconSvg(s.icon)}<span style="margin-top:1px">Plex</span>`;
  }

  // Rating
  const ratingSpan = createRatingSpan();
  if (ratingSpan) {
    pill.appendChild(createSeparator());
    pill.appendChild(ratingSpan);
  }

  // Resolution
  if (currentResolution) {
    pill.appendChild(createSeparator());
    const resSpan = document.createElement("span");
    Object.assign(resSpan.style, { marginTop: "1px", opacity: "0.8" });
    resSpan.textContent = currentResolution;
    pill.appendChild(resSpan);
  }

  // Right zone: completeness toggle
  const toggle = document.createElement("span");
  toggle.className = GAP_TOGGLE_CLASS;
  toggle.setAttribute("aria-expanded", "false");
  Object.assign(toggle.style, {
    cursor: "pointer",
    marginTop: "1px",
  });
  pill.appendChild(createSeparator());
  toggle.textContent = data.state === "complete" ? "Complete" : "Incomplete";
  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePanel();
  });
  pill.appendChild(toggle);
}

/** Update ratings and re-render the badge pill. */
export function updateRatings(tmdbRating?: number, imdbRating?: number) {
  currentRatings = { tmdbRating, imdbRating };
  const wrapper = findExistingBadge();
  if (!wrapper) return;

  if (currentGapData) {
    // Re-render in split-click mode (preserves gap panel + toggle)
    setBadgeGapData(currentGapData);
  } else {
    // Re-render simple pill
    const pill = ensurePill(wrapper);
    setPillContent(pill, currentBadgeStatus, currentPlexUrl);
    applyPillStyles(pill, currentBadgeStatus);
  }
}

// Callback for when background discovers ownership via TMDB re-check
let ownershipUpdatedCallback: ((msg: OwnershipUpdatedMessage) => void) | null = null;

export interface OwnershipUpdatedMessage {
  owned: boolean;
  plexUrl?: string;
  mediaType: "movie" | "show";
  source: string;
  id: string;
}

/** Register a callback for when background flips ownership via TMDB re-check. */
export function onOwnershipUpdated(cb: (msg: OwnershipUpdatedMessage) => void) {
  ownershipUpdatedCallback = cb;
}

function setupRatingsListener() {
  if (ratingsListenerSetup) return;
  ratingsListenerSetup = true;
  try {
    browser.runtime.onMessage.addListener((message: {
      type: string;
      tmdbRating?: number;
      imdbRating?: number;
      owned?: boolean;
      plexUrl?: string;
      resolution?: string;
      mediaType?: string;
      source?: string;
      id?: string;
    }) => {
      if (message.type === "RATINGS_READY") {
        updateRatings(message.tmdbRating, message.imdbRating);
      } else if (message.type === "OWNERSHIP_UPDATED" && message.owned) {
        // Update the badge to "owned" state
        const wrapper = findExistingBadge();
        if (wrapper) {
          updateBadgeFromResponse(wrapper, {
            owned: true,
            plexUrl: message.plexUrl,
            resolution: message.resolution,
          });
        }
        // Notify content script callback for gap checking
        if (ownershipUpdatedCallback) {
          ownershipUpdatedCallback({
            owned: message.owned,
            plexUrl: message.plexUrl,
            mediaType: message.mediaType as "movie" | "show",
            source: message.source!,
            id: message.id!,
          });
        }
      }
    });
  } catch {
    // browser API unavailable (e.g. test environment)
  }
}

/** Find existing badge wrapper in DOM. */
export function findExistingBadge(): HTMLSpanElement | null {
  return document.querySelector(`[${BADGE_ATTR}]`);
}

/** Remove badge and clean up all associated state. */
export function removeBadge() {
  resetPanelState();
  currentRatings = null;
  currentGapData = null;
  currentResolution = undefined;
  currentBadgeStatus = "not-owned";
  findExistingBadge()?.remove();
}

/** Inject badge into anchor element (singleton — returns existing if found). */
export function injectBadge(anchor: Element): HTMLSpanElement {
  setupRatingsListener();

  const existing = findExistingBadge();
  if (existing) return existing;

  // Ensure anchor doesn't clip the floating gap panel
  const anchorStyle = getComputedStyle(anchor);
  if (anchorStyle.overflow !== "visible") {
    (anchor as HTMLElement).style.overflow = "visible";
  }

  const badge = createBadge();
  anchor.appendChild(badge);
  return badge;
}
