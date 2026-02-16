// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  createBadge,
  updateBadge,
  updateBadgeFromResponse,
  showErrorBadge,
  findExistingBadge,
  injectBadge,
  removeBadge,
  setBadgeGapData,
} from "../src/common/badge";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("createBadge", () => {
  it("creates a wrapper span with data-parrot-badge attribute", () => {
    const badge = createBadge();
    expect(badge.tagName).toBe("SPAN");
    expect(badge.getAttribute("data-parrot-badge")).toBe("true");
  });

  it("has position relative for floating panel anchoring", () => {
    const badge = createBadge();
    expect(badge.style.position).toBe("relative");
  });

  it("contains an inner .parrot-pill span", () => {
    const badge = createBadge();
    const pill = badge.querySelector(".parrot-pill");
    expect(pill).not.toBeNull();
    expect(pill?.tagName).toBe("SPAN");
  });

  it("starts hidden", () => {
    const badge = createBadge();
    expect(badge.style.display).toBe("none");
  });
});

describe("updateBadge", () => {
  it("applies owned styling to inner pill", () => {
    const badge = createBadge();
    updateBadge(badge, "owned");
    const pill = badge.querySelector(".parrot-pill") as HTMLElement;
    expect(pill.style.backgroundColor).toBe("#282828");
    expect(pill.style.borderColor).toBe("#ebaf00");
    expect(pill.innerHTML).toContain("Plex");
    expect(pill.innerHTML).toContain("svg");
  });

  it("applies not-owned styling to inner pill", () => {
    const badge = createBadge();
    updateBadge(badge, "not-owned");
    const pill = badge.querySelector(".parrot-pill") as HTMLElement;
    expect(pill.style.backgroundColor).toBe("#3a3a3a");
    expect(pill.style.borderColor).toBe("#555");
    expect(pill.innerHTML).toContain("Plex");
  });

  it("applies error styling with ! text", () => {
    const badge = createBadge();
    updateBadge(badge, "error", "Something went wrong");
    const pill = badge.querySelector(".parrot-pill") as HTMLElement;
    expect(pill.style.backgroundColor).toBe("#f44336");
    expect(pill.textContent).toBe("!");
    expect(badge.title).toBe("Something went wrong");
  });

  it("sets tooltip on wrapper when provided", () => {
    const badge = createBadge();
    updateBadge(badge, "owned", "Found in library");
    expect(badge.title).toBe("Found in library");
  });

  it("clears tooltip when not provided", () => {
    const badge = createBadge();
    updateBadge(badge, "owned");
    expect(badge.title).toBe("");
  });
});

describe("showErrorBadge", () => {
  it("shows error state with reason on inner pill", () => {
    const badge = createBadge();
    showErrorBadge(badge, "Connection failed");
    const pill = badge.querySelector(".parrot-pill") as HTMLElement;
    expect(pill.textContent).toBe("!");
    expect(badge.title).toBe("Connection failed");
    expect(pill.style.backgroundColor).toBe("#f44336");
  });
});

describe("updateBadgeFromResponse", () => {
  it("shows not-owned styling on inner pill", () => {
    const badge = createBadge();
    document.body.appendChild(badge);
    updateBadgeFromResponse(badge, { owned: false });
    const pill = badge.querySelector(".parrot-pill") as HTMLElement;
    expect(pill.style.borderColor).toBe("#555");
    expect(pill.innerHTML).toContain("Plex");
  });

  it("shows owned styling without link when no plexUrl", () => {
    const badge = createBadge();
    document.body.appendChild(badge);
    updateBadgeFromResponse(badge, { owned: true });
    const pill = badge.querySelector(".parrot-pill") as HTMLElement;
    expect(pill.style.borderColor).toBe("#ebaf00");
    // No anchor inside pill
    expect(pill.querySelector("a")).toBeNull();
  });

  it("wrapper stays stable when plexUrl is provided (no replaceWith)", () => {
    const container = document.createElement("div");
    const badge = createBadge();
    container.appendChild(badge);
    document.body.appendChild(container);

    updateBadgeFromResponse(badge, {
      owned: true,
      plexUrl: "https://app.plex.tv/desktop/#!/server/abc/details?key=123",
    });

    // Wrapper span should still be in the container
    expect(container.querySelector("[data-parrot-badge]")).toBe(badge);
    expect(badge.tagName).toBe("SPAN");
  });

  it("creates plex link inside pill when plexUrl is provided", () => {
    const badge = createBadge();
    document.body.appendChild(badge);

    updateBadgeFromResponse(badge, {
      owned: true,
      plexUrl: "https://app.plex.tv/desktop/#!/server/abc/details?key=123",
    });

    const pill = badge.querySelector(".parrot-pill") as HTMLElement;
    const link = pill.querySelector(".parrot-plex-link") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.href).toContain("plex.tv");
    expect(link.target).toBe("_blank");
    expect(pill.style.borderColor).toBe("#ebaf00");
  });
});

describe("findExistingBadge", () => {
  it("returns null when no badge exists", () => {
    expect(findExistingBadge()).toBeNull();
  });

  it("finds an existing badge", () => {
    const badge = createBadge();
    document.body.appendChild(badge);
    expect(findExistingBadge()).toBe(badge);
  });
});

