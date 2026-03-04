import type { CollectionCheckResponse } from "./types";
import { createPanelContainer, createPanelHeader, createPanelRow, createStatusIcon } from "./panel-utils";

const PANEL_ATTR = "data-parrot-collection";

type CollectionData = NonNullable<CollectionCheckResponse["collection"]>;

export function createCollectionPanel(collection: CollectionData, expanded = false): HTMLDivElement {
  const panel = createPanelContainer(PANEL_ATTR);

  const headerText = `${collection.name} \u2014 ${collection.ownedMovies.length} of ${collection.totalMovies} owned`;
  const { header, body } = createPanelHeader(headerText, expanded);

  // Build sorted movie list: all entries sorted by year
  const ownedEntries = collection.ownedMovies
    .map((m) => ({ ...m, owned: true as const }))
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  const missingEntries = collection.missingMovies
    .map((m) => ({
      title: m.title,
      year: m.releaseDate ? parseInt(m.releaseDate.slice(0, 4), 10) : undefined,
      tmdbId: m.tmdbId,
      owned: false as const,
    }))
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  const allEntries = [...ownedEntries, ...missingEntries]
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  for (const entry of allEntries) {
    const row = createPanelRow();
    row.appendChild(createStatusIcon(entry.owned));

    const titleSpan = document.createElement("span");
    titleSpan.style.flex = "1";
    const yearStr = entry.year ? ` (${entry.year})` : "";
    titleSpan.textContent = `${entry.title}${yearStr}`;
    titleSpan.style.color = entry.owned ? "#ddd" : "#777";
    row.appendChild(titleSpan);

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
         webkitTextStroke: "0 !important",
      });
      row.appendChild(plexLink);
    }

    body.appendChild(row);
  }

  panel.appendChild(header);
  panel.appendChild(body);

  return panel;
}

