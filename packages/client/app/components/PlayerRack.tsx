"use client";

import type { Wire as WireType, InfoToken } from "@tabletop/shared";
import { Wire } from "./Wire";

interface PlayerRackProps {
  wires: WireType[];
  isLocal: boolean;
  selectedWireId?: string | null;
  selectedWireIds?: string[];
  selectableWireIds?: string[];
  onSelectWire?: (wireId: string) => void;
  infoTokens: InfoToken[];
}

export function PlayerRack({
  wires,
  isLocal,
  selectedWireId,
  selectedWireIds,
  selectableWireIds,
  onSelectWire,
  infoTokens,
}: PlayerRackProps) {
  return (
    <div
      data-testid="player-rack"
      // C6 "Dense private state" (DESIGN.md:44, issue #244). At max holdings —
      // 12 wires, the 2-player captain hand — on the 360px viewport floor, a
      // bare `flex` row does not wrap. Measured at 360px, the failure is NOT
      // the horizontal overflow #244 predicted: wire tiles carry no `shrink-0`,
      // so flexbox silently squeezed them from 48px to **23px** instead. That
      // is the 44x44 tap-target floor breached by half, and C6 names relaxing
      // that floor as the LAST resort — reached here without passing through
      // either of the two preferred steps.
      //
      // (Pending info-token chips do set `shrink-0`, so a rack holding those
      // overflows rather than shrinking. Same contract, two symptoms, one fix.)
      //
      // Wrapping is C6's stated first preference and resolves both: 2 rows,
      // tiles back at their full 48px, nothing overlapping. `gap-1.5` already
      // sets row-gap as well as column-gap, so wrapped rows inherit spacing.
      className={`flex flex-wrap gap-1.5 rounded-cab border-2 p-2 transition-colors ${
        // "Yellow means yours" (DESIGN.md) — the private surface is the only
        // one painted --game-rack; that's the privacy signal, so this must
        // never share styling with any other player's (shared/public) view.
        isLocal
          ? "border-game-rack-border bg-game-rack"
          : "border-outline/20 bg-game-table"
      }`}
    >
      {wires.map((wire) => {
        const isSelected =
          (selectedWireId != null && selectedWireId === wire.id) ||
          (selectedWireIds != null && selectedWireIds.includes(wire.id));
        const isSelectable =
          selectableWireIds != null && selectableWireIds.includes(wire.id);
        return (
          <Wire
            key={wire.id}
            wire={wire}
            isLocal={isLocal}
            isSelected={isSelected}
            isSelectable={isSelectable}
            onSelect={
              onSelectWire ? () => onSelectWire(wire.id) : undefined
            }
            infoTokens={infoTokens.filter((t) => t.wireId === wire.id)}
          />
        );
      })}
    </div>
  );
}
