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
// Wire identity has its own tokens (--wire-blue/-yellow/-red) as of
// Caroline's 2026-08-02 ruling. It used to borrow the p2/p3/p1 seat colors,
// which meant a wire could not be re-tinted without re-tinting a seat —
// see DESIGN-APPENDIX §3, which now permits the wire inventory. The hexes
// are unchanged by that split; only the ownership moved.
function valueColorClass(color: WireType["color"]): string {
  if (color === "blue") return "text-wire-blue";
  if (color === "yellow") return "text-wire-yellow";
  if (color === "red") return "text-wire-red";
  // null — shouldn't be reachable when a value is actually being displayed,
  // since color and value are redacted together (#187); kept as a safe
  // fallback rather than asserting.
  return "text-ink";
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
          rounded-full border-2 border-wire-yellow bg-wire-yellow/10 shadow-print-sm
          transition-all press
          ${isSelected ? "ring-2 ring-wire-yellow/40" : ""}
          ${isSelectable && !isSelected ? "ring-1 ring-wire-yellow/20" : ""}
          ${onSelect ? "cursor-pointer hover:ring-2 hover:ring-wire-yellow/40" : "cursor-default"}
        `
            : `
          flex h-16 w-16 shrink-0 items-center justify-center
          rounded-full border-2 border-wire-blue bg-wire-blue/10 text-lg font-bold
          text-wire-blue shadow-print-sm transition-all press
          ${isSelected ? "ring-2 ring-wire-blue/40" : ""}
          ${isSelectable && !isSelected ? "ring-1 ring-wire-blue/20" : ""}
          ${onSelect ? "cursor-pointer hover:ring-2 hover:ring-wire-blue/40" : "cursor-default"}
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
    // Selection is an interaction affordance, not wire identity — it stays on
    // the platform's --info token rather than moving to --wire-blue, so a
    // future blue re-tint can't silently change what "selected" looks like.
    // --info and the old --p2 are the same hex in both schemes, so this is
    // pixel-identical today.
    borderClass = "border-info ring-2 ring-info/40";
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
        h-16 w-12 rounded-piece border-2 transition-all shadow-print-sm
        ${borderClass} ${bgClass}
        ${isSelectable && !isSelected ? "ring-1 ring-info/20" : ""}
        ${!isCut && onSelect ? "cursor-pointer press hover:ring-2 hover:ring-info/40" : "cursor-default"}
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
