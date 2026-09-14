/**
 * Cards-remaining count. Originally added under #362's acceptance ("no
 * discard browsing affordance anywhere — memory is a deliberate skill in
 * this game") as the single deliberate exception: no click target to open
 * either pile, but this one count.
 *
 * #494 — SUPERSEDED for normal play (Caroline, 2026-09-14): "we should not
 * show 91 cards left in the shoe... in /dev its fine but that shouldn't be
 * a normal showed item." An exact count does the counting FOR the player —
 * a real table gives you a shoe to eyeball, not a number, so showing it is
 * strictly more information than the physical game offers. That undercuts
 * the same #362 principle it was originally justified under, which is why
 * this reads as a reversal rather than a new rule.
 *
 * The component and this file stay live: it still renders under dev tools
 * (`FlipTable`'s `devToolsEnabled` prop gates the call site — this
 * component itself takes no position on when it should render). Do not
 * restore an unconditional render here on the strength of the paragraph
 * above; that paragraph describes why the count was once fine, not why it
 * is fine now.
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
