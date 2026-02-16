/**
 * Shared utilities for gap detection panels (collection + episode).
 */

const ACCENT = "#ebaf00";

/** CSS reset properties to prevent host-site styles from bleeding in. */
const CSS_RESET = {
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontWeight: "400",
  fontStyle: "normal",
  lineHeight: "1.4",
  letterSpacing: "normal",
  wordSpacing: "normal",
  textTransform: "none",
  textDecoration: "none",
  textIndent: "0",
  textAlign: "left",
  textShadow: "none",
  whiteSpace: "normal",
} as const;

/** Create a styled panel container div. */
export function createPanelContainer(attr: string): HTMLDivElement {
  const panel = document.createElement("div");
  panel.setAttribute(attr, "true");
  Object.assign(panel.style, {
    ...CSS_RESET,
    borderRadius: "8px",
    border: "1px solid #444",
    backgroundColor: "#282828",
    fontSize: "13px",
    overflow: "hidden",
    width: "fit-content",
    maxWidth: "100%",
  });
  return panel;
}

/** Create a collapsible header with arrow, text, and body container. */
export function createPanelHeader(
  text: string,
  expanded: boolean,
): { header: HTMLDivElement; body: HTMLDivElement } {
  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    cursor: "pointer",
    userSelect: "none",
    color: "#ccc",
  });

  const arrow = document.createElement("span");
  arrow.textContent = "\u25B8"; // ▸
  Object.assign(arrow.style, {
    fontSize: "12px",
    transition: "transform 0.15s",
    color: ACCENT,
    transform: expanded ? "rotate(90deg)" : "",
  });

  const headerText = document.createElement("span");
  headerText.textContent = text;
  Object.assign(headerText.style, {
    flex: "1",
    fontSize: "12px",
    fontWeight: "600",
  });

  header.appendChild(arrow);
  header.appendChild(headerText);

  const body = document.createElement("div");
  Object.assign(body.style, {
    display: expanded ? "block" : "none",
    borderTop: "1px solid #444",
    padding: "4px 0",
  });

  // Toggle expand/collapse
  header.addEventListener("click", () => {
    const isHidden = body.style.display === "none";
    body.style.display = isHidden ? "block" : "none";
    arrow.style.transform = isHidden ? "rotate(90deg)" : "";
  });

  return { header, body };
}

/** Create a standard row for panel content. */
export function createPanelRow(): HTMLDivElement {
  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 12px",
    fontSize: "12px",
    lineHeight: "1.4",
    fontWeight: "400",
  });
  return row;
}

/** Create a status icon (checkmark or X). */
export function createStatusIcon(complete: boolean): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.textContent = complete ? "\u2713" : "\u2717";
  icon.style.color = complete ? ACCENT : "#666";
  icon.style.fontSize = "13px";
  icon.style.lineHeight = "1";
  icon.style.flexShrink = "0";
  icon.style.width = "14px";
  icon.style.textAlign = "center";
  return icon;
}

