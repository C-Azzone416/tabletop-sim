/**
 * #448 — a player mid-#446's disconnect grace window has NOT left; a seat
 * showing them present is the accurate representation, not a compromise
 * (Caroline's ruling on #443, reaffirmed when this was deferred: "during
 * the window the player HAS NOT LEFT"). This is a nice-to-have that tells
 * everyone else "hang on a moment" — not a correctness signal, and it must
 * never read as an error or as the player having quit: transient and
 * expected, not alarming.
 *
 * Deliberately its own neutral treatment, distinct from every other status
 * badge already in the product: not Flip's Busted (danger-red — a real bad
 * outcome) or the platform's own active-turn/warning amber (DESIGN-APPENDIX
 * §7 — reserved for whose-turn-it-is). Reuses Flip's Frozen badge's exact
 * `info` token instead — the closest existing precedent for "temporarily
 * not fully here, nothing wrong" — plus a slow pulse so it reads as "in
 * progress" rather than a static warning label.
 *
 * Platform-level (not Flip- or Wire-specific) since #448 spans both games'
 * seat displays; lives alongside the other shared chrome rather than under
 * either game's own component tree.
 */
export function ReconnectingBadge() {
  return (
    <span
      title="Lost connection — give them a moment to come back"
      className="shrink-0 animate-pulse rounded-cab bg-info/15 px-1.5 py-0.5 text-xs font-medium text-info"
    >
      Reconnecting…
    </span>
  );
}
