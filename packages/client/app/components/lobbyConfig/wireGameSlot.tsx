"use client";

import { MissionSelector } from "../MissionSelector";
import { defineLobbyConfigSlot, type LobbyConfigPanelProps } from "./types";

/**
 * Wire Game's lobby config panel (#319).
 *
 * This is a relocation, not a redesign: the panel is the existing
 * `MissionSelector` with the heading and default that used to be inline in
 * `Lobby.tsx`. Behaviour, markup and classes are unchanged.
 */

/**
 * Matches the `wire-game` id in the shared game registry (#314/#322). Kept as
 * a local constant because that registry has not merged yet; once it has, this
 * should import `GameId` from `@tabletop/shared` instead of restating the
 * string.
 */
export const WIRE_GAME_ID = "wire-game";

export interface WireGameConfig {
  mission: number;
}

export function WireGameConfigPanel({
  config,
  onChange,
  canEdit,
  context,
}: LobbyConfigPanelProps<WireGameConfig>) {
  return (
    // `fieldset[disabled]` disables every control inside it natively, so the
    // read-only view needs no changes to MissionSelector itself.
    <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0 disabled:opacity-70">
      <MissionSelector
        selectedMission={config.mission}
        onSelectMission={(mission) => onChange({ mission })}
        highestUnlocked={context.highestUnlocked}
      />
    </fieldset>
  );
}

export const wireGameConfigSlot = defineLobbyConfigSlot<WireGameConfig>({
  gameId: WIRE_GAME_ID,
  title: "Select Mission",
  // Mission 1 was the lobby's hardcoded initial selection before #319.
  createDefaultConfig: () => ({ mission: 1 }),
  Panel: WireGameConfigPanel,
  startLabel: (config) => `Start Mission ${config.mission}`,
  // Wire Game's `start_game { mission }` shape, unchanged by this refactor.
  toStartArg: (config) => config.mission,
});
