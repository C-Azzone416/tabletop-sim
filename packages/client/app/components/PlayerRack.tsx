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
      className={`flex gap-1.5 rounded-xl border-2 p-2 transition-colors ${
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
