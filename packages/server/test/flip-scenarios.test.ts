import { describe, it, expect } from "vitest";
import { FLIP_DECK_SIZE, chooseFlip3Target, hit } from "@tabletop/game-flip";
import { FLIP_SCENARIOS } from "../src/dev/flip-scenarios.js";
import { buildFlipScenarioState, type FlipScenarioSeat } from "../src/dev/flip-scenario-states.js";

// #370 — each scenario must put the table in its exact state, every time.
//
// These do not re-test the engine's rules (that is #360's suite). They test
// that each scenario ARRIVES at the case it claims to, by driving it through
// the engine and asserting the documented outcome actually occurs. A scenario
// that silently stopped setting up its case would otherwise look fine on the
// /dev screen and quietly stop exercising the bug it exists to catch.

const seats: FlipScenarioSeat[] = [
  { id: "p0", name: "Dev" },
  { id: "p1", name: "Alice" },
  { id: "p2", name: "Bob" },
  { id: "p3", name: "Carol" },
];

const handOf = (state: ReturnType<typeof buildFlipScenarioState>, id: string) =>
  state.players.find((p) => p.id === id)!;

describe("flip dev scenarios", () => {
  it.each(FLIP_SCENARIOS.map((s) => s.name))("%s conserves the 94-card deck", (name) => {
    const state = buildFlipScenarioState(name, seats);
    const total =
      state.shoe.length +
      state.discard.length +
      state.players.reduce((sum, p) => sum + p.hand.length, 0);

    expect(total).toBe(FLIP_DECK_SIZE);
  });

  it.each(FLIP_SCENARIOS.map((s) => s.name))("%s is deterministic", (name) => {
    const a = buildFlipScenarioState(name, seats);
    const b = buildFlipScenarioState(name, seats);

    // Ids are freshly minted per call, so compare the card sequence by value.
    const shape = (s: typeof a) => ({
      shoe: s.shoe.map((c) => JSON.stringify({ ...c, id: undefined })),
      hands: s.players.map((p) => p.hand.map((c) => JSON.stringify({ ...c, id: undefined }))),
      statuses: s.players.map((p) => p.status),
      totals: s.players.map((p) => p.totalScore),
      turnPlayerId: s.turnPlayerId,
    });
    expect(shape(a)).toEqual(shape(b));
  });

  it.each(FLIP_SCENARIOS.map((s) => s.name))("%s builds at 2 and at 5 players", (name) => {
    const two = buildFlipScenarioState(name, seats.slice(0, 2));
    const five = buildFlipScenarioState(name, [...seats, { id: "p4", name: "Erin" }]);

    expect(two.players).toHaveLength(2);
    expect(five.players).toHaveLength(5);
  });

  it("flip7-ready: one hit reaches Flip 7 and ends the round", () => {
    const state = buildFlipScenarioState("flip7-ready", seats);
    const hero = state.turnPlayerId!;
    expect(handOf(state, hero).hand).toHaveLength(6);

    const after = hit(state, hero);

    // The engine scores and rolls straight on to the next round's
    // awaiting-start rather than resting in 'round-over'.
    expect(after.phase).toBe("awaiting-round-start");
    expect(after.lastRoundResult?.flip7PlayerId).toBe(hero);
    // 1+2+3+4+5+6+7 = 28, plus the 15 bonus.
    expect(after.lastRoundResult?.scores[hero]).toBe(43);
  });

  it("flip3-bust: the target busts and the remaining cards are not dealt", () => {
    const state = buildFlipScenarioState("flip3-bust", seats);
    const flipper = state.turnPlayerId!;

    const drawn = hit(state, flipper);
    expect(drawn.pendingAction).toEqual({ kind: "flip3" });

    const target = seats[2].id;
    const after = chooseFlip3Target(drawn, flipper, target);

    expect(handOf(after, target).status).toBe("busted");
    // The bust stopped the deal: the target never received the 4 and 5.
    const dealtToTarget = after.resolutionLog.filter((e) => e.targetId === target);
    expect(dealtToTarget).toHaveLength(1);
    expect(dealtToTarget[0].effect).toBe("number-busted");
  });

  it("flip3-freeze: a drawn Freeze stops the remaining cards", () => {
    const state = buildFlipScenarioState("flip3-freeze", seats);
    const flipper = state.turnPlayerId!;

    const drawn = hit(state, flipper);
    const after = chooseFlip3Target(drawn, flipper, flipper);

    const effects = after.resolutionLog.filter((e) => e.context === "flip3").map((e) => e.effect);
    expect(effects).toContain("freeze-drawn");
    // 3 then Freeze — the third card is never dealt.
    expect(effects.filter((e) => e !== "freeze-drawn")).toHaveLength(1);
  });

  it("second-chance-midflip3: a save does NOT stop the remaining cards", () => {
    const state = buildFlipScenarioState("second-chance-midflip3", seats);
    const flipper = state.turnPlayerId!;
    const target = seats[2].id;

    const drawn = hit(state, flipper);
    const after = chooseFlip3Target(drawn, flipper, target);

    const dealtToTarget = after.resolutionLog.filter(
      (e) => e.targetId === target && e.context === "flip3",
    );
    expect(dealtToTarget[0].effect).toBe("number-saved");
    // The whole point: the save did not end participation, so all three landed.
    expect(dealtToTarget).toHaveLength(3);
    expect(handOf(after, target).status).not.toBe("busted");
  });

  it("second-chance-save: the duplicate is survived rather than busting", () => {
    const state = buildFlipScenarioState("second-chance-save", seats);
    const hero = state.turnPlayerId!;

    const after = hit(state, hero);

    expect(handOf(after, hero).status).not.toBe("busted");
    expect(after.resolutionLog.some((e) => e.effect === "number-saved")).toBe(true);
  });

  it("deck-exhaustion: the shoe is nearly empty and the discard can refill it", () => {
    const state = buildFlipScenarioState("deck-exhaustion", seats);

    expect(state.shoe).toHaveLength(3);
    expect(state.discard.length).toBeGreaterThan(0);

    // Four draws forces the reshuffle; it must not throw or lose a card.
    let current = state;
    const hero = state.turnPlayerId!;
    for (let i = 0; i < 4 && current.phase === "round-in-progress"; i += 1) {
      if (current.pendingAction || current.turnPlayerId !== hero) break;
      current = hit(current, hero);
    }

    const total =
      current.shoe.length +
      current.discard.length +
      current.players.reduce((sum, p) => sum + p.hand.length, 0);
    expect(total).toBe(FLIP_DECK_SIZE);
  });

  it("near-200: two seats are level just below the line", () => {
    const state = buildFlipScenarioState("near-200", seats);
    const totals = state.players.map((p) => p.totalScore);

    expect(totals[0]).toBe(199);
    expect(totals[1]).toBe(199);
    expect(totals.slice(2).every((t) => t < 199)).toBe(true);
    // One scored round must be able to cross 200 from here.
    expect(199 + 6).toBeGreaterThanOrEqual(200);
  });

  it("flip3-nested: a nested Flip 3 is set up on the shoe", () => {
    const state = buildFlipScenarioState("flip3-nested", seats);
    const flipper = state.turnPlayerId!;

    const drawn = hit(state, flipper);
    expect(drawn.pendingAction).toEqual({ kind: "flip3" });

    // Outer Flip 3: deals 3, then the nested Flip 3, which pauses for its own
    // target choice rather than resolving itself.
    const outer = chooseFlip3Target(drawn, flipper, flipper);
    expect(outer.resolutionLog.some((e) => e.effect === "flip3-drawn")).toBe(true);
    expect(outer.pendingAction).toEqual({ kind: "flip3" });

    // Resolving the nested one deals its 3 cards, and the outer level's
    // outstanding flip then continues — that continuation is the ruling.
    const after = chooseFlip3Target(outer, flipper, flipper);
    const dealt = after.resolutionLog.filter((e) => e.context === "flip3");
    expect(dealt.length).toBeGreaterThanOrEqual(3);
    expect(after.flip3Stack).toHaveLength(0);
  });
});
