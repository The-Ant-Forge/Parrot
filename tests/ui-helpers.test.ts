// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { showFeedback, hideFeedback, setButtonLoading, formatTimestamp } from "../src/common/ui-helpers";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("showFeedback", () => {
  it("sets text, class, and unhides element", () => {
    const el = document.createElement("div") as HTMLDivElement;
    el.hidden = true;
    showFeedback(el, "Saved!", "success");
    expect(el.textContent).toBe("Saved!");
    expect(el.className).toBe("feedback success");
    expect(el.hidden).toBe(false);
  });

  it("applies error class", () => {
    const el = document.createElement("div") as HTMLDivElement;
    showFeedback(el, "Failed", "error");
    expect(el.className).toBe("feedback error");
  });

  it("applies info class", () => {
    const el = document.createElement("div") as HTMLDivElement;
    showFeedback(el, "Note", "info");
    expect(el.className).toBe("feedback info");
  });
});

describe("hideFeedback", () => {
  it("sets hidden to true", () => {
    const el = document.createElement("div") as HTMLDivElement;
    el.hidden = false;
    hideFeedback(el);
    expect(el.hidden).toBe(true);
  });
});

describe("setButtonLoading", () => {
  it("disables button and shows ellipsis when loading", () => {
    const btn = document.createElement("button");
    btn.textContent = "Save";
    setButtonLoading(btn, true);
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe("...");
    expect(btn.dataset.originalText).toBe("Save");
  });

  it("restores original text when not loading", () => {
    const btn = document.createElement("button");
    btn.textContent = "Save";
    setButtonLoading(btn, true);
    setButtonLoading(btn, false);
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe("Save");
  });
});

describe("formatTimestamp", () => {
  it("returns 'just now' for recent timestamps", () => {
    expect(formatTimestamp(Date.now())).toBe("just now");
  });

  it("returns minutes ago", () => {
    expect(formatTimestamp(Date.now() - 5 * 60_000)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    expect(formatTimestamp(Date.now() - 3 * 60 * 60_000)).toBe("3h ago");
  });

  it("returns days ago", () => {
    expect(formatTimestamp(Date.now() - 2 * 24 * 60 * 60_000)).toBe("2d ago");
  });

  it("returns 'just now' for less than 1 minute", () => {
    expect(formatTimestamp(Date.now() - 30_000)).toBe("just now");
  });
});
