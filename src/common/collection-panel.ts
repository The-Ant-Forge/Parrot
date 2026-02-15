import type { CollectionCheckResponse } from "./types";

const PANEL_ATTR = "data-parrot-collection";

type CollectionData = NonNullable<CollectionCheckResponse["collection"]>;

export function removeCollectionPanel() {
  document.querySelector(`[${PANEL_ATTR}]`)?.remove();
}

export function createCollectionPanel(collection: CollectionData, expanded = false): HTMLDivElement {
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
  arrow.textContent = "\u25B8"; // ▸
  Object.assign(arrow.style, {
    fontSize: "12px",
    transition: "transform 0.15s",
    color: "#ebaf00",
    transform: expanded ? "rotate(90deg)" : "",
  });

  const headerText = document.createElement("span");
  headerText.textContent = `${collection.name} \u2014 ${collection.ownedMovies.length} of ${collection.totalMovies} owned`;
  Object.assign(headerText.style, {
    flex: "1",
    fontSize: "12px",
    fontWeight: "600",
  });

  header.appendChild(arrow);
  header.appendChild(headerText);

  // Body (movie list, collapsed by default)
  const body = document.createElement("div");
  Object.assign(body.style, {
    display: expanded ? "block" : "none",
    borderTop: "1px solid #444",
    padding: "4px 0",
  });

  // Build sorted movie list: owned first, then missing, each sorted by year
  const ownedEntries = collection.ownedMovies
    .map((m) => ({ ...m, owned: true as const }))
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  const missingEntries = collection.missingMovies
    .map((m) => ({
      title: m.title,
      year: m.releaseDate ? parseInt(m.releaseDate.slice(0, 4)) : undefined,
      tmdbId: m.tmdbId,
      owned: false as const,
    }))
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  const allEntries = [...ownedEntries, ...missingEntries]
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  for (const entry of allEntries) {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 12px",
      fontSize: "12px",
    });

    // Status icon
    const icon = document.createElement("span");
    if (entry.owned) {
      icon.textContent = "\u2713"; // ✓
      icon.style.color = "#ebaf00";
    } else {
      icon.textContent = "\u2717"; // ✗
      icon.style.color = "#666";
    }
    icon.style.fontSize = "13px";
    icon.style.flexShrink = "0";
    icon.style.width = "14px";
    icon.style.textAlign = "center";
    row.appendChild(icon);

    // Title + year
    const titleSpan = document.createElement("span");
    titleSpan.style.flex = "1";
    const yearStr = entry.year ? ` (${entry.year})` : "";
    titleSpan.textContent = `${entry.title}${yearStr}`;

    if (entry.owned) {
      titleSpan.style.color = "#ddd";
    } else {
      titleSpan.style.color = "#777";
    }
    row.appendChild(titleSpan);

    // Plex link for owned movies
    if (entry.owned && "plexUrl" in entry && entry.plexUrl) {
      const plexLink = document.createElement("a");
      plexLink.href = entry.plexUrl;
      plexLink.target = "_blank";
      plexLink.rel = "noopener noreferrer";
      plexLink.textContent = "Plex";
      Object.assign(plexLink.style, {
        color: "#ebaf00",
        textDecoration: "none",
        fontSize: "11px",
        flexShrink: "0",
      });
      row.appendChild(plexLink);
    }

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

export function injectCollectionPanel(anchor: Element, collection: CollectionData, expanded = false) {
  removeCollectionPanel();
  const panel = createCollectionPanel(collection, expanded);

  // Insert after the anchor's parent (typically after the title section)
  if (anchor.parentElement) {
    anchor.parentElement.insertBefore(panel, anchor.nextSibling);
  } else {
    anchor.appendChild(panel);
  }
}
