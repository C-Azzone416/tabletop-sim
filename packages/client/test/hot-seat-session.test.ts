import { describe, expect, it } from "vitest";
import {
  buildHotSeatView,
  confirmHotSeat,
  createHotSeatSession,
  hotSeatBlindNil,
} from "../app/spades/hot-seat-session";

const instantBots = { random: () => 0, sleep: async () => {} };

describe("hot-seat Spades session", () => {
  it("hides the active hand until the named player confirms the handoff", async () => {
    let session = await createHotSeatSession({
      humans: [
        { id: "human:ben", name: "Ben" },
        { id: "human:caroline", name: "Caroline" },
      ],
      botDifficulties: ["normal", "hard"],
      targetScore: 250,
      random: () => 0,
    }, instantBots);

    expect(buildHotSeatView(session)?.hand).toEqual([]);
    session = confirmHotSeat(session, session.activeHumanSeat!);
    expect(buildHotSeatView(session)?.hand).toEqual([]);
  });

  it("passes privately between humans and reveals cards after blind-nil choices", async () => {
    let session = await createHotSeatSession({
      humans: [
        { id: "human:ben", name: "Ben" },
        { id: "human:caroline", name: "Caroline" },
      ],
      botDifficulties: ["easy", "normal"],
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
    expect(session.state.phase).toBe("bidding");
    session = confirmHotSeat(session, session.activeHumanSeat!);
    expect(buildHotSeatView(session)?.hand).toHaveLength(13);
  });

  it("keeps a solo player confirmed without pass-the-device interruptions", async () => {
    const session = await createHotSeatSession({
      humans: [{ id: "human:ben", name: "Ben" }],
      botDifficulties: ["easy", "normal", "hard"],
      targetScore: 250,
      random: () => 0,
    }, instantBots);

    expect(session.confirmedSeat).toBe(session.activeHumanSeat);
    await expect(hotSeatBlindNil(session, false, instantBots)).resolves.toBeDefined();
  });
});
