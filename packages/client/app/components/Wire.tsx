"use client";

import type { Wire as WireType, InfoToken } from "@tabletop/shared";

interface WireProps {
  wire: WireType;
  isLocal: boolean;
  isSelected: boolean;
  onSelect?: () => void;
  infoTokens: InfoToken[];
}

export function Wire({
  wire,
  isLocal,
  isSelected,
  onSelect,
  infoTokens,
}: WireProps) {
  const isCut = wire.status === "cut";
  const isHidden = wire.status === "hidden";
  const showValue = !isLocal && isHidden && wire.value !== null;

  return (
    <button
      onClick={onSelect}
      disabled={!onSelect || isCut}
      className={`
        relative flex flex-col items-center justify-center
        h-20 w-14 rounded-lg border-2 transition-all
        ${isCut ? "opacity-40 border-zinc-300 dark:border-zinc-700" : ""}
        ${isSelected ? "border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700" : "border-zinc-300 dark:border-zinc-600"}
        ${!isCut && onSelect ? "cursor-pointer hover:border-blue-400" : "cursor-default"}
        ${wire.color === "blue" ? "bg-blue-100 dark:bg-blue-900/30" : ""}
        ${wire.color === "yellow" ? "bg-yellow-100 dark:bg-yellow-900/30" : ""}
        ${wire.color === "red" ? "bg-red-100 dark:bg-red-900/30" : ""}
      `}
    >
      {isCut && (
        <span className="absolute text-2xl text-zinc-400">&#10005;</span>
      )}

      {showValue && (
        <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          {wire.value}
        </span>
      )}

      {isLocal && isHidden && (
        <span className="text-lg text-zinc-400">?</span>
      )}

      {infoTokens.length > 0 && (
        <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
          {infoTokens.length}
        </div>
      )}
    </button>
  );
}
