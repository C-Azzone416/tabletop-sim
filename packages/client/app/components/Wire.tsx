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

// Literal class strings per color, not interpolated — Tailwind's build-time
// scanner matches class names as literal substrings of the source, so a
// template-interpolated `border-wire-${color}` would never get generated.
const PENDING_TOKEN_RING_CLASSES: Record<"blue" | "yellow" | "red", string> = {
  blue: "border-wire-blue bg-wire-blue/10 text-wire-blue",
  yellow: "border-wire-yellow bg-wire-yellow/10 text-wire-yellow",
  red: "border-wire-red bg-wire-red/10 text-wire-red",
};
const PENDING_TOKEN_SELECTED_RING_CLASSES: Record<"blue" | "yellow" | "red", string> = {
  blue: "ring-2 ring-wire-blue/40",
  yellow: "ring-2 ring-wire-yellow/40",
  red: "ring-2 ring-wire-red/40",
};
const PENDING_TOKEN_SELECTABLE_RING_CLASSES: Record<"blue" | "yellow" | "red", string> = {
  blue: "ring-1 ring-wire-blue/20",
  yellow: "ring-1 ring-wire-yellow/20",
  red: "ring-1 ring-wire-red/20",
};
const PENDING_TOKEN_HOVER_RING_CLASSES: Record<"blue" | "yellow" | "red", string> = {
  blue: "cursor-pointer hover:ring-2 hover:ring-wire-blue/40",
  yellow: "cursor-pointer hover:ring-2 hover:ring-wire-yellow/40",
  red: "cursor-pointer hover:ring-2 hover:ring-wire-red/40",
};

// #281 (Caroline's ruling, both halves): hue means wire-identity or
// revealed-state, never selection. Revealed wires share ONE common border
// colour (--game-revealed, off the wire palette — see theme.css). Selected
// / selectable / hover stay on the wire's OWN hue, amplified — a heavier
// border/ring, never a separate hue. --warning and --info both come off
// the wire tile entirely; re-tinting them (Option 1) was rejected since
// they're platform tokens with many other consumers (buttons, badges,
// toasts, ActionPanel, GameBoard, Lobby, GameOverOverlay).
//
// Revealed still owns the border colour when a wire is ALSO selected (e.g.
// reveal_reds, or the #190 dual-cut interim) — selection only adds the ring
// on top, so the two treatments layer instead of fighting for the border.
//
// Literal class strings per color (see the PENDING_TOKEN_* comment above):
// Tailwind's build-time scanner needs each full class name to appear
// literally in the source, so these are keyed lookups, not interpolation.
const WIRE_HUE_BORDER_CLASSES: Record<"blue" | "yellow" | "red", string> = {
  blue: "border-wire-blue",
  yellow: "border-wire-yellow",
  red: "border-wire-red",
};
const WIRE_SELECTED_RING_CLASSES: Record<"blue" | "yellow" | "red", string> = {
  blue: "ring-2 ring-wire-blue/50",
  yellow: "ring-2 ring-wire-yellow/50",
  red: "ring-2 ring-wire-red/50",
};
const WIRE_SELECTABLE_RING_CLASSES: Record<"blue" | "yellow" | "red", string> = {
  blue: "ring-1 ring-wire-blue/25",
  yellow: "ring-1 ring-wire-yellow/25",
  red: "ring-1 ring-wire-red/25",
};
const WIRE_HOVER_RING_CLASSES: Record<"blue" | "yellow" | "red", string> = {
  blue: "hover:ring-2 hover:ring-wire-blue/50",
  yellow: "hover:ring-2 hover:ring-wire-yellow/50",
  red: "hover:ring-2 hover:ring-wire-red/50",
};
// A selectable/selected wire can have a redacted hue — an opponent's still-
// hidden wire, targeted for a dual-cut guess (#187 redacts color alongside
// value). There's no hue to amplify there, so emphasis falls back to the
// same neutral --outline the tile already borders with, amplified the same
// way a known hue would be.
const NEUTRAL_SELECTED_BORDER = "border-outline";
const NEUTRAL_SELECTED_RING = "ring-2 ring-outline/50";
const NEUTRAL_SELECTABLE_RING = "ring-1 ring-outline/25";
const NEUTRAL_HOVER_RING = "hover:ring-2 hover:ring-outline/50";

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
    // Info tokens don't redact color — the value's decimal suffix already
    // encodes it (WIRE_MASTER_SET convention: .1=yellow, .5=red, whole=blue)
    // — so styling derives from the token value rather than wire.color,
    // which stays redacted to null for an opponent's still-hidden wire even
    // once a token reveals its value.
    const tokenColor: "blue" | "yellow" | "red" = isYellowIndicator
      ? "yellow"
      : infoToken.value.endsWith(".1")
        ? "yellow"
        : infoToken.value.endsWith(".5")
          ? "red"
          : "blue";
    return (
      <button
        onClick={onSelect}
        disabled={!onSelect}
        data-testid="wire-info-token"
        data-wire-color={wire.color}
        data-wire-position={wire.rackPosition}
        data-wire-status={wire.status}
        data-wire-value={displayValue ?? undefined}
        className={`
          flex h-16 w-16 shrink-0 items-center justify-center
          rounded-full border-2 ${PENDING_TOKEN_RING_CLASSES[tokenColor]}
          text-lg font-bold shadow-print-sm
          transition-all press
          ${isSelected ? PENDING_TOKEN_SELECTED_RING_CLASSES[tokenColor] : ""}
          ${isSelectable && !isSelected ? PENDING_TOKEN_SELECTABLE_RING_CLASSES[tokenColor] : ""}
          ${onSelect ? PENDING_TOKEN_HOVER_RING_CLASSES[tokenColor] : "cursor-default"}
        `}
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

  // Border colour: cut/revealed own it outright; selection only repaints the
  // border on an otherwise-plain hidden tile, where nothing else is
  // claiming it (revealed already wins that slot above, per #281).
  let borderClass: string;
  if (isCut) {
    borderClass = "border-outline/30";
  } else if (isRevealed) {
    borderClass = "border-game-revealed";
  } else if (isSelected) {
    borderClass = wire.color
      ? WIRE_HUE_BORDER_CLASSES[wire.color]
      : NEUTRAL_SELECTED_BORDER;
  } else {
    borderClass = "border-outline/40";
  }
  // #173's dim-grey cut treatment stays as the one bg exception to #188's
  // uniform neutral — it signals "resolved," not color. Revealed gets its
  // own light tint, between untouched-hidden and cut.
  const bgClass = isCut
    ? "bg-outline/10"
    : isRevealed
      ? "bg-game-revealed/10"
      : "bg-game-table";
  const valueTextClass = valueColorClass(wire.color);

  // Emphasis ring: the wire's own hue, amplified — layered on top of
  // whichever border colour won above, so revealed + selected together keep
  // the shared revealed border with the wire's own hue ringed around it.
  const emphasisClass = isCut
    ? ""
    : isSelected
      ? wire.color
        ? WIRE_SELECTED_RING_CLASSES[wire.color]
        : NEUTRAL_SELECTED_RING
      : isSelectable
        ? wire.color
          ? WIRE_SELECTABLE_RING_CLASSES[wire.color]
          : NEUTRAL_SELECTABLE_RING
        : "";
  const hoverClass =
    !isCut && onSelect
      ? wire.color
        ? WIRE_HOVER_RING_CLASSES[wire.color]
        : NEUTRAL_HOVER_RING
      : "";

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
        ${borderClass} ${bgClass} ${emphasisClass}
        ${!isCut && onSelect ? `cursor-pointer press ${hoverClass}` : "cursor-default"}
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
