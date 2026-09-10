/**
 * Cards-remaining count (#362 acceptance: "no discard browsing affordance
 * anywhere" — memory is a deliberate skill in this game). This is the only
 * information the discard/shoe exposes; there is deliberately no click
 * target here to open either pile.
 */
export interface CardsRemainingProps {
  count: number;
}

export function CardsRemaining({ count }: CardsRemainingProps) {
  return (
    <p className="tabular text-center text-sm text-ink-muted" data-testid="cards-remaining">
      {count} card{count === 1 ? "" : "s"} left in the shoe
    </p>
  );
}
