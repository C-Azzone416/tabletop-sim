/**
 * A single face-up Flip card. Flip has no hidden state (#358) — every card
 * ever rendered by this component is face up, so unlike Wire's Wire.tsx
 * there is no concealed/face-down variant to branch on.
 *
 * Colour comes from the #369 --flip-* tokens (packages/client/styles/games/flip.css),
 * which only resolve under a [data-game="flip"] ancestor — see PlaySurface.
 * Second Chance pairs its colour with a heart glyph rather than leaning on
 * hue, and per Caroline's ruling on #369 (2026-09-10) this is now a hard
 * requirement for all three action cards, not just a nice-to-have: they
 * trigger a mandatory action and must read without colour.
 */

import type { FlipCardInstance } from "./engine-types";

// Literal class strings only — Tailwind's static scanner can't see a
// template-interpolated `bg-flip-num-${n}` class name (same constraint
// Wire.tsx works around with its own literal lookup table).
const NUMBER_CLASS: Record<number, string> = {
  0: "bg-flip-num-0 text-flip-num-0-ink",
  1: "bg-flip-num-1 text-flip-num-1-ink",
  2: "bg-flip-num-2 text-flip-num-2-ink",
  3: "bg-flip-num-3 text-flip-num-3-ink",
  4: "bg-flip-num-4 text-flip-num-4-ink",
  5: "bg-flip-num-5 text-flip-num-5-ink",
  6: "bg-flip-num-6 text-flip-num-6-ink",
  7: "bg-flip-num-7 text-flip-num-7-ink",
  8: "bg-flip-num-8 text-flip-num-8-ink",
  9: "bg-flip-num-9 text-flip-num-9-ink",
  10: "bg-flip-num-10 text-flip-num-10-ink",
  11: "bg-flip-num-11 text-flip-num-11-ink",
  12: "bg-flip-num-12 text-flip-num-12-ink",
};

const ACTION_LABEL: Record<string, string> = {
  freeze: "Freeze",
  flip3: "Flip 3",
  "second-chance": "2nd Chance",
};

const ACTION_ICON: Record<string, string> = {
  freeze: "❄",
  flip3: "↻",
  "second-chance": "♥",
};

export interface CardProps {
  card: FlipCardInstance;
}

export function Card({ card }: CardProps) {
  if (card.kind === "number") {
    return (
      <div
        data-testid={`card-${card.id}`}
        className={`flex h-20 w-14 items-center justify-center rounded-cab border-2 border-outline text-2xl font-bold shadow-print-sm ${NUMBER_CLASS[card.value]}`}
      >
        {card.value}
      </div>
    );
  }

  if (card.kind === "modifier") {
    return (
      <div
        data-testid={`card-${card.id}`}
        className="flex h-20 w-14 items-center justify-center rounded-cab border-2 border-outline bg-flip-boost text-base font-bold text-flip-boost-ink shadow-print-sm"
      >
        {card.modifier}
      </div>
    );
  }

  // action card — colour is never the only signal (#369 ruling): icon +
  // label always render alongside the fill.
  const bgClass =
    card.action === "freeze"
      ? "bg-flip-freeze text-flip-freeze-ink"
      : card.action === "flip3"
        ? "bg-flip-flip3 text-flip-flip3-ink"
        : "bg-flip-second-chance text-flip-second-chance-ink";

  return (
    <div
      data-testid={`card-${card.id}`}
      className={`flex h-20 w-14 flex-col items-center justify-center gap-1 rounded-cab border-2 border-outline text-center shadow-print-sm ${bgClass}`}
    >
      <span aria-hidden className="text-lg leading-none">
        {ACTION_ICON[card.action]}
      </span>
      <span className="text-[10px] font-semibold leading-tight">
        {ACTION_LABEL[card.action]}
      </span>
    </div>
  );
}
