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
  updateBadgeCompleteness,
} from "../src/common/badge";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("createBadge", () => {
  it("creates a span with data-parrot-badge attribute", () => {
    const badge = createBadge();
    expect(badge.tagName).toBe("SPAN");
    expect(badge.getAttribute("data-parrot-badge")).toBe("true");
  });

  it("starts hidden", () => {
    const badge = createBadge();
    expect(badge.style.display).toBe("none");
  });
});

describe("updateBadge", () => {
  it("applies owned styling", () => {
    const badge = createBadge();
    updateBadge(badge, "owned");
    expect(badge.style.backgroundColor).toBe("#282828");
    expect(badge.style.borderColor).toBe("#ebaf00");
    expect(badge.innerHTML).toContain("Plex");
    expect(badge.innerHTML).toContain("svg");
  });

  it("applies not-owned styling", () => {
    const badge = createBadge();
    updateBadge(badge, "not-owned");
    expect(badge.style.backgroundColor).toBe("#3a3a3a");
    expect(badge.style.borderColor).toBe("#555");
    expect(badge.innerHTML).toContain("Plex");
  });

  it("applies error styling with ! text", () => {
    const badge = createBadge();
    updateBadge(badge, "error", "Something went wrong");
    expect(badge.style.backgroundColor).toBe("#f44336");
    expect(badge.textContent).toBe("!");
    expect(badge.title).toBe("Something went wrong");
  });

  it("sets tooltip when provided", () => {
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
  it("shows error state with reason", () => {
    const badge = createBadge();
    showErrorBadge(badge, "Connection failed");
    expect(badge.textContent).toBe("!");
    expect(badge.title).toBe("Connection failed");
    expect(badge.style.backgroundColor).toBe("#f44336");
  });
});

describe("updateBadgeFromResponse", () => {
  it("shows not-owned badge for unowned media", () => {
    const badge = createBadge();
    document.body.appendChild(badge);
    updateBadgeFromResponse(badge, { owned: false });
    expect(badge.style.borderColor).toBe("#555");
    expect(badge.innerHTML).toContain("Plex");
  });

  it("shows owned badge without link when no plexUrl", () => {
    const badge = createBadge();
    document.body.appendChild(badge);
    updateBadgeFromResponse(badge, { owned: true });
    // Should remain a span (no replacement)
    expect(badge.tagName).toBe("SPAN");
    expect(badge.style.borderColor).toBe("#ebaf00");
  });

  it("replaces span with anchor when plexUrl is provided", () => {
    const container = document.createElement("div");
    const badge = createBadge();
    container.appendChild(badge);
    document.body.appendChild(container);

    updateBadgeFromResponse(badge, {
      owned: true,
      plexUrl: "https://app.plex.tv/desktop/#!/server/abc/details?key=123",
    });

    // The span should be replaced with an <a>
    const link = container.querySelector("a[data-parrot-badge]") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.href).toContain("plex.tv");
    expect(link.target).toBe("_blank");
    expect(link.style.borderColor).toBe("#ebaf00");
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

describe("updateBadgeCompleteness", () => {
  it("updates badge text to 'Plex : Complete'", () => {
    const badge = createBadge();
    document.body.appendChild(badge);
    updateBadge(badge, "owned");
    updateBadgeCompleteness("complete");
    const textSpan = badge.querySelector("span");
    expect(textSpan?.textContent).toBe("Plex : Complete");
  });

  it("updates badge text to 'Plex : Incomplete'", () => {
    const badge = createBadge();
    document.body.appendChild(badge);
    updateBadge(badge, "owned");
    updateBadgeCompleteness("incomplete");
    const textSpan = badge.querySelector("span");
    expect(textSpan?.textContent).toBe("Plex : Incomplete");
  });

  it("does nothing when no badge exists", () => {
    expect(() => updateBadgeCompleteness("complete")).not.toThrow();
  });
});
