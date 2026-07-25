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

// #188 (Caroline's ruling, supersedes per-color backgrounds): every hidden
// tile back is one uniform neutral — no color leak via background even for
// your own rack, since the redacted broadcast (#187) means the client can no
// longer assume it always has real color data to paint with. The color
// signal moves entirely to the numeral instead.
function valueColorClass(color: WireType["color"]): string {
  if (color === "blue") return "text-blue-700 dark:text-blue-300";
  if (color === "yellow") return "text-yellow-700 dark:text-yellow-400";
  if (color === "red") return "text-red-700 dark:text-red-400";
  // null — shouldn't be reachable when a value is actually being displayed,
  // since color and value are redacted together (#187); kept as a safe
  // fallback rather than asserting.
  return "text-zinc-900 dark:text-zinc-100";
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
  if (isCut) {
    borderClass = "border-zinc-300 dark:border-zinc-700";
  } else if (isSelected) {
    borderClass = "border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700";
  } else if (hasPendingInfoToken) {
    borderClass = "border-blue-500 dark:border-blue-400";
  } else {
    borderClass = "border-zinc-300 dark:border-zinc-600";
  }
  // #173's dim-grey cut treatment stays as the one bg exception to #188's
  // uniform neutral — it signals "resolved," not color.
  const bgClass = isCut
    ? "bg-zinc-100 dark:bg-zinc-800"
    : "bg-white dark:bg-zinc-900";

  // #188: cut and own-rack wires now carry color on the numeral instead of
  // the background. Pending-info-token blue is a distinct UI signal (the
  // token itself, not the wire's real color) and keeps its own treatment.
  const valueTextClass = hasPendingInfoToken
    ? "text-blue-700 dark:text-blue-300"
    : valueColorClass(wire.color);

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
