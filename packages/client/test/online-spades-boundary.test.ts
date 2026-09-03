import { describe, expect, it } from 'vitest';
import {
  applySpadesPlayerAction,
  buildPrivateSpadesView,
  startSpadesGame,
  submitBlindNilChoice,
} from '@tabletop/shared';

describe('online Spades room boundary', () => {
  it('returns only the requesting human hand', () => {
    let state = startSpadesGame({
      humans: [
        { id: 'alice', name: 'Alice' },
        { id: 'bob', name: 'Bob' },
      ],
      botDifficulties: ['normal', 'hard'],
      targetScore: 250,
      random: () => 0.4,
    });
    for (const player of state.players.filter((candidate) => candidate.isBot)) {
      state = submitBlindNilChoice(state, player.seat, false);
    }
    // Human choices remain server-authoritative and private until all seats lock.
    state = applySpadesPlayerAction(state, 'alice', { type: 'blind-nil', blindNil: false });
    const aliceBefore = buildPrivateSpadesView(state, 'alice');
    expect(aliceBefore.view.hand).toHaveLength(0);

    state = applySpadesPlayerAction(state, 'bob', { type: 'blind-nil', blindNil: false });
    const alice = buildPrivateSpadesView(state, 'alice');
    const bob = buildPrivateSpadesView(state, 'bob');
    expect(alice.view.hand).toHaveLength(13);
    expect(bob.view.hand).toHaveLength(13);
    expect(alice.view.hand.map((card) => card.id)).not.toEqual(bob.view.hand.map((card) => card.id));
    expect(alice.view.opponentHandCounts[bob.seat]).toBe(13);
  });

  it('rejects actions from a player who is not seated', () => {
    const state = startSpadesGame({
      humans: [{ id: 'alice', name: 'Alice' }],
      targetScore: 250,
      random: () => 0.2,
    });
    expect(() => applySpadesPlayerAction(
      state,
      'intruder',
      { type: 'blind-nil', blindNil: false },
    )).toThrow('Player is not seated');
  });
});
