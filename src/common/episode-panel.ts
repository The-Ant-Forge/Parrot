import type { EpisodeGapResponse, SeasonGapInfo } from "./types";
import { createPanelContainer, createPanelHeader, createPanelRow, createStatusIcon } from "./panel-utils";

const PANEL_ATTR = "data-parrot-episodes";

type GapData = NonNullable<EpisodeGapResponse["gaps"]>;

interface SeasonGroup {
  type: "complete" | "missing" | "partial";
  startSeason: number;
  endSeason: number;
  ownedCount: number;
  totalCount: number;
  missingCount: number;
}

/** Group contiguous complete or fully-missing seasons into ranges. */
export function groupSeasons(seasons: SeasonGapInfo[]): SeasonGroup[] {
  const groups: SeasonGroup[] = [];

  for (const season of seasons) {
    const isComplete = season.missing.length === 0;
    const isMissing = season.ownedCount === 0;
    const type = isComplete ? "complete" : isMissing ? "missing" : "partial";

    const last = groups[groups.length - 1];
    if (last && last.type === type && type !== "partial") {
      // Extend the existing group
      last.endSeason = season.seasonNumber;
      last.ownedCount += season.ownedCount;
      last.totalCount += season.totalCount;
    } else {
      groups.push({
        type,
        startSeason: season.seasonNumber,
        endSeason: season.seasonNumber,
        ownedCount: season.ownedCount,
        totalCount: season.totalCount,
        missingCount: season.missing.length,
      });
    }
  }

  return groups;
}

function formatSeasonLabel(group: SeasonGroup): string {
  const range =
    group.startSeason === group.endSeason
      ? `S${group.startSeason}`
      : `S${group.startSeason} - S${group.endSeason}`;
  const count = `${group.ownedCount}/${group.totalCount}`;

  if (group.type === "complete") {
    return `${range}     ${count}`;
  }
  if (group.type === "missing") {
    return `${range}     ${count}  (missing all)`;
  }
  // partial
  return `${range}     ${count}  (missing ${group.missingCount})`;
}

export function createEpisodePanel(gaps: GapData, expanded = false): HTMLDivElement {
  const panel = createPanelContainer(PANEL_ATTR);

  const headerText = `${gaps.totalOwned} of ${gaps.totalEpisodes} episodes \u2014 ${gaps.completeSeasons} of ${gaps.totalSeasons} seasons full`;
  const { header, body } = createPanelHeader(headerText, expanded);

  const groups = groupSeasons(gaps.seasons);

  for (const group of groups) {
    const isComplete = group.type === "complete";
    const row = createPanelRow();
    row.appendChild(createStatusIcon(isComplete));

    const label = document.createElement("span");
    label.style.flex = "1";
    label.style.color = isComplete ? "#ddd" : "#777";
    label.textContent = formatSeasonLabel(group);

    row.appendChild(label);
    body.appendChild(row);
  }

  panel.appendChild(header);
  panel.appendChild(body);

  return panel;
}
