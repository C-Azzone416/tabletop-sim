import { describe, expect, it } from 'vitest';
import {
  buildHotSeatView,
  confirmHotSeat,
  createHotSeatSession,
  hotSeatBlindNil,
} from '../app/spades/hot-seat-session';

const instantBots = { random: () => 0, sleep: async () => {} };

describe('hot-seat Spades session', () => {
  it('hides the active hand until the named player confirms the handoff', async () => {
    let session = await createHotSeatSession({
      humans: [
        { id: 'human:ben', name: 'Ben' },
        { id: 'human:caroline', name: 'Caroline' },
      ],
      botDifficulties: ['normal', 'hard'],
      targetScore: 250,
      random: () => 0,
    }, instantBots);

    expect(buildHotSeatView(session)?.hand).toEqual([]);
    session = confirmHotSeat(session, session.activeHumanSeat!);
    // Blind-nil phase never reveals cards, even after identity confirmation.
    expect(buildHotSeatView(session)?.hand).toEqual([]);
  });

  it('passes the device to each human privately and reveals cards only after all blind-nil choices', async () => {
    let session = await createHotSeatSession({
      humans: [
        { id: 'human:ben', name: 'Ben' },
        { id: 'human:caroline', name: 'Caroline' },
      ],
      botDifficulties: ['easy', 'normal'],
      targetScore: 250,
      random: () => 0,
    }, instantBots);

    const firstSeat = session.activeHumanSeat!;
    session = confirmHotSeat(session, firstSeat);
    session = await hotSeatBlindNil(session, false, instantBots);
    expect(session.activeHumanSeat).not.toBe(firstSeat);
    expect(buildHotSeatView(session)?.hand).toEqual([]);

    session = confirmHotSeat(session, session.activeHumanSeat!);
    session = await hotSeatBlindNil(session, false, instantBots);
    expect(session.state.phase).toBe('bidding');
    expect(buildHotSeatView(session)?.hand).toEqual([]);
    session = confirmHotSeat(session, session.activeHumanSeat!);
    expect(buildHotSeatView(session)?.hand).toHaveLength(13);
  });

  it('rejects input before the active person confirms possession of the device', async () => {
    const session = await createHotSeatSession({
      humans: [{ id: 'human:ben', name: 'Ben' }],
      botDifficulties: ['easy', 'normal', 'hard'],
      targetScore: 250,
      random: () => 0,
    }, instantBots);
    await expect(hotSeatBlindNil(session, false, instantBots)).rejects.toThrow(/confirm/);
  });
});
