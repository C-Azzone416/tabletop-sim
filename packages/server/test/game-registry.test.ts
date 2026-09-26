import { describe, expect, it } from "vitest";
import { GAME_REGISTRY, getGameById, isAvailableGameId, isAvailableRoomGameId } from "@tabletop/shared";

describe("game registry", () => {
  it("registers wire-game as available", () => {
    const wireGame = getGameById("wire-game");
    expect(wireGame).toMatchObject({ id: "wire-game", available: true });
  });

  it("registers Spades as available local hot-seat play", () => {
    const spades = getGameById("spades");
    expect(spades).toMatchObject({
      id: "spades",
      available: true,
      launchMode: "local",
      launchPath: "/spades/hot-seat",
      minPlayers: 4,
      maxPlayers: 4,
      playerCountLabel: "1–4 players",
    });
  });

  // #361 (epic #358). Registered ahead of being playable on purpose — the
  // #311 ruling renders an unavailable game greyed as "Coming soon" rather
  // than hiding it, so the entry has to exist for Flip to appear at all.
  // #402 — available since the real /play/host -> lobby -> start -> play walk
  // passed end to end in a clean production build. It was held at false
  // through all of #358's build-out, which caught #404, #406 and #407 — each
  // living in the real path a dev seed skips.
  // #436 — raised the floor from 2 to 3 players; 6 (the ceiling) is #439,
  // blocked on TableSeating's opponent-position table.
  it("registers flip as available, for 3-5 players", () => {
    expect(getGameById("flip")).toMatchObject({
      id: "flip",
      minPlayers: 3,
      maxPlayers: 5,
      available: true,
    });
  });

  it("gives flip a display name and description for its tile", () => {
    const flip = getGameById("flip");
    expect(flip?.displayName).toBeTruthy();
    expect(flip?.description).toBeTruthy();
  });

  // #358: "Flip" is a working title chosen precisely so we do not ship the
  // published game's name. Nothing player-visible may carry it.
  it("names no published game in flip's player-visible copy", () => {
    const flip = getGameById("flip");
    const copy = `${flip?.displayName} ${flip?.description}`.toLowerCase();
    expect(copy).not.toMatch(/seven|\b7\b/);
  });

  it("returns undefined for an unknown game id", () => {
    expect(getGameById("checkers")).toBeUndefined();
  });

  it("isAvailableGameId reflects the available flag", () => {
    expect(isAvailableGameId("wire-game")).toBe(true);
    expect(isAvailableGameId("flip")).toBe(true);
    expect(isAvailableGameId("spades")).toBe(true);
    expect(isAvailableGameId("checkers")).toBe(false);
  });

  it("allows only online-room games through create_game validation", () => {
    expect(isAvailableRoomGameId("wire-game")).toBe(true);
    expect(isAvailableRoomGameId("flip")).toBe(true);
    expect(isAvailableRoomGameId("spades")).toBe(false);
    expect(isAvailableRoomGameId("checkers")).toBe(false);
  });

  it("has no duplicate game ids (it is the create_game allowlist)", () => {
    const ids = GAME_REGISTRY.map((game) => game.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every registry entry has a valid player-count range", () => {
    for (const game of GAME_REGISTRY) {
      expect(game.minPlayers).toBeGreaterThanOrEqual(1);
      expect(game.maxPlayers).toBeGreaterThanOrEqual(game.minPlayers);
    }
  });

  it("is frozen at runtime, not just readonly at the type level (it's a security allowlist)", () => {
    expect(Object.isFrozen(GAME_REGISTRY)).toBe(true);
    for (const game of GAME_REGISTRY) {
      expect(Object.isFrozen(game)).toBe(true);
    }
    expect(() => {
      // @ts-expect-error — deliberately attempting a runtime mutation
      GAME_REGISTRY[0].available = true;
    }).toThrow(TypeError);
  });

  // #331 — Object.freeze is shallow: it locks an object's own property
  // SLOTS (no add/remove/reassign), but a value that is itself an
  // object/array is not frozen by that alone — someone could still mutate
  // THROUGH it. Every field is a primitive today, so the per-entry freeze
  // above happens to be a complete deep freeze — but that completeness is
  // a property of today's flat DATA, not something the code enforces, and
  // the test above would keep passing even if it stopped being true (it
  // only checks `Object.isFrozen(game)`, which stays true regardless of
  // what a nested value's own mutability is).
  //
  // This is the enforcement: the moment a future entry gains a nested
  // field, this fails LOUDLY. Deliberately not a recursive deepFreeze —
  // this registry is the runtime validation allowlist for a
  // client-supplied gameType (#313), and #314 already contemplates a
  // per-game config-panel/starter pointer (#216 too), either of which
  // would introduce nesting. Someone adding one should be stopped and
  // made to think about whether it can be attacker-influenced, not have
  // the tooling quietly absorb it into "frozen" and move on.
  it("keeps every registry entry field a primitive, so the per-entry freeze stays a genuine deep freeze", () => {
    for (const game of GAME_REGISTRY) {
      for (const [key, value] of Object.entries(game)) {
        expect(
          value === null || typeof value !== "object",
          `GAME_REGISTRY["${game.id}"].${key} is an object/array — Object.freeze(entry) does not freeze it. ` +
            "Either deep-freeze this field explicitly, or confirm it can never be mutated through a reference " +
            "an attacker controls before adding it to a security allowlist.",
        ).toBe(true);
      }
    }
  });
});