describe("removeBadge", () => {
  it("removes an existing badge from DOM", () => {
    const badge = createBadge();
    document.body.appendChild(badge);
    expect(findExistingBadge()).not.toBeNull();
    removeBadge();
    expect(findExistingBadge()).toBeNull();
  });

  it("does nothing when no badge exists", () => {
    expect(() => removeBadge()).not.toThrow();
  });

  it("cleans up panel state on removal", () => {
    const badge = createBadge();
    document.body.appendChild(badge);
    updateBadgeFromResponse(badge, {
      owned: true,
      plexUrl: "https://app.plex.tv/desktop/#!/server/abc/details?key=123",
    });

    const panel = document.createElement("div");
    setBadgeGapData({ state: "incomplete", panelElement: panel });

    // Open the panel
    const toggle = badge.querySelector(".parrot-gap-toggle") as HTMLElement;
    toggle.click();
    expect(badge.contains(panel)).toBe(true);

    // Remove badge — should clean up everything
    removeBadge();
    expect(findExistingBadge()).toBeNull();
    expect(document.body.contains(panel)).toBe(false);
  });
});

describe("injectBadge", () => {
  it("creates and appends badge to anchor", () => {
    const anchor = document.createElement("h1");
    anchor.textContent = "Test Title";
    document.body.appendChild(anchor);

    const badge = injectBadge(anchor);
    expect(badge.tagName).toBe("SPAN");
    expect(anchor.contains(badge)).toBe(true);
  });

  it("returns existing badge if one already exists", () => {
    const anchor = document.createElement("h1");
    document.body.appendChild(anchor);

    const first = injectBadge(anchor);
    const second = injectBadge(anchor);
    expect(first).toBe(second);
    // Only one badge in the DOM
    expect(document.querySelectorAll("[data-parrot-badge]").length).toBe(1);
  });
});

describe("setBadgeGapData", () => {
  function setupOwnedBadge(plexUrl?: string) {
    const badge = createBadge();
    document.body.appendChild(badge);
    updateBadgeFromResponse(badge, {
      owned: true,
      plexUrl: plexUrl ?? "https://app.plex.tv/desktop/#!/server/abc/details?key=123",
    });
    return badge;
  }

  it("adds Complete text to pill", () => {
    const badge = setupOwnedBadge();
    const panel = document.createElement("div");
    setBadgeGapData({ state: "complete", panelElement: panel });

    const toggle = badge.querySelector(".parrot-gap-toggle");
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toBe(" : Complete");
  });

  it("adds Incomplete text to pill", () => {
    const badge = setupOwnedBadge();
    const panel = document.createElement("div");
    setBadgeGapData({ state: "incomplete", panelElement: panel });

    const toggle = badge.querySelector(".parrot-gap-toggle");
    expect(toggle?.textContent).toBe(" : Incomplete");
  });

  it("preserves plex link as split-click zone", () => {
    const badge = setupOwnedBadge("https://app.plex.tv/desktop/#!/server/abc/details?key=123");
    const panel = document.createElement("div");
    setBadgeGapData({ state: "complete", panelElement: panel });

    const link = badge.querySelector(".parrot-plex-link") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.href).toContain("plex.tv");
  });

  it("toggle click shows floating panel", () => {
    const badge = setupOwnedBadge();
    const panel = document.createElement("div");
    panel.textContent = "Panel content";
    setBadgeGapData({ state: "incomplete", panelElement: panel });

    // Panel should not be in DOM yet
    expect(badge.contains(panel)).toBe(false);

    // Click toggle to show panel
    const toggle = badge.querySelector(".parrot-gap-toggle") as HTMLElement;
    toggle.click();
    expect(badge.contains(panel)).toBe(true);
  });

  it("toggle click again hides floating panel", () => {
    const badge = setupOwnedBadge();
    const panel = document.createElement("div");
    setBadgeGapData({ state: "incomplete", panelElement: panel });

    const toggle = badge.querySelector(".parrot-gap-toggle") as HTMLElement;

    // Show
    toggle.click();
    expect(badge.contains(panel)).toBe(true);

    // Hide
    toggle.click();
    expect(badge.contains(panel)).toBe(false);
  });

  it("click outside dismisses panel", () => {
    const badge = setupOwnedBadge();
    const panel = document.createElement("div");
    setBadgeGapData({ state: "incomplete", panelElement: panel });

    const toggle = badge.querySelector(".parrot-gap-toggle") as HTMLElement;
    toggle.click();
    expect(badge.contains(panel)).toBe(true);

    // Click outside the badge wrapper
    document.body.click();
    expect(badge.contains(panel)).toBe(false);
  });

  it("sets aria-expanded on toggle", () => {
    const badge = setupOwnedBadge();
    const panel = document.createElement("div");
    setBadgeGapData({ state: "complete", panelElement: panel });

    const toggle = badge.querySelector(".parrot-gap-toggle") as HTMLElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("does nothing when no badge exists", () => {
    const panel = document.createElement("div");
    expect(() => setBadgeGapData({ state: "complete", panelElement: panel })).not.toThrow();
  });
});
