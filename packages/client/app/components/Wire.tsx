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

function colorBgClass(color: WireType["color"]): string {
  if (color === "blue") return "bg-blue-100 dark:bg-blue-900/30";
  if (color === "yellow") return "bg-yellow-100 dark:bg-yellow-900/30";
  return "bg-red-100 dark:bg-red-900/30";
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
  // #156: server only redacts value for another player's *hidden* wire —
  // `wire.value !== null` alone is the complete "safe to show" signal.
  const showValue = wire.value !== null;

  // #173 (Caroline's ruling, amends #159 item 4): cut wires are public
  // info and get ONE treatment everywhere, with or without an info token —
  // dim grey chip with the value shown plainly. No strikethrough, no solid
  // blue fill. The info-token blue survives only as the outline + blue
  // value on a PENDING (uncut) token wire; once the wire is cut the token
  // has resolved and the grey cut treatment wins. Info tokens are public
  // (placed face-up), so the pending treatment applies regardless of wire
  // ownership, not just the local player's rack.
  const infoToken = infoTokens[0];
  const hasInfoToken = !!infoToken;
  const hasPendingInfoToken = hasInfoToken && !isCut;
  const displayValue = wire.value ?? infoToken?.value ?? null;

  let borderClass: string;
  let bgClass: string;
  if (isCut) {
    borderClass = "border-zinc-300 dark:border-zinc-700";
    bgClass = "bg-zinc-100 dark:bg-zinc-800";
  } else if (isSelected) {
    borderClass = "border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700";
    bgClass = colorBgClass(wire.color);
  } else if (hasPendingInfoToken) {
    borderClass = "border-blue-500 dark:border-blue-400";
    bgClass = colorBgClass(wire.color);
  } else {
    borderClass = "border-zinc-300 dark:border-zinc-600";
    bgClass = colorBgClass(wire.color);
  }

  const valueTextClass = isCut
    ? "text-zinc-500 dark:text-zinc-400"
    : hasPendingInfoToken
      ? "text-blue-700 dark:text-blue-300"
      : "text-zinc-900 dark:text-zinc-100";

  return (
    <button
      onClick={onSelect}
      disabled={!onSelect || isCut}
      data-wire-color={wire.color}
      data-wire-position={wire.rackPosition}
      data-wire-status={wire.status}
      className={`
        relative flex flex-col items-center justify-center
        h-16 w-12 rounded-lg border-2 transition-all
        ${borderClass} ${bgClass}
        ${isSelectable && !isSelected ? "ring-1 ring-blue-200 dark:ring-blue-800" : ""}
        ${!isCut && onSelect ? "cursor-pointer hover:border-blue-400 hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-700" : "cursor-default"}
      `}
    >
      {(showValue || hasInfoToken) && displayValue !== null && (
        <span
          data-testid={hasInfoToken ? "wire-info-token" : undefined}
          className={`text-lg font-bold ${valueTextClass}`}
        >
          {displayValue}
        </span>
      )}
    </button>
  );
}
