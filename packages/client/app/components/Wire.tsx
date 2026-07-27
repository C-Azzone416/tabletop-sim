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
//
// This game's blue/yellow/red object palette is the platform's p2/p3/p1 seat
// colors (see DESIGN.md's brand palette) — the game-interior token layer's
// closed inventory is table/rack/accent/seat colors, so wire identity reuses
// seat tokens rather than introducing new ones.
function valueColorClass(color: WireType["color"]): string {
  if (color === "blue") return "text-p2";
  if (color === "yellow") return "text-p3";
  if (color === "red") return "text-p1";
  // null — shouldn't be reachable when a value is actually being displayed,
  // since color and value are redacted together (#187); kept as a safe
  // fallback rather than asserting.
  return "text-ink";
}

// #190: whether yellow/red should ever show their decimal as a numeral (vs.
// a bare color tile, decimal driving sort position only) is pending
// Caroline's confirm — the physical tiles have the decimal printed on them,
// which cuts against suppressing it even though the rulebook says it has no
// value during play. Holding at "always show" (pre-#190 behavior) until
// that ruling lands.

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
          rounded-full border-2 border-p3 bg-p3/10 shadow-print-sm
          transition-all press
          ${isSelected ? "ring-2 ring-p3/40" : ""}
          ${isSelectable && !isSelected ? "ring-1 ring-p3/20" : ""}
          ${onSelect ? "cursor-pointer hover:ring-2 hover:ring-p3/40" : "cursor-default"}
        `
            : `
          flex h-16 w-16 shrink-0 items-center justify-center
          rounded-full border-2 border-p2 bg-p2/10 text-lg font-bold
          text-p2 shadow-print-sm transition-all press
          ${isSelected ? "ring-2 ring-p2/40" : ""}
          ${isSelectable && !isSelected ? "ring-1 ring-p2/20" : ""}
          ${onSelect ? "cursor-pointer hover:ring-2 hover:ring-p2/40" : "cursor-default"}
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
    borderClass = "border-outline/30";
  } else if (isRevealed) {
    borderClass = "border-warning";
  } else if (isSelected) {
    borderClass = "border-p2 ring-2 ring-p2/40";
  } else {
    borderClass = "border-outline/40";
  }
  // #173's dim-grey cut treatment stays as the one bg exception to #188's
  // uniform neutral — it signals "resolved," not color. Revealed gets its
  // own light warning tint, between untouched-hidden and cut.
  const bgClass = isCut
    ? "bg-outline/10"
    : isRevealed
      ? "bg-warning/10"
      : "bg-game-table";
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
        h-16 w-12 rounded-lg border-2 transition-all shadow-print-sm
        ${borderClass} ${bgClass}
        ${isSelectable && !isSelected ? "ring-1 ring-p2/20" : ""}
        ${!isCut && onSelect ? "cursor-pointer press hover:ring-2 hover:ring-p2/40" : "cursor-default"}
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
