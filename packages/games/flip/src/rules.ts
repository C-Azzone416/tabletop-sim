import type { FlipCardInstance, FlipPlayerState } from './types';

/** True if `hand` already contains a number card equal to `value`. */
export function isDuplicateNumber(hand: readonly FlipCardInstance[], value: number): boolean {
  return hand.some((card) => card.kind === 'number' && card.value === value);
}

/** Players eligible as a Freeze or Flip 3 target: active only. */
export function eligibleTargets(players: readonly FlipPlayerState[]): readonly FlipPlayerState[] {
  return players.filter((player) => player.status === 'active');
}

/**
 * Next active seat strictly after `fromIndex`, walking clockwise, or null if
 * no seat is active (the round is over).
 */
export function nextActiveSeatIndex(players: readonly FlipPlayerState[], fromIndex: number): number | null {
  for (let step = 1; step <= players.length; step += 1) {
    const candidate = (fromIndex + step) % players.length;
    if (players[candidate]!.status === 'active') return candidate;
  }
  return null;
}

export function playerIndex(players: readonly FlipPlayerState[], playerId: string): number {
  const index = players.findIndex((player) => player.id === playerId);
  if (index === -1) throw new Error(`unknown player: ${playerId}`);
  return index;
}

