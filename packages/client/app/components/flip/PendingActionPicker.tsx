"use client";

/**
 * #363's targeting UI — the content #362's PendingActionSlot renders via
 * FlipTable's `pendingActionUi` prop (see PendingActionSlot.tsx). Renders
 * for every player, not just the flipper: the flipper gets buttons, every
 * other player gets the same "who and what" copy so "other players see the
 * pause and the choice being made, not a frozen screen" (#363 AC).
 *
 * Reads `game.resolutionLog` (optional on the local engine-types.ts draft —
 * #360 always provides it) to narrate the most recent stop condition or
 * continuation, per the #363 AC on the Flip 3 interruption rulings.
 */

import { ACTION_CARD_DISPLAY, describeLastEvent, eligibleTargetPlayers, isForcedSelfTarget } from "./pendingAction";
import type { FlipGameState } from "./engine-types";

export interface PendingActionPickerProps {
  game: FlipGameState;
  localPlayerId: string;
  onChooseFreezeTarget: (targetId: string) => void;
  onChooseFlip3Target: (targetId: string) => void;
}

export function PendingActionPicker({
  game,
  localPlayerId,
  onChooseFreezeTarget,
  onChooseFlip3Target,
}: PendingActionPickerProps) {
  const pendingAction = game.pendingAction;
  if (!pendingAction) return null;

  const flipperId = game.turnPlayerId;
  const flipper = game.players.find((player) => player.id === flipperId);
  const display = ACTION_CARD_DISPLAY[pendingAction.kind];
  const eligible = eligibleTargetPlayers(game.players);
  const forcedSelf = flipperId !== null && isForcedSelfTarget(game.players, flipperId);
  const narration = describeLastEvent(game.resolutionLog ?? [], game.players);
  const isFlipper = localPlayerId === flipperId;

  const chooseTarget = pendingAction.kind === "freeze" ? onChooseFreezeTarget : onChooseFlip3Target;

  return (
    <div data-testid="flip-pending-action-picker" className="flex flex-col gap-2">
      <div className="flex items-center justify-center gap-2">
        <span aria-hidden className="text-lg leading-none">
          {display.icon}
        </span>
        <p className="text-sm font-medium text-ink">
          {display.label} — {isFlipper ? "choose a target" : `${flipper?.name ?? "a player"} is choosing a target`}
        </p>
      </div>

      {narration && (
        <p data-testid="flip-pending-action-narration" className="text-xs text-ink-muted">
          {narration}
        </p>
      )}

      {isFlipper && (
        <div className="flex flex-wrap justify-center gap-2" data-testid="flip-target-picker">
          {eligible.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => chooseTarget(player.id)}
              className="press rounded-cab border-2 border-outline bg-surface-raised px-4 py-2 text-sm font-medium text-ink shadow-print-sm"
            >
              {player.id === localPlayerId ? "Yourself" : player.name}
            </button>
          ))}
          {forcedSelf && (
            <p className="w-full text-xs text-ink-muted">You&apos;re the only eligible player — you must take it.</p>
          )}
        </div>
      )}
    </div>
  );
}
