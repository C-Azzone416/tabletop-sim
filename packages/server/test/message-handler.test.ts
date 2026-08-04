import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WebSocket } from "ws";
import { makeGame, makePlayer, makeWire, makeTurn, resetIds } from "./fixtures.js";

// Mock the engine and DB modules
vi.mock("../src/engine/game-engine.js", () => ({
  createGame: vi.fn(),
  joinGame: vi.fn(),
  startGame: vi.fn(),
  completeSetup: vi.fn(),
  executePlaceInfoToken: vi.fn(),
  executeProposeDualCut: vi.fn(),
  executeRespondDualCut: vi.fn(),
  executeCompleteDualCut: vi.fn(),
  executeSoloCut: vi.fn(),
  executeDoubleDetector: vi.fn(),
  executeRevealReds: vi.fn(),
  executePlayerReady: vi.fn(),
  executeCompleteSetup: vi.fn(),
  executeSelectOpponentWire: vi.fn(),
  executeAnswerWireQuestion: vi.fn(),
  executeNextTurn: vi.fn(),
  executeNextMission: vi.fn(),
}));

vi.mock("../src/db/games.js", () => ({
  getGameById: vi.fn(),
  getGameByJoinCode: vi.fn(),
  createGame: vi.fn(),
  updateGameStatus: vi.fn(),
  updateGameCaptain: vi.fn(),
  updateCurrentTurn: vi.fn(),
  updateDetonator: vi.fn(),
  updateMission: vi.fn(),
}));

vi.mock("../src/db/players.js", () => ({
  getPlayersByGameId: vi.fn(),
  getActivePlayerByProfileId: vi.fn(),
}));

vi.mock("../src/ws/connection-manager.js", () => ({
  registerConnection: vi.fn(),
  getConnectionInfo: vi.fn(),
  getGameSockets: vi.fn(),
  getPlayerSocket: vi.fn(),
  broadcastToGame: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  setAuthenticatedUser: vi.fn(),
  removeConnection: vi.fn(),
}));

vi.mock("../src/ws/state-broadcaster.js", () => ({
  broadcastGameState: vi.fn(),
  buildPlayerView: vi.fn((wires) => wires),
}));

import * as engine from "../src/engine/game-engine.js";
import * as gamesDb from "../src/db/games.js";
import * as playersDb from "../src/db/players.js";
import * as connManager from "../src/ws/connection-manager.js";
import * as stateBroadcaster from "../src/ws/state-broadcaster.js";
import { handleMessage } from "../src/ws/message-handler.js";

const mockEngine = vi.mocked(engine);
const mockGamesDb = vi.mocked(gamesDb);
const mockPlayersDb = vi.mocked(playersDb);
const mockConnManager = vi.mocked(connManager);
const mockStateBroadcaster = vi.mocked(stateBroadcaster);

