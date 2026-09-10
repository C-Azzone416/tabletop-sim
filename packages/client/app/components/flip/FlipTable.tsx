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

import { useState } from "react";
import { PlaySurface } from "./PlaySurface";
import { SeatRail } from "./SeatRail";
import { Hand } from "./Hand";
import { TurnControls } from "./TurnControls";
import { PendingActionSlot } from "./PendingActionSlot";
import { CardsRemaining } from "./CardsRemaining";
import { toSeats } from "./adapters";
import type { FlipGameState } from "./engine-types";

type SeatCount = 2 | 3 | 4 | 5;

export interface FlipTableProps {
  game: FlipGameState;
  localPlayerId: string;
  onHit: () => void;
  onFreeze: () => void;
  /** Slot content for #363's targeting picker; omit to show the default waiting copy. */
  pendingActionUi?: React.ReactNode;
}

export function FlipTable({ game, localPlayerId, onHit, onFreeze, pendingActionUi }: FlipTableProps) {
  const [flattened, setFlattened] = useState(false);
  const seats = toSeats(game);
  const isMyTurn = game.turnPlayerId === localPlayerId;
  const seatCount = game.players.length as SeatCount;

  return (
    <div className="flex flex-col gap-3 p-3" data-game="flip">
      <SeatRail seats={seats} />

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
