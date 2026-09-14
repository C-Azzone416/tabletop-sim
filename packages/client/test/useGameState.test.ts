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
      result.current.handleMessage({ type: "game_created", lobbyConfig: null, game, player });
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
      result.current.handleMessage({ type: "joined_game", lobbyConfig: null, game, player, players });
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

    act(() => { result.current.handleMessage({ type: "game_created", lobbyConfig: null, game, player: alice }); });
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

    act(() => { result.current.handleMessage({ type: "game_started", game, players, wires, candidates: [] }); });

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
        candidates: [],
      });
    });

    const cutWire = { ...wire1, status: "cut" as const };
    const turn = makeTurn({ actionType: "dual_cut", targetWireId: "w1", guessedValue: "3", result: "success" });

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
        candidates: [],
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

    act(() => { result.current.handleMessage({ type: "game_started", game, players: [], wires: [], candidates: [] }); });
    act(() => { result.current.handleMessage({ type: "validation_complete", wireValue: "3", wireColor: "blue", game }); });

    expect(result.current.state.validationTokens).toHaveLength(1);
    expect(result.current.state.validationTokens[0].wireValue).toBe("3");
  });

  it("handles wire_updated message", () => {
    const { result } = renderHook(() => useGameState());
    const wire = makeWire({ id: "w1", value: "3", status: "hidden" });
    const game = makeGame({ id: "g1", status: "active" });

    act(() => { result.current.handleMessage({ type: "game_started", game, players: [], wires: [wire], candidates: [] }); });

    const updatedWire = { ...wire, status: "revealed" as const };
    act(() => { result.current.handleMessage({ type: "wire_updated", wire: updatedWire }); });

    expect(result.current.state.wires[0].status).toBe("revealed");
  });

  it("handles game_over won", () => {
    const { result } = renderHook(() => useGameState());
    const game = makeGame({ id: "g1", status: "active" });

    act(() => { result.current.handleMessage({ type: "game_started", game, players: [], wires: [], candidates: [] }); });
    act(() => { result.current.handleMessage({ type: "game_over", result: "won", reason: "All values validated!" }); });

    expect(result.current.state.game?.status).toBe("won");
    expect(result.current.state.gameOverReason).toBe("All values validated!");
  });

  it("handles game_over lost", () => {
    const { result } = renderHook(() => useGameState());
    const game = makeGame({ id: "g1", status: "active" });

    act(() => { result.current.handleMessage({ type: "game_started", game, players: [], wires: [], candidates: [] }); });
    act(() => { result.current.handleMessage({ type: "game_over", result: "lost", reason: "Detonator exploded!" }); });

    expect(result.current.state.game?.status).toBe("lost");
    expect(result.current.state.gameOverReason).toBe("Detonator exploded!");
  });

  it("handles error message", () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.handleMessage({ type: "error", message: "Game not found" }); });
    expect(result.current.state.error).toBe("Game not found");
  });

  // #451 — a non-host departure. Filters the roster only; per-game
  // consequences (stay in lobby, end the game, continue play) are
  // #432/#433/#434's job, not this hook's.
  it("handles player_left by removing the departed player from the roster", () => {
    const { result } = renderHook(() => useGameState());
    const game = makeGame({ id: "g1" });
    const alice = makePlayer({ id: "p1", name: "Alice" });
    const bob = makePlayer({ id: "p2", name: "Bob" });

    act(() => { result.current.handleMessage({ type: "game_created", lobbyConfig: null, game, player: alice }); });
    act(() => { result.current.handleMessage({ type: "player_joined", player: bob }); });
    expect(result.current.state.players).toHaveLength(2);

    act(() => {
      result.current.handleMessage({ type: "player_left", playerId: "p2", playerName: "Bob" });
    });

    expect(result.current.state.players).toEqual([alice]);
  });

  // #432 — the mission-ended-but-room-survives case (Wire Game's non-host
  // mid-game leave). Rides the same player_left message as the plain
  // roster-filter case above, distinguished only by gameEnded.
  it("handles player_left with gameEnded:true by setting missionEndedReason", () => {
    const { result } = renderHook(() => useGameState());
    expect(result.current.state.missionEndedReason).toBeNull();

    act(() => {
      result.current.handleMessage({
        type: "player_left",
        playerId: "p2",
        playerName: "Bob",
        gameEnded: true,
      });
    });

    expect(result.current.state.missionEndedReason).toBe("Bob left. The mission has ended.");
  });

  it("does not set missionEndedReason for a plain lobby-phase player_left (gameEnded false/absent)", () => {
    const { result } = renderHook(() => useGameState());

    act(() => {
      result.current.handleMessage({
        type: "player_left",
        playerId: "p2",
        playerName: "Bob",
        gameEnded: false,
      });
    });
    expect(result.current.state.missionEndedReason).toBeNull();

    act(() => {
      result.current.handleMessage({ type: "player_left", playerId: "p3", playerName: "Carol" });
    });
    expect(result.current.state.missionEndedReason).toBeNull();
  });

  it("dismissMissionEnded clears missionEndedReason", () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.handleMessage({
        type: "player_left",
        playerId: "p2",
        playerName: "Bob",
        gameEnded: true,
      });
    });
    expect(result.current.state.missionEndedReason).not.toBeNull();

    act(() => result.current.dismissMissionEnded());
    expect(result.current.state.missionEndedReason).toBeNull();
  });

  // #451 — the host-departure case. Applies in every phase/game, so this
  // hook only records the reason; GameClient decides what to render.
  it("handles room_closed by setting roomClosedReason", () => {
    const { result } = renderHook(() => useGameState());
    expect(result.current.state.roomClosedReason).toBeNull();

    act(() => {
      result.current.handleMessage({
        type: "room_closed",
        reason: "The host left. The room has been closed.",
      });
    });

    expect(result.current.state.roomClosedReason).toBe(
      "The host left. The room has been closed.",
    );
  });

  // #448 — purely informational (see useGameState.ts's own doc comment on
  // reconnectingPlayerIds): a disconnect just armed #446's grace timer.
  describe("reconnecting indicator (#448)", () => {
    it("handles player_reconnecting by adding the id", () => {
      const { result } = renderHook(() => useGameState());
      expect(result.current.state.reconnectingPlayerIds).toEqual([]);

      act(() => {
        result.current.handleMessage({ type: "player_reconnecting", playerId: "p2" });
      });

      expect(result.current.state.reconnectingPlayerIds).toEqual(["p2"]);
    });

    it("does not duplicate an id already marked reconnecting", () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.handleMessage({ type: "player_reconnecting", playerId: "p2" });
      });
      act(() => {
        result.current.handleMessage({ type: "player_reconnecting", playerId: "p2" });
      });

      expect(result.current.state.reconnectingPlayerIds).toEqual(["p2"]);
    });

    it("handles player_reconnected by removing the id", () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.handleMessage({ type: "player_reconnecting", playerId: "p2" });
      });
      expect(result.current.state.reconnectingPlayerIds).toEqual(["p2"]);

      act(() => {
        result.current.handleMessage({ type: "player_reconnected", playerId: "p2" });
      });

      expect(result.current.state.reconnectingPlayerIds).toEqual([]);
    });

    it("clears a departed player's reconnecting flag when player_left arrives, even without a prior player_reconnected", () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.handleMessage({ type: "player_reconnecting", playerId: "p2" });
      });

      act(() => {
        result.current.handleMessage({ type: "player_left", playerId: "p2", playerName: "Bob" });
      });

      expect(result.current.state.reconnectingPlayerIds).toEqual([]);
    });

    it("tracks multiple reconnecting players independently", () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.handleMessage({ type: "player_reconnecting", playerId: "p2" });
      });
      act(() => {
        result.current.handleMessage({ type: "player_reconnecting", playerId: "p3" });
      });
      expect(result.current.state.reconnectingPlayerIds).toEqual(["p2", "p3"]);

      act(() => {
        result.current.handleMessage({ type: "player_reconnected", playerId: "p2" });
      });
      expect(result.current.state.reconnectingPlayerIds).toEqual(["p3"]);
    });
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
    act(() => { result.current.handleMessage({ type: "game_created", lobbyConfig: null, game: makeGame(), player: makePlayer() }); });
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
    const infoTokens = [{ id: "t1", gameId: "g1", wireId: "w1", value: "3", placedAt: "2026-01-01T00:00:00Z", devCreated: false }];
    const validationTokens = [{ id: "v1", gameId: "g1", wireValue: "3", wireColor: "blue" as const, validatedAt: "2026-01-01T00:00:00Z" }];

    act(() => {
      result.current.handleMessage({ type: "game_state", lobbyConfig: null, game, players, wires, infoTokens, validationTokens, localPlayerId: "p1", candidates: [] });
    });

    expect(result.current.state.game).toEqual(game);
    expect(result.current.state.players).toEqual(players);
    expect(result.current.state.wires).toEqual(wires);
    expect(result.current.state.infoTokens).toEqual(infoTokens);
    expect(result.current.state.validationTokens).toEqual(validationTokens);
  });

  describe("lobby config replication (#329)", () => {
    it("starts null before any server message", () => {
      const { result } = renderHook(() => useGameState());
      expect(result.current.state.lobbyConfig).toBeNull();
    });

    it("takes game_created's lobbyConfig verbatim (null — nothing has been picked yet)", () => {
      const { result } = renderHook(() => useGameState());
      const game = makeGame({ id: "g1" });
      const player = makePlayer({ id: "p1" });

      act(() => {
        result.current.handleMessage({ type: "game_created", game, player, lobbyConfig: null });
      });

      expect(result.current.state.lobbyConfig).toBeNull();
    });

    it("takes joined_game's lobbyConfig — a late joiner sees the captain's already-live pick", () => {
      const { result } = renderHook(() => useGameState());
      const game = makeGame({ id: "g1" });
      const player = makePlayer({ id: "p2" });

      act(() => {
        result.current.handleMessage({
          type: "joined_game",
          game,
          player,
          players: [player],
          lobbyConfig: { mission: 3 },
        });
      });

      expect(result.current.state.lobbyConfig).toEqual({ mission: 3 });
    });

    // #505 QA finding — a browser's SECOND WebSocket connection (#454's
    // architecture) is what actually renders GameClient, and the server
    // treats it as a reconnect: it receives game_state, never joined_game.
    // Syncing lobbyConfig from game_state too (both the wire-game and Flip
    // variants) is what makes a non-captain's real client ever see the
    // captain's already-live pick — this hook instance's `lobbyConfig`
    // otherwise stays at its initial `null` forever, with nothing to
    // correct it.
    it("takes game_state's lobbyConfig too (the wire-game variant) — this is what a browser's real reconnect actually receives", () => {
      const { result } = renderHook(() => useGameState());
      const game = makeGame({ id: "g1", status: "waiting" });

      act(() => {
        result.current.handleMessage({
          type: "game_state",
          game,
          players: [makePlayer({ id: "p2" })],
          wires: [],
          infoTokens: [],
          validationTokens: [],
          localPlayerId: "p2",
          candidates: [],
          lobbyConfig: { mission: 4 },
        });
      });

      expect(result.current.state.lobbyConfig).toEqual({ mission: 4 });
    });

    it("takes game_state's lobbyConfig too (the Flip variant)", () => {
      const { result } = renderHook(() => useGameState());
      const game = makeGame({ id: "g1", status: "waiting", gameType: "flip" });

      act(() => {
        result.current.handleMessage({
          type: "game_state",
          game,
          players: [makePlayer({ id: "p2" })],
          localPlayerId: "p2",
          flip: null,
          lobbyConfig: { difficulty: "hard" },
        });
      });

      expect(result.current.state.lobbyConfig).toEqual({ difficulty: "hard" });
    });

    it("updates on lobby_config_updated", () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.handleMessage({ type: "lobby_config_updated", config: { mission: 2 } });
      });

      expect(result.current.state.lobbyConfig).toEqual({ mission: 2 });

      act(() => {
        result.current.handleMessage({ type: "lobby_config_updated", config: { mission: 5 } });
      });

      expect(result.current.state.lobbyConfig).toEqual({ mission: 5 });
    });
  });
});
