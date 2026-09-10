/**
 * Pure decision/narration logic for #363 (Freeze / Flip 3 targeting).
 *
 * Deliberately local, narrow types rather than importing from
 * @tabletop/game-flip: as of this file, #362 (table UI) is not yet a PR and
 * #361's server action routes for hit/freeze/chooseFreezeTarget/
 * chooseFlip3Target don't exist yet, so there is nothing to wire this into
 * end-to-end. Keeping the shape local and matching the engine's own field
 * names (targetId/effect/context, mirroring FlipResolutionEvent; status,
 * mirroring FlipPlayerStatus) means swapping in the real engine types later
 * is a type-import change, not a rewrite — same boundary pattern SeatRail's
 * local FlipSeat used ahead of #360/#361 landing.
 */

export type FlipPlayerStatusView = 'active' | 'frozen' | 'busted';

export interface FlipPendingTargetPlayer {
  readonly id: string;
  readonly name: string;
  readonly status: FlipPlayerStatusView;
}

export type FlipActionCardKind = 'freeze' | 'flip3' | 'second-chance';

export type FlipResolutionEffectView =
  | 'number-added'
  | 'number-busted'
  | 'number-saved'
  | 'number-flip7'
  | 'modifier-added'
  | 'second-chance-gained'
  | 'second-chance-discarded'
  | 'freeze-drawn'
  | 'flip3-drawn';

export interface FlipResolutionEventView {
  readonly targetId: string;
  readonly effect: FlipResolutionEffectView;
  readonly context: 'deal' | 'hit' | 'flip3';
}

/**
 * Freeze, Flip 3 and Second Chance must each be identifiable without colour
 * (#363 acceptance criterion, ruling on #364/#369's palette question,
 * 2026-09-10): every one carries its own icon and its own label, never
 * colour alone.
 */
export const ACTION_CARD_DISPLAY: Readonly<Record<FlipActionCardKind, { readonly icon: string; readonly label: string }>> = {
  freeze: { icon: '❄', label: 'Freeze' },
  flip3: { icon: '➌', label: 'Flip 3' },
  'second-chance': { icon: '♥', label: 'Second Chance' },
};

/** Players eligible as a Freeze or Flip 3 target: active only. */
export function eligibleTargetPlayers(
  players: readonly FlipPendingTargetPlayer[],
): FlipPendingTargetPlayer[] {
  return players.filter((player) => player.status === 'active');
}

/** True when the flipper is the only eligible player — the UI should force self-target rather than offer a choice. */
export function isForcedSelfTarget(
  players: readonly FlipPendingTargetPlayer[],
  flipperId: string,
): boolean {
  const eligible = eligibleTargetPlayers(players);
  return eligible.length === 1 && eligible[0]!.id === flipperId;
}

export function isValidTargetChoice(
  players: readonly FlipPendingTargetPlayer[],
  targetId: string,
): boolean {
  return eligibleTargetPlayers(players).some((player) => player.id === targetId);
}

function playerName(players: readonly FlipPendingTargetPlayer[], id: string): string {
  return players.find((player) => player.id === id)?.name ?? id;
}

/**
 * A short, player-facing sentence for the most recent resolutionLog event —
 * what a Flip 3 stop condition or a Second Chance save/nested-Flip-3
 * continuation looked like, so "other players see the pause and the choice
 * being made, not a frozen screen" (#363 acceptance criteria).
 */
export function describeLastEvent(
  events: readonly FlipResolutionEventView[],
  players: readonly FlipPendingTargetPlayer[],
): string | null {
  if (events.length === 0) return null;
  const last = events[events.length - 1]!;
  const name = playerName(players, last.targetId);

  switch (last.effect) {
    case 'number-busted':
      return `${name} busted — 0 for the round, and the rest of that Flip 3 is skipped.`;
    case 'freeze-drawn':
      return 'A Freeze was drawn mid-Flip 3 — it resolves first, and the rest of that flip is skipped.';
    case 'number-flip7':
      return `${name} reached Flip 7! The round ends immediately.`;
    case 'number-saved':
      return `${name}'s Second Chance saved the draw — the Flip 3 continues.`;
    case 'flip3-drawn':
      return 'A nested Flip 3 was drawn — it resolves fully, then the outer flip continues.';
    case 'second-chance-gained':
      return `${name} gained a Second Chance.`;
    case 'second-chance-discarded':
      return `${name} already held a Second Chance — the new one was discarded.`;
    case 'modifier-added':
      return `${name} added a modifier card.`;
    case 'number-added':
      return `${name} added a number card.`;
  }
}
