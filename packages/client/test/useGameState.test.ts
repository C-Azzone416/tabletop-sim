import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGameState } from "../app/hooks/useGameState";
import {
  makeGame,
  makePlayer,
  makeWire,
  makeTurn,
  resetIds,
} from "./fixtures";

describe("useGameState", () => {
  beforeEach(() => resetIds());

  it("starts with initial empty state", () => {
    const { result } = renderHook(() => useGameState());
    expect(result.current.state.game).toBeNull();
    expect(result.current.state.localPlayer).toBeNull();
    expect(result.current.state.players).toEqual([]);
    expect(result.current.state.wires).toEqual([]);
    expect(result.current.state.error).toBeNull();
  });

  it("handles game_created message", () => {
    const { result } = renderHook(() => useGameState());
    const game = makeGame({ id: "g1", captainId: "p1" });
    const player = makePlayer({ id: "p1", gameId: "g1", name: "Alice" });

    act(() => {
      result.current.handleMessage({ type: "game_created", game, player });
    });

    expect(result.current.state.game).toEqual(game);
    expect(result.current.state.localPlayer).toEqual(player);
    expect(result.current.state.players).toEqual([player]);
  });

  it("handles joined_game message", () => {
    const { result } = renderHook(() => useGameState());
    const game = makeGame({ id: "g1" });
    const player = makePlayer({ id: "p2", name: "Bob" });
    const players = [makePlayer({ id: "p1", name: "Alice" }), player];

    act(() => {
      result.current.handleMessage({ type: "joined_game", game, player, players });
    });

    expect(result.current.state.game).toEqual(game);
    expect(result.current.state.localPlayer).toEqual(player);
    expect(result.current.state.players).toEqual(players);
  });

  it("handles player_joined message", () => {
    const { result } = renderHook(() => useGameState());
    const game = makeGame({ id: "g1" });
    const alice = makePlayer({ id: "p1", name: "Alice" });
    const bob = makePlayer({ id: "p2", name: "Bob" });

    act(() => { result.current.handleMessage({ type: "game_created", game, player: alice }); });
    act(() => { result.current.handleMessage({ type: "player_joined", player: bob }); });

    expect(result.current.state.players).toHaveLength(2);
    expect(result.current.state.players[1]).toEqual(bob);
  });

  it("handles game_started message", () => {
    const { result } = renderHook(() => useGameState());
    const game = makeGame({ id: "g1", status: "setup" });
    const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
    const wires = [
      makeWire({ id: "w1", playerId: "p1", rackPosition: 0 }),
      makeWire({ id: "w2", playerId: "p2", rackPosition: 0 }),
    ];

    act(() => { result.current.handleMessage({ type: "game_started", game, players, wires }); });

    expect(result.current.state.game?.status).toBe("setup");
    expect(result.current.state.wires).toEqual(wires);
  });

  it("handles setup_complete message", () => {
    const { result } = renderHook(() => useGameState());
    const activeGame = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });

    act(() => { result.current.handleMessage({ type: "setup_complete", game: activeGame }); });
    expect(result.current.state.game?.status).toBe("active");
  });

  it("handles turn_result with wire updates", () => {
    const { result } = renderHook(() => useGameState());
    const wire1 = makeWire({ id: "w1", playerId: "p2", value: "3", status: "hidden" });
    const wire2 = makeWire({ id: "w2", playerId: "p2", value: "5", status: "hidden" });
    const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });

    act(() => {
      result.current.handleMessage({
        type: "game_started", game,
        players: [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })],
        wires: [wire1, wire2],
      });
    });

    const cutWire = { ...wire1, status: "cut" as const };
    const turn = makeTurn({ actionType: "duo_cut", targetWireId: "w1", guessedValue: "3", result: "success" });

    act(() => {
      result.current.handleMessage({ type: "turn_result", turn, game, updatedWires: [cutWire] });
    });

    expect(result.current.state.wires[0].status).toBe("cut");
    expect(result.current.state.wires[1].status).toBe("hidden");
    expect(result.current.state.lastTurnResult?.turn.result).toBe("success");
  });

  it("handles turn_result with detonator advance on fail", () => {
    const { result } = renderHook(() => useGameState());
    const wire = makeWire({ id: "w1", playerId: "p2", value: "3" });
    const game = makeGame({ id: "g1", status: "active", detonatorPosition: 0 });

    act(() => {
      result.current.handleMessage({
        type: "game_started", game,
        players: [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })],
        wires: [wire],
      });
    });

    const advancedGame = { ...game, detonatorPosition: 1 };
    const turn = makeTurn({ result: "fail", guessedValue: "5" });

    act(() => {
      result.current.handleMessage({ type: "turn_result", turn, game: advancedGame, updatedWires: [] });
    });

    expect(result.current.state.game?.detonatorPosition).toBe(1);
    expect(result.current.state.lastTurnResult?.turn.result).toBe("fail");
  });

  it("handles validation_complete message", () => {
    const { result } = renderHook(() => useGameState());
    const game = makeGame({ id: "g1", status: "active" });

    act(() => { result.current.handleMessage({ type: "game_started", game, players: [], wires: [] }); });
    act(() => { result.current.handleMessage({ type: "validation_complete", wireValue: "3", game }); });

    expect(result.current.state.validationTokens).toHaveLength(1);
    expect(result.current.state.validationTokens[0].wireValue).toBe("3");
  });

  it("handles wire_updated message", () => {
    const { result } = renderHook(() => useGameState());
    const wire = makeWire({ id: "w1", value: "3", status: "hidden" });
    const game = makeGame({ id: "g1", status: "active" });

    act(() => { result.current.handleMessage({ type: "game_started", game, players: [], wires: [wire] }); });

    const updatedWire = { ...wire, status: "revealed" as const };
    act(() => { result.current.handleMessage({ type: "wire_updated", wire: updatedWire }); });

    expect(result.current.state.wires[0].status).toBe("revealed");
  });

  it("handles game_over won", () => {
    const { result } = renderHook(() => useGameState());
    const game = makeGame({ id: "g1", status: "active" });

    act(() => { result.current.handleMessage({ type: "game_started", game, players: [], wires: [] }); });
    act(() => { result.current.handleMessage({ type: "game_over", result: "won", reason: "All values validated!" }); });

    expect(result.current.state.game?.status).toBe("won");
    expect(result.current.state.gameOverReason).toBe("All values validated!");
  });

  it("handles game_over lost", () => {
    const { result } = renderHook(() => useGameState());
    const game = makeGame({ id: "g1", status: "active" });

    act(() => { result.current.handleMessage({ type: "game_started", game, players: [], wires: [] }); });
    act(() => { result.current.handleMessage({ type: "game_over", result: "lost", reason: "Detonator exploded!" }); });

    expect(result.current.state.game?.status).toBe("lost");
    expect(result.current.state.gameOverReason).toBe("Detonator exploded!");
  });

  it("handles error message", () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.handleMessage({ type: "error", message: "Game not found" }); });
    expect(result.current.state.error).toBe("Game not found");
  });

  it("setError and clearError work", () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.setError("Something went wrong"));
    expect(result.current.state.error).toBe("Something went wrong");
    act(() => result.current.clearError());
    expect(result.current.state.error).toBeNull();
  });

  it("reset returns to initial state", () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.handleMessage({ type: "game_created", game: makeGame(), player: makePlayer() }); });
    expect(result.current.state.game).not.toBeNull();
    act(() => result.current.reset());
    expect(result.current.state.game).toBeNull();
    expect(result.current.state.localPlayer).toBeNull();
    expect(result.current.state.players).toEqual([]);
  });

  it("handles game_state full sync message", () => {
    const { result } = renderHook(() => useGameState());
    const game = makeGame({ id: "g1", status: "active" });
    const players = [makePlayer({ id: "p1" })];
    const wires = [makeWire({ id: "w1" })];
    const infoTokens = [{ id: "t1", gameId: "g1", wireId: "w1", value: "3", placedAt: "2026-01-01T00:00:00Z" }];
    const validationTokens = [{ id: "v1", gameId: "g1", wireValue: "3", validatedAt: "2026-01-01T00:00:00Z" }];

    act(() => {
      result.current.handleMessage({ type: "game_state", game, players, wires, infoTokens, validationTokens });
    });

    expect(result.current.state.game).toEqual(game);
    expect(result.current.state.players).toEqual(players);
    expect(result.current.state.wires).toEqual(wires);
    expect(result.current.state.infoTokens).toEqual(infoTokens);
    expect(result.current.state.validationTokens).toEqual(validationTokens);
  });
});
