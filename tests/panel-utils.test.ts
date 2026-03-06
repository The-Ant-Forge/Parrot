// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { createPanelContainer, createPanelHeader, createPanelRow, createStatusIcon } from "../src/common/panel-utils";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("createPanelContainer", () => {
  it("creates a div with the given attribute", () => {
    const panel = createPanelContainer("data-test-panel");
    expect(panel.tagName).toBe("DIV");
    expect(panel.getAttribute("data-test-panel")).toBe("true");
  });

  it("applies dark background styling", () => {
    const panel = createPanelContainer("data-panel");
    expect(panel.style.backgroundColor).toBe("#282828");
    expect(panel.style.borderRadius).toBe("8px");
  });

  it("applies CSS reset properties", () => {
    const panel = createPanelContainer("data-panel");
    expect(panel.style.fontFamily).toContain("system-ui");
    expect(panel.style.textTransform).toBe("none");
  });
});

describe("createPanelHeader", () => {
  it("returns header and body elements", () => {
    const { header, body } = createPanelHeader("Test Header", false);
    expect(header.tagName).toBe("DIV");
    expect(body.tagName).toBe("DIV");
  });

  it("sets header text", () => {
    const { header } = createPanelHeader("Collection Gaps", false);
    expect(header.textContent).toContain("Collection Gaps");
  });

  it("starts collapsed when expanded=false", () => {
    const { body } = createPanelHeader("Test", false);
    expect(body.style.display).toBe("none");
  });

  it("starts expanded when expanded=true", () => {
    const { body } = createPanelHeader("Test", true);
    expect(body.style.display).toBe("block");
  });

  it("contains arrow indicator", () => {
    const { header } = createPanelHeader("Test", false);
    const arrow = header.querySelector("span");
    expect(arrow).not.toBeNull();
    expect(arrow?.textContent).toBe("\u25B8");
  });

  it("toggles body visibility on click", () => {
    const { header, body } = createPanelHeader("Test", false);
    expect(body.style.display).toBe("none");
    header.click();
    expect(body.style.display).toBe("block");
    header.click();
    expect(body.style.display).toBe("none");
  });
});

describe("createPanelRow", () => {
  it("creates a flex row div", () => {
    const row = createPanelRow();
    expect(row.tagName).toBe("DIV");
    expect(row.style.display).toBe("flex");
    expect(row.style.alignItems).toBe("center");
  });
});

describe("createStatusIcon", () => {
  it("shows checkmark for complete", () => {
    const icon = createStatusIcon(true);
    expect(icon.textContent).toBe("\u2713");
    expect(icon.style.color).toBe("#ebaf00");
  });

  it("shows X for incomplete", () => {
    const icon = createStatusIcon(false);
    expect(icon.textContent).toBe("\u2717");
    expect(icon.style.color).toBe("#666");
  });
});
