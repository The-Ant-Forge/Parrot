import type { EpisodeGapResponse } from "./types";

const PANEL_ATTR = "data-parrot-episodes";

type GapData = NonNullable<EpisodeGapResponse["gaps"]>;

export function removeEpisodePanel() {
  document.querySelector(`[${PANEL_ATTR}]`)?.remove();
}

export function createEpisodePanel(gaps: GapData, expanded = false): HTMLDivElement {
  const panel = document.createElement("div");
  panel.setAttribute(PANEL_ATTR, "true");

  // Container styles
  Object.assign(panel.style, {
    marginTop: "8px",
    borderRadius: "8px",
    border: "1px solid #444",
    backgroundColor: "#282828",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "13px",
    overflow: "hidden",
    width: "fit-content",
    maxWidth: "100%",
  });

  // Header (clickable to expand/collapse)
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
  arrow.textContent = "\u25B8"; // >
  Object.assign(arrow.style, {
    fontSize: "12px",
    transition: "transform 0.15s",
    color: "#ebaf00",
    transform: expanded ? "rotate(90deg)" : "",
  });

  const headerText = document.createElement("span");
  headerText.textContent = `${gaps.totalOwned} of ${gaps.totalEpisodes} episodes \u2014 ${gaps.completeSeasons} of ${gaps.totalSeasons} seasons full`;
  Object.assign(headerText.style, {
    flex: "1",
    fontSize: "12px",
    fontWeight: "600",
  });

  header.appendChild(arrow);
  header.appendChild(headerText);

  // Body (season list, collapsed by default)
  const body = document.createElement("div");
  Object.assign(body.style, {
    display: expanded ? "block" : "none",
    borderTop: "1px solid #444",
    padding: "4px 0",
  });

  for (const season of gaps.seasons) {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 12px",
      fontSize: "12px",
    });

    const isComplete = season.missing.length === 0;

    // Status icon
    const icon = document.createElement("span");
    if (isComplete) {
      icon.textContent = "\u2713"; // checkmark
      icon.style.color = "#ebaf00";
    } else {
      icon.textContent = "\u2717"; // X
      icon.style.color = "#666";
    }
    icon.style.fontSize = "13px";
    icon.style.flexShrink = "0";
    icon.style.width = "14px";
    icon.style.textAlign = "center";
    row.appendChild(icon);

    // Season label
    const label = document.createElement("span");
    label.style.flex = "1";
    label.style.color = isComplete ? "#ddd" : "#777";

    const countStr = `${season.ownedCount}/${season.totalCount}`;
    if (isComplete) {
      label.textContent = `S${season.seasonNumber}     ${countStr}`;
    } else if (season.ownedCount === 0) {
      label.textContent = `S${season.seasonNumber}     ${countStr}  (missing all)`;
    } else {
      label.textContent = `S${season.seasonNumber}     ${countStr}  (missing ${season.missing.length})`;
    }

    row.appendChild(label);
    body.appendChild(row);
  }

  // Toggle expand/collapse
  header.addEventListener("click", () => {
    const isHidden = body.style.display === "none";
    body.style.display = isHidden ? "block" : "none";
    arrow.style.transform = isHidden ? "rotate(90deg)" : "";
  });

  panel.appendChild(header);
  panel.appendChild(body);

  return panel;
}

export function injectEpisodePanel(anchor: Element, gaps: GapData, expanded = false) {
  removeEpisodePanel();
  const panel = createEpisodePanel(gaps, expanded);

  // Insert after the anchor's parent (typically after the title section)
  if (anchor.parentElement) {
    anchor.parentElement.insertBefore(panel, anchor.nextSibling);
  } else {
    anchor.appendChild(panel);
  }
}
