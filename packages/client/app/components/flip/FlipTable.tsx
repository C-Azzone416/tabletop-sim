"use client";

/**
 * #362 composition root: wires PlaySurface (C2), SeatRail, per-seat Hand,
 * TurnControls, PendingActionSlot, and CardsRemaining together against the
 * engine-types.ts draft shape.
 *
 * Not yet mounted into a route — GameClient.tsx routes by game type today
 * and Flip isn't in that switch (that's the next step once #360/#361 are
 * both on develop and there's a real useFlipGameState/useWebSocket pairing
 * to hand this `game` prop). This component is deliberately usable and
 * testable standalone before that wiring exists.
 */

import { useCallback, useState } from "react";
import { PlaySurface } from "./PlaySurface";
import { SeatRail } from "./SeatRail";
import { Hand } from "./Hand";
import { TurnControls } from "./TurnControls";
import { PendingActionSlot } from "./PendingActionSlot";
import { CardsRemaining } from "./CardsRemaining";
import { TurnCountdown } from "../TurnCountdown";
import { TimeoutAnnouncement } from "./TimeoutAnnouncement";
import { toSeats } from "./adapters";
import { useTurnCountdown } from "../../hooks/useTurnCountdown";
import { timeoutPromptKind, describeTimeout } from "./turnTimeout";
import type { FlipGameState } from "./engine-types";

type SeatCount = 2 | 3 | 4 | 5;

export interface FlipTableProps {
  game: FlipGameState;
  localPlayerId: string;
  onHit: () => void;
  onFreeze: () => void;
  /** Slot content for #363's targeting picker; omit to show the default waiting copy. */
  pendingActionUi?: React.ReactNode;
  /**
   * Contract C4 (#366): epoch ms the current prompt expires at, or null
   * while nothing is timed. Supplied by the caller — the deadline is
   * server-authoritative, not something this component invents.
   */
  turnDeadline?: number | null;
  /**
   * Self-targets the pending Freeze/Flip3 card on timeout (#358's ruled
   * default — going idle can never damage an opponent). Per bobcat's #363
   * call on `control` (2026-09-10 ~06:58Z): reuse the same granular
   * target-choice calls a manual click would make, just with the flipper's
   * own id — self-targeting is always a legal target to the engine, so
   * "timed out" and "clicked yourself" share one code path rather than a
   * second parallel entry point. The hit/freeze prompt's default
   * (auto-Freeze) is a different concern — base turn action expiring, not a
   * target choice — and stays on the existing `onFreeze` prop unchanged.
   */
  onChooseFreezeTarget?: (playerId: string) => void;
  onChooseFlip3Target?: (playerId: string) => void;
}

export function FlipTable({
  game,
  localPlayerId,
  onHit,
  onFreeze,
  pendingActionUi,
  turnDeadline = null,
  onChooseFreezeTarget,
  onChooseFlip3Target,
}: FlipTableProps) {
  const [flattened, setFlattened] = useState(false);
  const [timeoutMessage, setTimeoutMessage] = useState<string | null>(null);
  const seats = toSeats(game);
  const isMyTurn = game.turnPlayerId === localPlayerId;
  const seatCount = game.players.length as SeatCount;

  // A new prompt supersedes the last one's announcement. Adjusted during
  // render (React's endorsed pattern for resetting state on a prop change)
  // rather than in an effect, so there's no extra render tick where a stale
  // announcement is visible: https://react.dev/learn/you-might-not-need-an-effect
  const promptKey = `${game.turnPlayerId ?? ""}:${game.pendingAction?.kind ?? "none"}`;
  const [trackedPromptKey, setTrackedPromptKey] = useState(promptKey);
  if (promptKey !== trackedPromptKey) {
    setTrackedPromptKey(promptKey);
    setTimeoutMessage(null);
  }

  const handleExpire = useCallback(() => {
    const activePlayer = game.players.find((p) => p.id === game.turnPlayerId);
    if (!activePlayer) return;

    const kind = timeoutPromptKind(game.pendingAction);
    setTimeoutMessage(describeTimeout(kind, activePlayer.name, activePlayer.id === localPlayerId));

    // Self-target: the flipper targets themself, same as a manual click
    // would — never the platform inventing a "no-op" action of its own.
    switch (game.pendingAction?.kind) {
      case undefined:
        onFreeze();
        break;
      case "freeze":
        onChooseFreezeTarget?.(activePlayer.id);
        break;
      case "flip3":
        onChooseFlip3Target?.(activePlayer.id);
        break;
    }
  }, [
    game.players,
    game.turnPlayerId,
    game.pendingAction,
    localPlayerId,
    onFreeze,
    onChooseFreezeTarget,
    onChooseFlip3Target,
  ]);

  const { secondsRemaining } = useTurnCountdown({ deadline: turnDeadline, onExpire: handleExpire });

  return (
    <div className="flex flex-col gap-3 p-3" data-game="flip">
      <SeatRail seats={seats} />

      <TurnCountdown secondsRemaining={secondsRemaining} />
      <TimeoutAnnouncement message={timeoutMessage} />

      <PlaySurface
        seatCount={seatCount}
        flattened={flattened}
        onToggleFlatten={() => setFlattened((f) => !f)}
        turnInProgress={game.phase === "round-in-progress" && isMyTurn}
      >
        <div className="flex flex-col gap-3">
          {game.players.map((player) => (
            <div key={player.id}>
              <p className="mb-1 text-xs font-medium text-ink-muted">
                {player.id === localPlayerId ? "You" : player.name}
              </p>
              <Hand cards={player.hand} />
            </div>
          ))}
        </div>
      </PlaySurface>

      <CardsRemaining count={game.shoe.length} />

      <PendingActionSlot pendingAction={game.pendingAction}>{pendingActionUi}</PendingActionSlot>

      <TurnControls
        isMyTurn={isMyTurn}
        pendingAction={game.pendingAction}
        onHit={onHit}
        onFreeze={onFreeze}
      />
    </div>
  );
}
