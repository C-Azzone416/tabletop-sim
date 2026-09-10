/**
 * One player's hand, face up, for the whole round — every seat renders
 * this the same way, including the local player's own. #358: Flip has no
 * hidden state, so there is no "is this me" branch the way Wire's
 * PlayerRack has one.
 */

import { Card } from "./Card";
import type { FlipCardInstance } from "./engine-types";

export interface HandProps {
  cards: readonly FlipCardInstance[];
}

export function Hand({ cards }: HandProps) {
  if (cards.length === 0) {
    return (
      <p className="text-xs text-ink-muted" data-testid="hand-empty">
        No cards yet
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="hand">
      {cards.map((card) => (
        <Card key={card.id} card={card} />
      ))}
    </div>
  );
}
