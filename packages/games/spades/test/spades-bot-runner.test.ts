import { describe, expect, it, vi } from 'vitest';
import {
  BOT_DELAY_MAX_MS,
  BOT_DELAY_MIN_MS,
  SPADES_SEATS,
  TRICK_RESOLUTION_DELAY_MS,
  botTurnDelay,
  nextSeat,
  runBotTurns,
  startSpadesGame,
  submitBid,
  submitBlindNilChoice,
  type SpadesGameState,
  type SpadesSeat,
} from '@tabletop/game-spades';
import type { CardInstance, StandardRank, StandardSuit } from '@tabletop/cards';

let cardSequence = 0;
const card = (suit: StandardSuit, rank: StandardRank): CardInstance => ({
  id: `runner:${cardSequence++}:${suit}:${rank}`,
  deckIndex: 0,
  suit,
  rank,
});

function playingState(): SpadesGameState {
  let state = startSpadesGame({
    humans: [{ id: 'human:ben', name: 'Ben' }],
    botDifficulties: ['easy', 'normal', 'hard'],
    targetScore: 250,
    random: () => 0,
  });
  for (const seat of SPADES_SEATS) state = submitBlindNilChoice(state, seat, false);
  while (state.phase === 'bidding') {
    state = submitBid(state, state.currentSeat!, { kind: 'normal', tricks: 1 });
  }
  return state;
}

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

  it('holds an already-resolved human trick before a bot leads the next one', async () => {
    const base = playingState();
    const botSeat = base.players.find((player) => player.isBot)!.seat;
    const sleep = vi.fn(async () => {});
    const state: SpadesGameState = {
      ...base,
      currentSeat: botSeat,
      currentTrick: { leader: botSeat, plays: [] },
      completedTricks: [{
        winner: botSeat,
        leadSuit: 'clubs',
        plays: SPADES_SEATS.map((seat) => ({ seat, card: card('clubs', '2') })),
      }],
    };

    await runBotTurns(state, { random: () => 0, sleep });
    expect(sleep).toHaveBeenNthCalledWith(1, TRICK_RESOLUTION_DELAY_MS);
    expect(sleep).toHaveBeenNthCalledWith(2, BOT_DELAY_MIN_MS);
  });

  it('holds the fourth card when a bot wins and is about to lead again', async () => {
    const base = playingState();
    const botSeat = base.players.find((player) => player.isBot)!.seat;
    const leader = nextSeat(botSeat);
    const second = nextSeat(leader);
    const third = nextSeat(second);
    const hands = { ...base.hands };
    for (const seat of SPADES_SEATS) hands[seat] = [card('hearts', '2')];
    hands[botSeat] = [card('clubs', 'ace'), card('spades', '2')];
    const sleep = vi.fn(async () => {});
    const state: SpadesGameState = {
      ...base,
      currentSeat: botSeat,
      hands,
      currentTrick: {
        leader,
        plays: [
          { seat: leader, card: card('clubs', '2') },
          { seat: second, card: card('clubs', '3') },
          { seat: third, card: card('clubs', '4') },
        ],
      },
      completedTricks: [],
    };

    await runBotTurns(state, { random: () => 0, sleep });
    expect(sleep).toHaveBeenNthCalledWith(1, BOT_DELAY_MIN_MS);
    expect(sleep).toHaveBeenNthCalledWith(2, TRICK_RESOLUTION_DELAY_MS);
  });
});
