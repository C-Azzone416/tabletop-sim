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

  it("returns undefined for an unknown game id", () => {
    expect(getGameById("checkers")).toBeUndefined();
  });

  it("isAvailableGameId reflects the available flag", () => {
    expect(isAvailableGameId("wire-game")).toBe(true);
    expect(isAvailableGameId("spades")).toBe(false);
    expect(isAvailableGameId("checkers")).toBe(false);
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
