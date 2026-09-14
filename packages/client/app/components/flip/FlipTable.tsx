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
import { TableSeating } from "./TableSeating";
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

// #394 — Caroline's ruling: 45s total, countdown visible for the final 15s
// (C4's floor is >=10s; 15 clears it with margin). A judgement call, not a
// derived number — revisit after the first full game with real people.
// Kept next to FLIP_TURN_TIMEOUT_MS's own comment (message-handler.ts)
// rather than duplicated reasoning here.
const FLIP_TURN_COUNTDOWN_VISIBLE_MS = 15_000;

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
  /** #448 — player ids to show a "Reconnecting…" badge for in the seat rail; see SeatRail's own doc comment for why this is a separate prop rather than baked into toSeats/FlipSeat. */
  reconnectingIds?: readonly string[];
  /**
   * #494 — gates CardsRemaining; see FlipGameRoot's own doc comment on this
   * prop for the ruling. Threaded, not read from process.env here. Optional
   * (default false, matching the production-safe state) so tests unrelated
   * to this flag don't need to pass it explicitly.
   */
  devToolsEnabled?: boolean;
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
  reconnectingIds,
  devToolsEnabled = false,
}: FlipTableProps) {
  const [flattened, setFlattened] = useState(false);
  const [timeoutMessage, setTimeoutMessage] = useState<string | null>(null);
  const seats = toSeats(game);
  const isMyTurn = game.turnPlayerId === localPlayerId;
  // #434 — the opposite call from SeatRail's (types.ts's FlipSeat.isLeft
  // doc comment): a departed seat has no hand to show and nothing left to
  // do at the table, so it's dropped from the physical layout rather than
  // rendered empty. seatCount is derived from the same filtered list so
  // TableSeating's OPPONENT_POSITIONS sizing and PlaySurface's flatten
  // layout both track who's actually still seated, not the original count.
  const seatedPlayers = game.players.filter((player) => player.status !== "left");
  const seatCount = seatedPlayers.length as SeatCount;

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

  const { secondsRemaining } = useTurnCountdown({
    deadline: turnDeadline,
    onExpire: handleExpire,
    visibleForMs: FLIP_TURN_COUNTDOWN_VISIBLE_MS,
  });

  return (
    // #450 — pt-28 reserves top clearance for two fixed overlays GameClient
    // renders as siblings: the JoinCodeBadge (top-4 left-4, GameBoard.tsx
    // uses pt-14 for the same reason) and, at 400px width with 2 or 3
    // players specifically, the collapsed DevPanel toggle (top-40 right-4)
    // — TableSeating's top-right opponent card sat close enough to the top
    // of the table to land under it. pt-14 alone cleared the join code
    // badge but not the dev toggle; pt-28 is the smallest tested value that
    // clears both across every player count (2-5) at both 400px and desktop
    // widths. FlipTable never reserved either when it was built.
    <div className="flex flex-col gap-3 p-3 pt-28" data-game="flip">
      <SeatRail seats={seats} reconnectingIds={reconnectingIds} />

      <TurnCountdown secondsRemaining={secondsRemaining} />
      <TimeoutAnnouncement message={timeoutMessage} />

      <PlaySurface
        seatCount={seatCount}
        flattened={flattened}
        onToggleFlatten={() => setFlattened((f) => !f)}
        turnInProgress={game.phase === "round-in-progress" && isMyTurn}
      >
        <TableSeating players={seatedPlayers} localPlayerId={localPlayerId} />
      </PlaySurface>

      {/* #494 — Caroline's ruling: an exact shoe count does the counting FOR
          the player. Memory is a deliberate skill in this game (#362), and a
          real table gives you a shoe to eyeball, not a number — showing 91
          is strictly more information than the physical game offers, which
          undercuts the same principle #362 invoked to ban discard browsing.
          Dev-tools-only now, not normal play. */}
      {devToolsEnabled && <CardsRemaining count={game.shoe.length} />}

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
