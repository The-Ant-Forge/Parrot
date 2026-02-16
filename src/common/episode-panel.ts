import type { EpisodeGapResponse } from "./types";
import { createPanelContainer, createPanelHeader, createPanelRow, createStatusIcon } from "./panel-utils";

const PANEL_ATTR = "data-parrot-episodes";

type GapData = NonNullable<EpisodeGapResponse["gaps"]>;

export function createEpisodePanel(gaps: GapData, expanded = false): HTMLDivElement {
  const panel = createPanelContainer(PANEL_ATTR);

  const headerText = `${gaps.totalOwned} of ${gaps.totalEpisodes} episodes \u2014 ${gaps.completeSeasons} of ${gaps.totalSeasons} seasons full`;
  const { header, body } = createPanelHeader(headerText, expanded);

  for (const season of gaps.seasons) {
    const isComplete = season.missing.length === 0;
    const row = createPanelRow();
    row.appendChild(createStatusIcon(isComplete));

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

  panel.appendChild(header);
  panel.appendChild(body);

  return panel;
}