function mockSocket(): WebSocket {
  return {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

function lastSent(ws: WebSocket): unknown {
  const calls = (ws.send as ReturnType<typeof vi.fn>).mock.calls;
  return JSON.parse(calls[calls.length - 1][0] as string);
}

describe("message-handler", () => {
  beforeEach(() => {
    resetIds();
    vi.clearAllMocks();
  });

  describe("message validation", () => {
    it("rejects invalid JSON", async () => {
      const ws = mockSocket();
      await handleMessage(ws, "not json{");
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid JSON" });
    });

    it("rejects message without type", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ foo: "bar" }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects unknown message type", async () => {
      const ws = mockSocket();
      mockConnManager.getAuthenticatedUser.mockReturnValue({ profileId: "prof-1", name: "Alice" });
      await handleMessage(ws, JSON.stringify({ type: "unknown_type" }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects create_game with empty playerName", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "create_game", playerName: "" }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects create_game with name over 20 chars", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "create_game", playerName: "A".repeat(21) }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects an unknown game type", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({
        type: "create_game",
        playerName: "Alice",
        gameType: "chess",
      }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects join_game with missing joinCode", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "join_game", playerName: "Bob" }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects propose_dual_cut with missing guessedValue", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "propose_dual_cut", targetWireId: "w1" }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects solo_cut with missing wireValue", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "solo_cut" }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects double_detector with missing second wire", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "double_detector", targetWireId: "w1" }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects start_game with mission out of range", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "start_game", mission: 9 }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects start_game with mission 0", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "start_game", mission: 0 }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects start_game with non-integer mission", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "start_game", mission: 2.5 }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects start_game with string mission", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "start_game", mission: "3" }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects next_mission with mission out of range", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "next_mission", mission: 9 }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });

    it("rejects next_mission with non-integer mission", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "next_mission", mission: 2.5 }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });
  });

  describe("create_game", () => {
    it("passes a selected Spades room type to the engine", async () => {
      const ws = mockSocket();
      const game = makeGame({ id: "g1", captainId: "p1", gameType: "spades" });
      const player = makePlayer({ id: "p1", name: "Alice" });

      mockConnManager.getAuthenticatedUser.mockReturnValue({ profileId: "prof-1", name: "Alice" });
      mockEngine.createGame.mockResolvedValue({ game, player });

      await handleMessage(ws, JSON.stringify({
        type: "create_game",
        playerName: "Alice",
        gameType: "spades",
      }));

      expect(mockEngine.createGame).toHaveBeenCalledWith("Alice", "prof-1", "spades");
    });

    it("creates a game and sends game_created response", async () => {
      const ws = mockSocket();
      const game = makeGame({ id: "g1", captainId: "p1" });
      const player = makePlayer({ id: "p1", name: "Alice" });

      mockConnManager.getAuthenticatedUser.mockReturnValue({ profileId: "prof-1", name: "Alice" });
      mockEngine.createGame.mockResolvedValue({ game, player });

      await handleMessage(ws, JSON.stringify({ type: "create_game", playerName: "Alice" }));

      expect(mockEngine.createGame).toHaveBeenCalledWith("Alice", "prof-1", "wire-game");
      expect(mockConnManager.registerConnection).toHaveBeenCalledWith(ws, "p1", "g1");
      const sent = lastSent(ws) as { type: string; game: unknown; player: unknown };
      expect(sent.type).toBe("game_created");
    });
  });

  describe("join_game", () => {
    it("joins a game and notifies existing players", async () => {
      const ws = mockSocket();
      const game = makeGame({ id: "g1" });
      const player = makePlayer({ id: "p2", name: "Bob" });
      const players = [makePlayer({ id: "p1" }), player];

      mockConnManager.getAuthenticatedUser.mockReturnValue({ profileId: "prof-2", name: "Bob" });
      mockEngine.joinGame.mockResolvedValue({ game, player, players });

      await handleMessage(ws, JSON.stringify({ type: "join_game", joinCode: "ABC123", playerName: "Bob" }));

      expect(mockEngine.joinGame).toHaveBeenCalledWith("ABC123", "Bob", "prof-2");
      const sent = lastSent(ws) as { type: string };
      expect(sent.type).toBe("joined_game");
      expect(mockConnManager.broadcastToGame).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ type: "player_joined" }),
        "p2"
      );
    });
  });

  describe("start_game", () => {
    it("starts the game and broadcasts to all players", async () => {
      const ws = mockSocket();
      const game = makeGame({ id: "g1", status: "setup" });
      const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
      const wires = [makeWire({ playerId: "p1" }), makeWire({ playerId: "p2" })];

      const ws2 = mockSocket();
      const gameSockets = new Map<string, WebSocket>();
      gameSockets.set("p1", ws);
      gameSockets.set("p2", ws2);

      mockConnManager.getConnectionInfo.mockReturnValue({
        playerId: "p1", gameId: "g1", socket: ws,
      });
      mockEngine.startGame.mockResolvedValue({ game, players, wires });
      mockConnManager.getGameSockets.mockReturnValue(gameSockets);

      await handleMessage(ws, JSON.stringify({ type: "start_game" }));

      // Both players should receive game_started
      expect(ws.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
      // Mission defaults to 1 when not provided
      expect(mockEngine.startGame).toHaveBeenCalledWith("g1", "p1", 1);
    });

    it("passes selected mission to the engine", async () => {
      const ws = mockSocket();
      const game = makeGame({ id: "g1", status: "setup" });
      const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
      const wires = [makeWire({ playerId: "p1" }), makeWire({ playerId: "p2" })];

      const gameSockets = new Map<string, WebSocket>();
      gameSockets.set("p1", ws);

      mockConnManager.getConnectionInfo.mockReturnValue({
        playerId: "p1", gameId: "g1", socket: ws,
      });
      mockEngine.startGame.mockResolvedValue({ game, players, wires });
      mockConnManager.getGameSockets.mockReturnValue(gameSockets);

      await handleMessage(ws, JSON.stringify({ type: "start_game", mission: 5 }));

      expect(mockEngine.startGame).toHaveBeenCalledWith("g1", "p1", 5);
    });
  });

  describe("next_mission", () => {
    it("starts the next mission and broadcasts game state to all players", async () => {
      const ws = mockSocket();
      const game = makeGame({ id: "g1", status: "setup", mission: 2 });
      const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
      const wires = [makeWire({ playerId: "p1" }), makeWire({ playerId: "p2" })];

      mockConnManager.getConnectionInfo.mockReturnValue({ playerId: "p1", gameId: "g1", socket: ws });
      mockEngine.executeNextMission.mockResolvedValue({ game, players, wires });

      await handleMessage(ws, JSON.stringify({ type: "next_mission", mission: 2 }));

      expect(mockEngine.executeNextMission).toHaveBeenCalledWith("g1", "p1", 2);
      expect(mockStateBroadcaster.broadcastGameState).toHaveBeenCalledWith("g1", game, players);
    });

    it("rejects a missing mission as an invalid message (no captain-only/won-lost guard reached)", async () => {
      const ws = mockSocket();
      await handleMessage(ws, JSON.stringify({ type: "next_mission" }));
      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
      expect(mockEngine.executeNextMission).not.toHaveBeenCalled();
    });

    it("surfaces the captain-only rejection reason to the client, not a generic Internal error", async () => {
      const ws = mockSocket();
      mockConnManager.getConnectionInfo.mockReturnValue({ playerId: "p2", gameId: "g1", socket: ws });
      mockEngine.executeNextMission.mockRejectedValue(new Error("Only the captain can start the next mission"));

      await handleMessage(ws, JSON.stringify({ type: "next_mission", mission: 2 }));

      expect(lastSent(ws)).toEqual({ type: "error", message: "Only the captain can start the next mission" });
    });
  });

  describe("propose_dual_cut", () => {
    it("sends dual_cut_proposed broadcast with guess to all players", async () => {
      const ws = mockSocket();
      const game = makeGame({ id: "g1", status: "active", pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "5" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", rackPosition: 2 });
      const targetPlayer = makePlayer({ id: "p2", gameId: "g1" });

      mockConnManager.getConnectionInfo.mockReturnValue({ playerId: "p1", gameId: "g1", socket: ws });
      mockEngine.executeProposeDualCut.mockResolvedValue({ game, wire, targetPlayer });

      await handleMessage(ws, JSON.stringify({ type: "propose_dual_cut", targetWireId: "w1", guessedValue: "5" }));

      expect(mockEngine.executeProposeDualCut).toHaveBeenCalledWith("g1", "p1", "w1", "5");
      expect(mockConnManager.broadcastToGame).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ type: "dual_cut_proposed", guessedValue: "5" }),
      );
    });
  });

  describe("respond_dual_cut", () => {
    it("phase=completing: reveals wire, broadcasts dual_cut_correct", async () => {
      const ws = mockSocket();
      const game = makeGame({ id: "g1", status: "active" });
      const revealedWire = makeWire({ id: "w1", status: "revealed", color: "blue", rackPosition: 3 });
      const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
      const gameSockets = new Map<string, WebSocket>();
      gameSockets.set("p1", ws);

      mockConnManager.getConnectionInfo.mockReturnValue({ playerId: "p2", gameId: "g1", socket: ws });
      mockEngine.executeRespondDualCut.mockResolvedValue({ phase: "completing", game, updatedWires: [revealedWire] });
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockConnManager.getGameSockets.mockReturnValue(gameSockets);
      mockGamesDb.getGameById.mockResolvedValue(game);

      await handleMessage(ws, JSON.stringify({ type: "respond_dual_cut", accepted: true }));

      expect(mockEngine.executeRespondDualCut).toHaveBeenCalledWith("g1", "p2", true);
      expect(mockConnManager.broadcastToGame).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ type: "dual_cut_correct" }),
      );
    });

    it("phase=fail: broadcasts turn_result fail", async () => {
      const ws = mockSocket();
      const game = makeGame({ id: "g1", status: "active" });
      const turn = makeTurn({ result: "fail" });
      const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
      const gameSockets = new Map<string, WebSocket>();
      gameSockets.set("p2", ws);

      mockConnManager.getConnectionInfo.mockReturnValue({ playerId: "p2", gameId: "g1", socket: ws });
      mockEngine.executeRespondDualCut.mockResolvedValue({ phase: "fail", turn, game, updatedWires: [] });
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockConnManager.getGameSockets.mockReturnValue(gameSockets);
      mockGamesDb.getGameById.mockResolvedValue(game);

      await handleMessage(ws, JSON.stringify({ type: "respond_dual_cut", accepted: false }));

      const sent = lastSent(ws) as { type: string };
      expect(sent.type).toBe("turn_result");
    });
  });

  describe("complete_dual_cut", () => {
    it("cuts both wires and broadcasts turn_result", async () => {
      const ws = mockSocket();
      const game = makeGame({ id: "g1", status: "active" });
      const turn = makeTurn({ result: "success" });
      const updatedWires = [makeWire({ status: "cut" }), makeWire({ status: "cut" })];
      const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
      const gameSockets = new Map<string, WebSocket>();
      gameSockets.set("p1", ws);

      mockConnManager.getConnectionInfo.mockReturnValue({ playerId: "p1", gameId: "g1", socket: ws });
      mockEngine.executeCompleteDualCut.mockResolvedValue({ turn, game, updatedWires });
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockConnManager.getGameSockets.mockReturnValue(gameSockets);
      mockGamesDb.getGameById.mockResolvedValue(game);

      await handleMessage(ws, JSON.stringify({ type: "complete_dual_cut", ownWireId: "w2" }));

      expect(mockEngine.executeCompleteDualCut).toHaveBeenCalledWith("g1", "p1", "w2");
      const sent = lastSent(ws) as { type: string };
      expect(sent.type).toBe("turn_result");
    });
  });

  describe("reveal_reds", () => {
    it("reveals red wires and broadcasts turn_result with per-player wire views", async () => {
      const ws = mockSocket();
      const otherWs = mockSocket();
      const game = makeGame({ id: "g1", status: "active" });
      const turn = makeTurn({ actionType: "reveal_reds", result: "success" });
      const updatedWires = [
        makeWire({ id: "w1", color: "red", status: "revealed", rackPosition: 1 }),
        makeWire({ id: "w2", color: "red", status: "revealed", rackPosition: 2 }),
      ];
      const gameSockets = new Map<string, WebSocket>();
      gameSockets.set("p1", ws);
      gameSockets.set("p2", otherWs);

      mockConnManager.getConnectionInfo.mockReturnValue({ playerId: "p1", gameId: "g1", socket: ws });
      mockEngine.executeRevealReds.mockResolvedValue({ turn, game, updatedWires });
      mockConnManager.getGameSockets.mockReturnValue(gameSockets);

      await handleMessage(ws, JSON.stringify({ type: "reveal_reds" }));

      expect(mockEngine.executeRevealReds).toHaveBeenCalledWith("g1", "p1");
      expect(lastSent(ws)).toEqual({ type: "turn_result", turn, game, updatedWires });
      expect(lastSent(otherWs)).toEqual({ type: "turn_result", turn, game, updatedWires });
    });

    it("propagates engine errors as an error message instead of broadcasting", async () => {
      const ws = mockSocket();
      mockConnManager.getConnectionInfo.mockReturnValue({ playerId: "p1", gameId: "g1", socket: ws });
      mockEngine.executeRevealReds.mockRejectedValue(new Error("Not your turn"));

      await handleMessage(ws, JSON.stringify({ type: "reveal_reds" }));

      expect(lastSent(ws)).toEqual({ type: "error", message: "Not your turn" });
      expect(mockConnManager.getGameSockets).not.toHaveBeenCalled();
    });
  });

  describe("place_info_token", () => {
    it("places an info token and broadcasts game state to all players", async () => {
      const ws = mockSocket();
      const game = makeGame({ id: "g1", status: "setup" });
      const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];

      mockConnManager.getConnectionInfo.mockReturnValue({
        playerId: "p1", gameId: "g1", socket: ws,
      });
      mockEngine.executePlaceInfoToken.mockResolvedValue({ infoToken: { id: "t1", gameId: "g1", wireId: "w1", value: "3", placedAt: "" } });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);

      await handleMessage(ws, JSON.stringify({ type: "place_info_token", wireId: "w1" }));

      expect(mockEngine.executePlaceInfoToken).toHaveBeenCalledWith("g1", "p1", "w1");
      expect(mockStateBroadcaster.broadcastGameState).toHaveBeenCalledWith("g1", game, players);
    });
  });

  describe("double_detector", () => {
    it("sends the requester a full result and broadcasts a detail-free result to others", async () => {
      const ws = mockSocket();
      const game = makeGame({ id: "g1", status: "active" });
      const turn = makeTurn({ actionType: "double_detector", result: "success" });

      mockConnManager.getConnectionInfo.mockReturnValue({ playerId: "p1", gameId: "g1", socket: ws });
      mockEngine.executeDoubleDetector.mockResolvedValue({ turn, game });

      await handleMessage(ws, JSON.stringify({ type: "double_detector", targetWireId: "w1", targetWireId2: "w2" }));

      expect(mockEngine.executeDoubleDetector).toHaveBeenCalledWith("g1", "p1", "w1", "w2");
      expect(lastSent(ws)).toEqual({ type: "turn_result", turn, game, updatedWires: [] });
      expect(mockConnManager.broadcastToGame).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ type: "turn_result", turn: { ...turn, result: null }, game, updatedWires: [] }),
        "p1",
      );
    });
  });

  describe("player_ready", () => {
    it("marks player ready and broadcasts players_updated to all players", async () => {
      const ws = mockSocket();
      const players = [makePlayer({ id: "p1", ready: true }), makePlayer({ id: "p2" })];

      mockConnManager.getConnectionInfo.mockReturnValue({
        playerId: "p1", gameId: "g1", socket: ws,
      });
      mockEngine.executePlayerReady.mockResolvedValue({ players });

      await handleMessage(ws, JSON.stringify({ type: "player_ready" }));

      expect(mockEngine.executePlayerReady).toHaveBeenCalledWith("g1", "p1");
      expect(mockConnManager.broadcastToGame).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ type: "players_updated", players }),
      );
    });
  });

  describe("complete_setup (retired)", () => {
    it("is no longer a recognized message and yields an invalid-format error", async () => {
      const ws = mockSocket();
      mockConnManager.getConnectionInfo.mockReturnValue({
        playerId: "p1", gameId: "g1", socket: ws,
      });

      await handleMessage(ws, JSON.stringify({ type: "complete_setup" }));

      expect(lastSent(ws)).toEqual({ type: "error", message: "Invalid message format" });
    });
  });

  describe("error handling", () => {
    it("sends safe error messages for known game errors", async () => {
      const ws = mockSocket();
      mockConnManager.getAuthenticatedUser.mockReturnValue({ profileId: "prof-1", name: "Alice" });
      mockEngine.createGame.mockRejectedValue(new Error("Game not found"));

      await handleMessage(ws, JSON.stringify({ type: "create_game", playerName: "Alice" }));

      expect(lastSent(ws)).toEqual({ type: "error", message: "Game not found" });
    });

    it("sends 'Internal error' for unexpected errors", async () => {
      const ws = mockSocket();
      mockConnManager.getAuthenticatedUser.mockReturnValue({ profileId: "prof-1", name: "Alice" });
      mockEngine.createGame.mockRejectedValue(new Error("DB connection failed"));

      await handleMessage(ws, JSON.stringify({ type: "create_game", playerName: "Alice" }));

      expect(lastSent(ws)).toEqual({ type: "error", message: "Internal error" });
    });

    it("sends 'Not connected to a game' when no connection info for start_game", async () => {
      const ws = mockSocket();
      mockConnManager.getConnectionInfo.mockReturnValue(undefined);

      await handleMessage(ws, JSON.stringify({ type: "start_game" }));

      expect(lastSent(ws)).toEqual({ type: "error", message: "Not connected to a game" });
    });

    it("sends the solo-cut legality rejection reason to the client, not a generic Internal error (#150/#161)", async () => {
      const ws = mockSocket();
      mockConnManager.getConnectionInfo.mockReturnValue({ gameId: "g1", playerId: "p1" });
      mockEngine.executeSoloCut.mockRejectedValue(
        new Error("You must hold all remaining uncut wires of that number to solo cut it")
      );

      await handleMessage(ws, JSON.stringify({ type: "solo_cut", wireValue: "3" }));

      expect(lastSent(ws)).toEqual({
        type: "error",
        message: "You must hold all remaining uncut wires of that number to solo cut it",
      });
    });
  });
});
