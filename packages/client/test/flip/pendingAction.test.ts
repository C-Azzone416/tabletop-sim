import { describe, expect, it } from 'vitest';
import {
  ACTION_CARD_DISPLAY,
  describeLastEvent,
  eligibleTargetPlayers,
  isForcedSelfTarget,
  isValidTargetChoice,
  type FlipPendingTargetPlayer,
  type FlipResolutionEventView,
} from '../../app/components/flip/pendingAction';

const players: FlipPendingTargetPlayer[] = [
  { id: 'a', name: 'Alice', status: 'active' },
  { id: 'b', name: 'Bob', status: 'frozen' },
  { id: 'c', name: 'Cara', status: 'busted' },
  { id: 'd', name: 'Dee', status: 'active' },
];

describe('ACTION_CARD_DISPLAY', () => {
  it('gives Freeze, Flip 3, and Second Chance each their own icon and label', () => {
    const entries = Object.entries(ACTION_CARD_DISPLAY);
    expect(entries).toHaveLength(3);
    for (const [, display] of entries) {
      expect(display.icon).toBeTruthy();
      expect(display.label).toBeTruthy();
    }
    const icons = entries.map(([, d]) => d.icon);
    const labels = entries.map(([, d]) => d.label);
    expect(new Set(icons).size).toBe(3);
    expect(new Set(labels).size).toBe(3);
  });
});

describe('eligibleTargetPlayers', () => {
  it('returns only active players, ineligible players excluded', () => {
    expect(eligibleTargetPlayers(players).map((p) => p.id)).toEqual(['a', 'd']);
  });
});

describe('isValidTargetChoice', () => {
  it('accepts an active player and rejects a frozen or busted one', () => {
    expect(isValidTargetChoice(players, 'a')).toBe(true);
    expect(isValidTargetChoice(players, 'b')).toBe(false);
    expect(isValidTargetChoice(players, 'c')).toBe(false);
  });

  it('rejects an unknown player id', () => {
    expect(isValidTargetChoice(players, 'ghost')).toBe(false);
  });
});

describe('isForcedSelfTarget', () => {
  it('is true only when the flipper is the sole eligible player', () => {
    const onlyOneActive: FlipPendingTargetPlayer[] = [
      { id: 'a', name: 'Alice', status: 'active' },
      { id: 'b', name: 'Bob', status: 'frozen' },
    ];
    expect(isForcedSelfTarget(onlyOneActive, 'a')).toBe(true);
  });

  it('is false when other active players exist', () => {
    expect(isForcedSelfTarget(players, 'a')).toBe(false);
  });

  it('is false if the flipper themselves is not the sole eligible player (defensive)', () => {
    const onlyOneActive: FlipPendingTargetPlayer[] = [
      { id: 'a', name: 'Alice', status: 'active' },
      { id: 'b', name: 'Bob', status: 'frozen' },
    ];
    expect(isForcedSelfTarget(onlyOneActive, 'b')).toBe(false);
  });
});

describe('describeLastEvent', () => {
  it('returns null with no events', () => {
    expect(describeLastEvent([], players)).toBeNull();
  });

  it('explains each stop condition by the last logged event', () => {
    const cases: Array<[FlipResolutionEventView['effect'], RegExp]> = [
      ['number-busted', /busted/i],
      ['freeze-drawn', /freeze.*resolves first/i],
      ['number-flip7', /flip 7/i],
      ['second-chance-gained', /gained a second chance/i],
      ['second-chance-discarded', /already held a second chance/i],
      ['modifier-added', /added a modifier card/i],
    ];
    for (const [effect, pattern] of cases) {
      const events: FlipResolutionEventView[] = [{ targetId: 'a', effect, context: 'flip3' }];
      expect(describeLastEvent(events, players)).toMatch(pattern);
    }
  });

  it('explains a Second Chance save as the deal continuing, not stopping', () => {
    const events: FlipResolutionEventView[] = [{ targetId: 'a', effect: 'number-saved', context: 'flip3' }];
    expect(describeLastEvent(events, players)).toMatch(/continues/i);
  });

  // #401 — the engine emits the same 'flip3-drawn' effect for both a
  // genuinely nested draw (context 'flip3') and the outer, turn-opening
  // draw (context 'deal'/'hit', drawn as a player's own dealt/hit card).
  // Before the fix these were indistinguishable in the assertions — a
  // single test using context: 'flip3' passed whether or not context was
  // actually read, since the (buggy) hardcoded copy happened to be right
  // for that one case. Confirmed live before fixing: forcing context:
  // 'hit' through the pre-fix code returned the SAME "nested... outer flip
  // continues" text. These three cover every context the type allows, so
  // the wrong-case regression can't silently pass again.
  describe('flip3-drawn — context determines nested vs. outer (#401)', () => {
    it('describes a genuinely nested draw (context: flip3)', () => {
      const events: FlipResolutionEventView[] = [{ targetId: 'a', effect: 'flip3-drawn', context: 'flip3' }];
      expect(describeLastEvent(events, players)).toMatch(/nested Flip 3/i);
    });

    it('does not call it nested when drawn as the turn-opening deal', () => {
      const events: FlipResolutionEventView[] = [{ targetId: 'a', effect: 'flip3-drawn', context: 'deal' }];
      expect(describeLastEvent(events, players)).not.toMatch(/nested/i);
    });

    it('does not call it nested when drawn on an ordinary Hit', () => {
      const events: FlipResolutionEventView[] = [{ targetId: 'a', effect: 'flip3-drawn', context: 'hit' }];
      expect(describeLastEvent(events, players)).not.toMatch(/nested/i);
    });
  });

  it('only narrates the most recent event, not the whole history', () => {
    const events: FlipResolutionEventView[] = [
      { targetId: 'a', effect: 'number-saved', context: 'flip3' },
      { targetId: 'a', effect: 'number-added', context: 'flip3' },
    ];
    expect(describeLastEvent(events, players)).toMatch(/added a number card/i);
  });

  it('falls back to the player id if the player is unknown', () => {
    const events: FlipResolutionEventView[] = [{ targetId: 'ghost', effect: 'number-added', context: 'hit' }];
    expect(describeLastEvent(events, players)).toContain('ghost');
  });
});
