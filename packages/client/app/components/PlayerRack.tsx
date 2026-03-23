"use client";

import type { Wire as WireType, InfoToken } from "@tabletop/shared";
import { Wire } from "./Wire";

interface PlayerRackProps {
  wires: WireType[];
  isLocal: boolean;
  selectedWireId: string | null;
  onSelectWire?: (wireId: string) => void;
  infoTokens: InfoToken[];
}

export function PlayerRack({
  wires,
  isLocal,
  selectedWireId,
  onSelectWire,
  infoTokens,
}: PlayerRackProps) {
  return (
    <div className="flex gap-2 rounded-xl border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      {wires.map((wire) => (
        <Wire
          key={wire.id}
          wire={wire}
          isLocal={isLocal}
          isSelected={selectedWireId === wire.id}
          onSelect={
            onSelectWire ? () => onSelectWire(wire.id) : undefined
          }
          infoTokens={infoTokens.filter((t) => t.wireId === wire.id)}
        />
      ))}
    </div>
  );
}
