"use client";

import type { Wire as WireType, InfoToken } from "@tabletop/shared";

interface WireProps {
  wire: WireType;
  isLocal: boolean;
  isSelected: boolean;
  isSelectable?: boolean;
  onSelect?: () => void;
  infoTokens: InfoToken[];
}

export function Wire({
  wire,
  isLocal,
  isSelected,
  isSelectable,
  onSelect,
  infoTokens,
}: WireProps) {
  const isCut = wire.status === "cut";
  // #156: the server only ever sends a non-null value when it's safe to
  // show — own wires regardless of status, or ANY non-hidden wire
  // regardless of owner (cut/revealed wires are public, face-up
  // information in the physical game). See state-broadcaster.ts's
  // buildPlayerView: it redacts value only for another player's *hidden*
  // wire. So `wire.value !== null` alone is the complete signal; do not
  // also gate on hidden/not-hidden — an earlier version of this line did
  // `!isHidden && value !== null`, which silently stopped showing the
  // local player's own hidden wire values (a real regression, caught
  // before merge).
  const showValue = wire.value !== null;

  return (
    <button
      onClick={onSelect}
      disabled={!onSelect || isCut}
      data-wire-color={wire.color}
      data-wire-position={wire.rackPosition}
      data-wire-status={wire.status}
      className={`
        relative flex flex-col items-center justify-center
        h-20 w-14 rounded-lg border-2 transition-all
        ${isCut ? "opacity-40 border-zinc-300 dark:border-zinc-700" : ""}
        ${isSelected ? "border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700" : "border-zinc-300 dark:border-zinc-600"}
        ${isSelectable && !isSelected ? "ring-1 ring-blue-200 dark:ring-blue-800" : ""}
        ${!isCut && onSelect ? "cursor-pointer hover:border-blue-400 hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-700" : "cursor-default"}
        ${wire.color === "blue" ? "bg-blue-100 dark:bg-blue-900/30" : ""}
        ${wire.color === "yellow" ? "bg-yellow-100 dark:bg-yellow-900/30" : ""}
        ${wire.color === "red" ? "bg-red-100 dark:bg-red-900/30" : ""}
      `}
    >
      {showValue && (
        <span
          className={`text-lg font-bold ${
            isCut
              ? "text-zinc-500 line-through decoration-2 dark:text-zinc-400"
              : "text-zinc-900 dark:text-zinc-100"
          }`}
        >
          {wire.value}
        </span>
      )}


      {infoTokens.length > 0 && (
        <div
          data-testid="wire-info-token"
          className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white"
        >
          {infoTokens[0]?.value ?? infoTokens.length}
        </div>
      )}
    </button>
  );
}
