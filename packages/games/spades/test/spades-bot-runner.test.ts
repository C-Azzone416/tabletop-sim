import { describe, expect, it, vi } from 'vitest';
import {
  BOT_DELAY_MAX_MS,
  BOT_DELAY_MIN_MS,
  botTurnDelay,
  runBotTurns,
  startSpadesGame,
  submitBlindNilChoice,
} from '@tabletop/game-spades';

describe('bot turn pacing and automation', () => {
  it('keeps every bot action between 0.6 and 1.2 seconds', () => {
    expect(botTurnDelay(() => 0)).toBe(BOT_DELAY_MIN_MS);
    expect(botTurnDelay(() => 0.5)).toBe(900);
    expect(botTurnDelay(() => 1)).toBe(BOT_DELAY_MAX_MS);
  });

  it('locks bot blind-nil choices privately, then waits for the human', async () => {
    const sleep = vi.fn(async () => {});
    const onState = vi.fn();
    const initial = startSpadesGame({
      humans: [{ id: 'human:ben', name: 'Ben' }],
      botDifficulties: ['easy', 'normal', 'hard'],
      targetScore: 250,
      random: () => 0,
    });
    const humanSeat = initial.players.find((player) => !player.isBot)!.seat;
    const state = await runBotTurns(initial, { random: () => 0, sleep, onState });

    expect(state.phase).toBe('blind-nil');
    expect(state.blindNilChoices[humanSeat]).toBeUndefined();
    expect(Object.keys(state.blindNilChoices)).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(600);
    expect(onState).toHaveBeenCalledTimes(3);
  });

  it('continues bidding after the human locks a choice until human input is needed', async () => {
    const initial = startSpadesGame({
      humans: [{ id: 'human:ben', name: 'Ben' }],
      botDifficulties: ['easy', 'normal', 'hard'],
      targetScore: 250,
      random: () => 0,
    });
    const humanSeat = initial.players.find((player) => !player.isBot)!.seat;
    let state = await runBotTurns(initial, { random: () => 0, sleep: async () => {} });
    state = submitBlindNilChoice(state, humanSeat, false);
    state = await runBotTurns(state, { random: () => 0, sleep: async () => {} });

    expect(state.phase === 'bidding' || state.phase === 'playing').toBe(true);
    if (state.phase === 'bidding') expect(state.currentSeat).toBe(humanSeat);
    if (state.phase === 'playing') expect(state.currentSeat).toBe(humanSeat);
  });
});
