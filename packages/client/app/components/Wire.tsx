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

// #190 (Caroline's ruling): yellow/red DO show their decimal as a tinted
// numeral on the owner's own rack, same as blue shows its number — the
// physical tiles have the decimal printed on them, and the rulebook's "no
// numeric value during play" line is about interaction semantics (yellow is
// cut by color, red is never cut, both server-enforced), not tile
// visibility. Without the numeral the ascending rack sort looks arbitrary
// to the one person who needs to read it. No suppression, any color.

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

  // #200 (Caroline's ruling): a pending info token needs to read as a
  // placed token, not a revealed wire — a circular "back-of-tile" chip
  // instead of the rectangular wire card, so it can't be mistaken for
  // cut/revealed styling at a glance. Once cut, #173's ruling already
  // retires this treatment in favor of the one shared cut look.
  //
  // #190 Phase B: a wrong-guess against a yellow wire places an InfoToken
  // with the 'YELLOW' sentinel value (game-engine.ts's tokenValue), reusing
  // this exact mechanism rather than a new wire-protocol shape. Yellow has
  // no numeric identity during play, so its indicator is outline-only —
  // same circular chip language as the numbered blue token, no number shown.
  if (hasPendingInfoToken) {
    const isYellowIndicator = infoToken.value === "YELLOW";
    return (
      <button
        onClick={onSelect}
        disabled={!onSelect}
        data-testid="wire-info-token"
        data-wire-color={wire.color}
        data-wire-position={wire.rackPosition}
        data-wire-status={wire.status}
        data-wire-value={displayValue ?? undefined}
        className={
          isYellowIndicator
            ? `
          flex h-16 w-16 shrink-0 items-center justify-center
          rounded-full border-2 border-yellow-500 bg-yellow-50 shadow-sm
          transition-all dark:border-yellow-400 dark:bg-yellow-950
          ${isSelected ? "ring-2 ring-yellow-300 dark:ring-yellow-700" : ""}
          ${isSelectable && !isSelected ? "ring-1 ring-yellow-200 dark:ring-yellow-800" : ""}
          ${onSelect ? "cursor-pointer hover:border-yellow-600 hover:ring-2 hover:ring-yellow-300 dark:hover:border-yellow-300 dark:hover:ring-yellow-700" : "cursor-default"}
        `
            : `
          flex h-16 w-16 shrink-0 items-center justify-center
          rounded-full border-2 border-blue-500 bg-blue-50 text-lg font-bold
          text-blue-700 shadow-sm transition-all
          dark:border-blue-400 dark:bg-blue-950 dark:text-blue-300
          ${isSelected ? "ring-2 ring-blue-300 dark:ring-blue-700" : ""}
          ${isSelectable && !isSelected ? "ring-1 ring-blue-200 dark:ring-blue-800" : ""}
          ${onSelect ? "cursor-pointer hover:border-blue-600 hover:ring-2 hover:ring-blue-300 dark:hover:border-blue-300 dark:hover:ring-blue-700" : "cursor-default"}
        `
        }
      >
        {isYellowIndicator ? null : displayValue}
      </button>
    );
  }

  // Reachable here only for wires with no pending info token: normal
  // hidden/revealed/cut treatment, colored per #188.
  // #190: "revealed" (e.g. reveal_reds, or the interim half of a dual-cut)
  // is a distinct resolved-but-not-cut state — it must not read as either
  // an untouched hidden tile or a cut tile, so it gets its own treatment
  // rather than falling through to the plain hidden styling.
  const isRevealed = wire.status === "revealed";
  let borderClass: string;
  if (isCut) {
    borderClass = "border-zinc-300 dark:border-zinc-700";
  } else if (isRevealed) {
    borderClass = "border-amber-400 dark:border-amber-600";
  } else if (isSelected) {
    borderClass = "border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700";
  } else {
    borderClass = "border-zinc-300 dark:border-zinc-600";
  }
  // #173's dim-grey cut treatment stays as the one bg exception to #188's
  // uniform neutral — it signals "resolved," not color. Revealed gets its
  // own light amber tint, between untouched-hidden and cut.
  const bgClass = isCut
    ? "bg-zinc-100 dark:bg-zinc-800"
    : isRevealed
      ? "bg-amber-50 dark:bg-amber-950"
      : "bg-white dark:bg-zinc-900";
  const valueTextClass = valueColorClass(wire.color);

  return (
    <button
      onClick={onSelect}
      disabled={!onSelect || isCut}
      data-wire-color={wire.color}
      data-wire-position={wire.rackPosition}
      data-wire-status={wire.status}
      data-wire-value={showValue && displayValue !== null ? displayValue : undefined}
      className={`
        relative flex flex-col items-center justify-center
        h-16 w-12 rounded-lg border-2 transition-all
        ${borderClass} ${bgClass}
        ${isSelectable && !isSelected ? "ring-1 ring-blue-200 dark:ring-blue-800" : ""}
        ${!isCut && onSelect ? "cursor-pointer hover:border-blue-400 hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-700" : "cursor-default"}
      `}
    >
      {showValue && displayValue !== null && (
        <span className={`text-lg font-bold ${valueTextClass}`}>
          {displayValue}
        </span>
      )}
    </button>
  );
}
