import { describe, expect, it } from "vitest";
import { GAME_REGISTRY, getGameById, isAvailableGameId } from "@tabletop/shared";

describe("game registry", () => {
  it("registers wire-game as available", () => {
    const wireGame = getGameById("wire-game");
    expect(wireGame).toMatchObject({ id: "wire-game", available: true });
  });

  it("registers spades as not yet available", () => {
    const spades = getGameById("spades");
    expect(spades).toMatchObject({ id: "spades", available: false });
  });

  // #361 (epic #358). 2-5 players per the spec's table sizing. Registered
  // ahead of being playable on purpose — the #311 ruling renders an
  // unavailable game greyed as "Coming soon" rather than hiding it, so the
  // entry has to exist for Flip to appear at all.
  it("registers flip as not yet available, for 2-5 players", () => {
    expect(getGameById("flip")).toMatchObject({
      id: "flip",
      minPlayers: 2,
      maxPlayers: 5,
      available: false,
    });
  });

  it("gives flip a display name and description for the Coming soon tile", () => {
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
    expect(isAvailableGameId("spades")).toBe(false);
    expect(isAvailableGameId("flip")).toBe(false);
    expect(isAvailableGameId("checkers")).toBe(false);
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
});
