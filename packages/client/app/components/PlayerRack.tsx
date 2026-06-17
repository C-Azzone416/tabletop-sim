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
      className="flex gap-2 rounded-xl border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-700 dark:bg-zinc-800/50"
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
