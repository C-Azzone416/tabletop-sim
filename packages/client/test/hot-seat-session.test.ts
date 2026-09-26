import { describe, expect, it } from "vitest";
import {
  getLegalPlays,
} from "@tabletop/game-spades";
import {
  buildHotSeatView,
  confirmHotSeat,
  createHotSeatSession,
  hotSeatBlindNil,
  hotSeatBid,
  hotSeatContinueHand,
  hotSeatPlay,
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

  it("wires confirmed bids, legal card play, and the next-hand transition end to end", async () => {
    let session = await createHotSeatSession({
      humans: [{ id: "human:ben", name: "Ben" }],
      botDifficulties: ["easy", "normal", "hard"],
      targetScore: 250,
      random: () => 0.25,
    }, instantBots);

    session = await hotSeatBlindNil(session, false, instantBots);
    expect(session.state.phase).toBe("bidding");
    session = await hotSeatBid(session, { kind: "normal", tricks: 2 }, instantBots);

    let humanPlays = 0;
    while (session.state.phase === "playing") {
      const view = buildHotSeatView(session)!;
      const legal = getLegalPlays(view.hand, view.currentTrick, view.spadesBroken);
      expect(legal.length).toBeGreaterThan(0);
      session = await hotSeatPlay(session, legal[0]!.id, instantBots);
      humanPlays += 1;
    }

    expect(humanPlays).toBeGreaterThan(0);
    expect(session.state.phase).toBe("hand-complete");
    const completedHand = session.state.handNumber;
    session = await hotSeatContinueHand(session, instantBots);
    expect(session.state.phase).not.toBe("hand-complete");
    expect(session.state.handNumber).toBe(completedHand + 1);
  });
});
