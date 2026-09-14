"use client";

/**
 * #422 — a bust used to be nearly silent: the busting card goes straight to
 * discard and the hand clears in the same engine step (game.ts's applyCard),
 * so the only trace was resolutionLog, which nothing rendered outside a
 * Freeze/Flip3 pending-action pause. Reading the table — who's holding what,
 * who just busted on which number — is core to this game's skill, so every
 * bust gets an explicit, dismissed-not-timed-out notice showing the actual
 * card, mirroring GameOverOverlay's blocking-scrim pattern rather than
 * ErrorToast's auto-lived one (a card worth remembering shouldn't be able to
 * disappear before you've read it).
 */

import { Card } from "./Card";
import type { FlipCardInstance } from "./engine-types";

export interface BustNoticeProps {
  playerName: string;
  isLocalPlayer: boolean;
  card: FlipCardInstance;
  /** 1-based position and total queue length, shown only when more than one bust is queued (e.g. a nested Flip 3 busting more than one player). */
  queuePosition?: { index: number; total: number };
  onDismiss: () => void;
}

export function BustNotice({ playerName, isLocalPlayer, card, queuePosition, onDismiss }: BustNoticeProps) {
  const cardLabel =
    card.kind === "number"
      ? `a ${card.value}`
      : card.kind === "modifier"
        ? `a ${card.modifier}`
        : "an action card";

  return (
    <div
      // The Card below reads --flip-num-* etc., which only resolve under a
      // [data-game="flip"] ancestor (Card.tsx's own doc comment) — this
      // notice is mounted as a FlipGameRoot-level sibling, not nested inside
      // FlipTable's own [data-game="flip"] wrapper, so it needs the scope
      // itself or the card renders in whatever the token falls back to.
      data-game="flip"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="bust-notice-heading"
    >
      <div
        data-testid="bust-notice"
        className="mx-4 w-full max-w-sm rounded-cab border-2 border-outline bg-surface-raised p-8 text-center shadow-print-md"
      >
        <div className="text-4xl" aria-hidden="true">
          💥
        </div>
        <h2 id="bust-notice-heading" className="mt-4 text-2xl font-bold text-danger">
          {isLocalPlayer ? "You busted!" : `${playerName} busted!`}
        </h2>
        <p className="mt-2 text-ink-muted">
          {isLocalPlayer ? "You" : playerName} drew {cardLabel} — a duplicate number. 0 for the round.
        </p>

        <div className="mt-5 flex justify-center">
          <Card card={card} />
        </div>

        {queuePosition && queuePosition.total > 1 && (
          <p className="mt-4 text-xs text-ink-muted">
            {queuePosition.index} of {queuePosition.total}
          </p>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="press mt-6 w-full min-h-11 rounded-cab border-2 border-outline bg-accent px-4 py-3 font-bold text-accent-ink shadow-print-sm"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
