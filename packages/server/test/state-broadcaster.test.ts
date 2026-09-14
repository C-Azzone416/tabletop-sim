import { describe, it, expect, beforeEach, vi } from "vitest";
import type { WebSocket } from "ws";
import { buildPlayerView, broadcastGameState } from "../src/ws/state-broadcaster.js";
import { makeWire, makeGame, makePlayer, resetIds } from "./fixtures.js";

vi.mock("../src/db/wires.js", () => ({ getWiresByGameId: vi.fn() }));
vi.mock("../src/db/tokens.js", () => ({
  getInfoTokensByGameId: vi.fn(),
  getValidationTokensByGameId: vi.fn(),
}));
vi.mock("../src/db/candidates.js", () => ({
  getWireCandidatesByGameId: vi.fn(),
}));
vi.mock("../src/db/flip-games.js", () => ({
  getFlipGameState: vi.fn(),
  saveFlipGameState: vi.fn(),
  recordFlipRoundScores: vi.fn(),
  getFlipRoundScores: vi.fn(),
}));
vi.mock("../src/ws/connection-manager.js", () => ({
  getGameSockets: vi.fn(() => new Map()),
  sendToPlayer: vi.fn(),
}));
// #445 — players is queried fresh inside broadcastGameState now, not passed
// in by the caller (see state-broadcaster.ts's doc comment on why).
vi.mock("../src/db/players.js", () => ({ getPlayersByGameId: vi.fn() }));
// #394 — read once per broadcast to pick the turn-timeout duration (dev vs.
// real). Mocked here so these wire-message-shape tests don't hit a real DB
// connection just because a fixture's Flip state happens to have a live
// turn; flip-turn-timer.spec.ts is what actually exercises the duration
// branch.
vi.mock("../src/db/games.js", () => ({ getGameCreatedVia: vi.fn() }));
// #394 — real setTimeout calls have no place in a suite asserting on
// broadcast message shape: an un-mocked schedule would arm a genuine
// 45s/10min timer per live-turn test case, accumulating across the whole
// run for no assertion this file makes.
vi.mock("../src/ws/flip-turn-timer.js", () => ({
  scheduleFlipTurnTimeout: vi.fn(),
  cancelFlipTurnTimeout: vi.fn(),
}));

import * as wiresDb from "../src/db/wires.js";
import * as tokensDb from "../src/db/tokens.js";
import * as candidatesDb from "../src/db/candidates.js";
import * as connManager from "../src/ws/connection-manager.js";
import * as flipGamesDb from "../src/db/flip-games.js";
import * as playersDb from "../src/db/players.js";
import * as gamesDb from "../src/db/games.js";
import * as flipTurnTimer from "../src/ws/flip-turn-timer.js";
import { buildFlipGameState, flipCards } from "@tabletop/game-flip";

const mockFlipGamesDb = vi.mocked(flipGamesDb);
const mockWiresDb = vi.mocked(wiresDb);
const mockTokensDb = vi.mocked(tokensDb);
const mockCandidatesDb = vi.mocked(candidatesDb);
const mockConnManager = vi.mocked(connManager);
const mockPlayersDb = vi.mocked(playersDb);
const mockGamesDb = vi.mocked(gamesDb);
const mockScheduleFlipTurnTimeout = vi.mocked(flipTurnTimer.scheduleFlipTurnTimeout);
const mockCancelFlipTurnTimeout = vi.mocked(flipTurnTimer.cancelFlipTurnTimeout);

describe("state-broadcaster", () => {
  beforeEach(() => {
    resetIds();
    vi.clearAllMocks();
    mockGamesDb.getGameCreatedVia.mockResolvedValue("lobby");
  });

  describe("buildPlayerView", () => {
    it("shows own hidden wires and redacts other players' hidden wires", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "5", status: "hidden" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].value).toBe("3"); // own wire — visible
      expect(view[1].value).toBeNull(); // other's wire — redacted
    });

    // #187 negative-path test (per the #decisions 2026-07-24 policy): another
    // player's hidden wire must arrive with BOTH value and color null —
    // color alone is mission-deciding information on red-wire missions.
    it("redacts BOTH value and color on other players' hidden wires", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", color: "red", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "5", color: "red", status: "hidden" }),
        makeWire({ id: "w3", playerId: "p2", value: "2", color: "yellow", status: "hidden" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].color).toBe("red"); // own wire — color visible
      expect(view[1].value).toBeNull();
      expect(view[1].color).toBeNull(); // other's hidden red — fully redacted
      expect(view[2].value).toBeNull();
      expect(view[2].color).toBeNull(); // other's hidden yellow — fully redacted
    });

    it("keeps color on other players' cut and revealed wires (public once resolved)", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p2", value: "3", color: "blue", status: "cut" }),
        makeWire({ id: "w2", playerId: "p2", value: "1", color: "red", status: "revealed" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].color).toBe("blue");
      expect(view[0].value).toBe("3");
      expect(view[1].color).toBe("red");
      expect(view[1].value).toBe("1");
    });

    it("does not redact own cut wires", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "cut" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].value).toBe("3"); // cut wire — visible
    });

    it("does not redact own revealed wires", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "revealed" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].value).toBe("3");
    });

    it("shows cut wires from other players (not hidden)", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p2", value: "1", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "2", status: "cut" }),
        makeWire({ id: "w3", playerId: "p3", value: "4", status: "hidden" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].value).toBeNull(); // other player's hidden wire — redacted
      expect(view[1].value).toBe("2");  // other player's cut wire — visible
      expect(view[2].value).toBeNull(); // other player's hidden wire — redacted
    });

    it("handles empty wire array", () => {
      const view = buildPlayerView([], "p1");
      expect(view).toEqual([]);
    });

    it("does not mutate the original wires", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p2", value: "3", status: "hidden" }),
      ];

      buildPlayerView(wires, "p1");
      expect(wires[0].value).toBe("3"); // original unchanged even though view redacts it
    });
  });

  // #382 — broadcastGameState used to call getWiresByGameId unconditionally,
  // so a Flip game got a wire-shaped message with nothing in it and the client
  // sat on the lobby screen forever.
  describe("broadcastGameState — flip (#382)", () => {
    const flipGame = () => makeGame({ id: "g1", gameType: "flip" });
    const flipPlayers = () => [makePlayer({ id: "p0" }), makePlayer({ id: "p1" })];
    const twoSeats = [
      { id: "p0", name: "Dev" },
      { id: "p1", name: "Alice" },
    ];

    const connect = (...ids: string[]) => {
      mockConnManager.getGameSockets.mockReturnValue(
        new Map(ids.map((id) => [id, {}])) as Map<string, WebSocket>,
      );
      // #396 — the broadcaster reads round history on every broadcast. No
      // completed rounds unless a test says otherwise.
      if (mockFlipGamesDb.getFlipRoundScores.getMockImplementation() === undefined) {
        mockFlipGamesDb.getFlipRoundScores.mockResolvedValue([]);
      }
      // #445 — players is queried fresh; default to the same roster every
      // test in this block already builds via flipPlayers().
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(flipPlayers());
    };

    it("broadcasts a renderable flip table to every connected seat", async () => {
      mockFlipGamesDb.getFlipGameState.mockResolvedValue(
        buildFlipGameState({ players: twoSeats, hands: { p0: flipCards(["7", "+4"]) } }),
      );
      connect("p0", "p1");

      await broadcastGameState("g1", flipGame());

      expect(mockConnManager.sendToPlayer).toHaveBeenCalledTimes(2);
      const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
      expect(message).toMatchObject({ type: "game_state", localPlayerId: "p0" });
      expect((message as { flip: unknown }).flip).toBeDefined();
    });

    // The acceptance criterion, and the actual bug: no wire-game query may be
    // issued on a Flip path at all.
    it("never touches wiresDb, tokensDb or candidatesDb for a flip game", async () => {
      mockFlipGamesDb.getFlipGameState.mockResolvedValue(
        buildFlipGameState({ players: twoSeats }),
      );
      connect("p0");

      await broadcastGameState("g1", flipGame());

      expect(mockWiresDb.getWiresByGameId).not.toHaveBeenCalled();
      expect(mockTokensDb.getInfoTokensByGameId).not.toHaveBeenCalled();
      expect(mockTokensDb.getValidationTokensByGameId).not.toHaveBeenCalled();
      expect(mockCandidatesDb.getWireCandidatesByGameId).not.toHaveBeenCalled();
    });

    it("sends no wires, infoTokens, validationTokens or candidates", async () => {
      mockFlipGamesDb.getFlipGameState.mockResolvedValue(
        buildFlipGameState({ players: twoSeats }),
      );
      connect("p0");

      await broadcastGameState("g1", flipGame());

      const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
      expect(message).not.toHaveProperty("wires");
      expect(message).not.toHaveProperty("infoTokens");
      expect(message).not.toHaveProperty("validationTokens");
      expect(message).not.toHaveProperty("candidates");
    });

    // #358: no hidden state. Every seat sees every hand, so unlike the wire
    // game the payload is identical for all recipients apart from localPlayerId.
    it("sends every seat the same table, differing only in localPlayerId", async () => {
      mockFlipGamesDb.getFlipGameState.mockResolvedValue(
        buildFlipGameState({
          players: twoSeats,
          hands: { p0: flipCards(["7"]), p1: flipCards(["9"]) },
        }),
      );
      connect("p0", "p1");

      await broadcastGameState("g1", flipGame());

      const [, , first] = mockConnManager.sendToPlayer.mock.calls[0];
      const [, , second] = mockConnManager.sendToPlayer.mock.calls[1];
      expect((first as { flip: unknown }).flip).toEqual((second as { flip: unknown }).flip);
      expect((first as { localPlayerId: string }).localPlayerId).toBe("p0");
      expect((second as { localPlayerId: string }).localPlayerId).toBe("p1");
    });

    // Reconnect: the table is rebuilt from the persisted blob every time, so
    // a client rejoining mid-round gets the pending choice back.
    it("restores a pending target choice from persisted state", async () => {
      mockFlipGamesDb.getFlipGameState.mockResolvedValue(
        buildFlipGameState({
          players: twoSeats,
          turnPlayerId: "p0",
          pendingAction: { kind: "flip3" },
        }),
      );
      connect("p0");

      await broadcastGameState("g1", flipGame());

      const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
      expect((message as { flip: { pendingAction: unknown } }).flip.pendingAction).toMatchObject({
        kind: "flip3",
        flipperId: "p0",
      });
    });

    // #406 — the case the old early-return was actually protecting. Suppressing
    // the table in the lobby must not weaken a mid-round reconnect, which has
    // to come back with everything.
    it("still restores the full table mid-round, table and all", async () => {
      mockFlipGamesDb.getFlipGameState.mockResolvedValue(
        buildFlipGameState({
          players: twoSeats,
          hands: { p0: flipCards(["7", "+4"]), p1: flipCards(["9"]) },
          turnPlayerId: "p0",
          pendingAction: { kind: "flip3" },
        }),
      );
      connect("p0");

      await broadcastGameState("g1", flipGame());

      const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
      const flip = (message as { flip: {
        players: { id: string; hand: unknown[] }[];
        turnPlayerId: string;
        pendingAction: unknown;
        shoeRemaining: number;
      } }).flip;

      expect(flip).not.toBeNull();
      expect(flip.players.find((p) => p.id === "p0")!.hand).toHaveLength(2);
      expect(flip.turnPlayerId).toBe("p0");
      expect(flip.pendingAction).toMatchObject({ kind: "flip3" });
      expect(flip.shoeRemaining).toBeGreaterThan(0);
    });

    // #396 — the scoreboard's data. Round history is read from
    // flip_round_scores and attached per player; before this it did not exist
    // in the payload at all, so the client had nothing to render.
    describe("round history (#396)", () => {
      const row = (over = {}) => ({
        gameId: "g1",
        roundNumber: 1,
        playerId: "p0",
        score: 12,
        busted: false,
        flip7: false,
        breakdown: { numbersSum: 12, plusSum: 0, hasX2: false, flip7Bonus: 0, total: 12, busted: false },
        ...over,
      });

      it("attaches each player's completed rounds", async () => {
        mockFlipGamesDb.getFlipGameState.mockResolvedValue(buildFlipGameState({ players: twoSeats }));
        mockFlipGamesDb.getFlipRoundScores.mockResolvedValue([
          row({ playerId: "p0", roundNumber: 1, score: 12 }),
          row({ playerId: "p1", roundNumber: 1, score: 0, busted: true }),
          row({ playerId: "p0", roundNumber: 2, score: 30 }),
        ]);
        connect("p0");

        await broadcastGameState("g1", flipGame());

        const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
        const view = (message as { flip: { players: { id: string; rounds: unknown[] }[] } }).flip;
        expect(view.players.find((p) => p.id === "p0")!.rounds).toHaveLength(2);
        expect(view.players.find((p) => p.id === "p1")!.rounds).toHaveLength(1);
      });

      it("orders a player's rounds ascending", async () => {
        mockFlipGamesDb.getFlipGameState.mockResolvedValue(buildFlipGameState({ players: twoSeats }));
        mockFlipGamesDb.getFlipRoundScores.mockResolvedValue([
          row({ roundNumber: 3 }),
          row({ roundNumber: 1 }),
          row({ roundNumber: 2 }),
        ]);
        connect("p0");

        await broadcastGameState("g1", flipGame());

        const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
        const rounds = (message as { flip: { players: { id: string; rounds: { roundNumber: number }[] }[] } })
          .flip.players.find((p) => p.id === "p0")!.rounds;
        expect(rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3]);
      });

      // The #365 acceptance criterion: the +15 and the x2 must survive as
      // distinct terms rather than being folded into the total.
      it("carries the breakdown through so a Flip 7 and a x2 stay distinct", async () => {
        mockFlipGamesDb.getFlipGameState.mockResolvedValue(buildFlipGameState({ players: twoSeats }));
        mockFlipGamesDb.getFlipRoundScores.mockResolvedValue([
          row({
            score: 57,
            flip7: true,
            breakdown: { numbersSum: 21, plusSum: 0, hasX2: true, flip7Bonus: 15, total: 57, busted: false },
          }),
        ]);
        connect("p0");

        await broadcastGameState("g1", flipGame());

        const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
        const round = (message as { flip: { players: { id: string; rounds: { breakdown: Record<string, unknown> }[] }[] } })
          .flip.players.find((p) => p.id === "p0")!.rounds[0];
        expect(round.breakdown).toMatchObject({ hasX2: true, flip7Bonus: 15, total: 57 });
      });

      it("gives a player with no completed rounds an empty list, not undefined", async () => {
        mockFlipGamesDb.getFlipGameState.mockResolvedValue(buildFlipGameState({ players: twoSeats }));
        mockFlipGamesDb.getFlipRoundScores.mockResolvedValue([]);
        connect("p0");

        await broadcastGameState("g1", flipGame());

        const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
        const view = (message as { flip: { players: { rounds: unknown[] }[] } }).flip;
        expect(view.players.every((p) => Array.isArray(p.rounds) && p.rounds.length === 0)).toBe(true);
      });
    });

    // #406 — the lobby. A Flip room legitimately has NO table until the dealer
    // starts the first round (the ruled awaiting-round-start flow), so this is
    // a normal state, not an error.
    //
    // This used to return early and send nothing, which meant every real host
    // navigating /play/host -> /game/<code> landed on a permanently blank
    // lobby: that route opens a FRESH socket, so the old reasoning ("the
    // client keeps whatever it last had") had nothing to keep. Nothing covered
    // this case, which is why it shipped.
    describe("pre-deal lobby, before any round has started (#406)", () => {
      const lobby = () => {
        mockFlipGamesDb.getFlipGameState.mockResolvedValue(null);
        connect("p0", "p1");
      };

      it("still broadcasts room and player state", async () => {
        lobby();
        const game = flipGame();
        // Set explicitly (overriding lobby()/connect()'s own flipPlayers()
        // call) so the mock and this assertion share the exact same array
        // reference — calling flipPlayers() a second time would give
        // makePlayer's counter-based `name` default a different value even
        // with the same overridden `id`, and toMatchObject would fail on a
        // difference that has nothing to do with what this test checks.
        const players = flipPlayers();
        mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);

        await broadcastGameState("g1", game);

        expect(mockConnManager.sendToPlayer).toHaveBeenCalledTimes(2);
        const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
        expect(message).toMatchObject({ type: "game_state", game, players });
      });

      // Suppress the table, not the message — and `flip: null` must be a
      // first-class "no table yet", never a half-built one.
      it("sends flip as an explicit null rather than a partial table", async () => {
        lobby();

        await broadcastGameState("g1", flipGame());

        const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
        expect(message).toHaveProperty("flip");
        expect((message as { flip: unknown }).flip).toBeNull();
      });

      // The key must be present even when null: the client narrows on its
      // presence, so an absent one would be read as a wire-game message.
      it("keeps the flip key present so the client narrows correctly", async () => {
        lobby();

        await broadcastGameState("g1", flipGame());

        const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
        expect("flip" in (message as object)).toBe(true);
        expect(message).not.toHaveProperty("wires");
      });

      it("reaches every seat in the lobby, not just the host", async () => {
        lobby();

        await broadcastGameState("g1", flipGame());

        const recipients = mockConnManager.sendToPlayer.mock.calls.map((c) => c[1]);
        expect(recipients).toEqual(["p0", "p1"]);
      });

      it("touches no wire-game tables and reads no round history", async () => {
        lobby();

        await broadcastGameState("g1", flipGame());

        expect(mockWiresDb.getWiresByGameId).not.toHaveBeenCalled();
        // No table means there can be no history either — don't query for it.
        expect(mockFlipGamesDb.getFlipRoundScores).not.toHaveBeenCalled();
      });
    });

    // #394 (Contract C4) — the deadline computation and the timer that backs
    // it. broadcastFlipGameState is the single chokepoint every Flip
    // broadcast (a real action, a reconnect, a join) goes through, so this
    // is where "reset on every broadcast" actually lives.
    describe("turn timeout (#394)", () => {
      it("sets turnDeadline and arms the timer for a live turn", async () => {
        mockGamesDb.getGameCreatedVia.mockResolvedValue("lobby");
        mockFlipGamesDb.getFlipGameState.mockResolvedValue(
          buildFlipGameState({ players: twoSeats }), // round-in-progress, has a turnPlayerId by default
        );
        connect("p0", "p1");

        const before = Date.now();
        await broadcastGameState("g1", flipGame());
        const after = Date.now();

        expect(mockScheduleFlipTurnTimeout).toHaveBeenCalledTimes(1);
        const [gameId, delayMs] = mockScheduleFlipTurnTimeout.mock.calls[0];
        expect(gameId).toBe("g1");
        expect(delayMs).toBe(45_000); // FLIP_TURN_TIMEOUT_MS for a lobby-created game
        expect(mockCancelFlipTurnTimeout).not.toHaveBeenCalled();

        const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
        const turnDeadline = (message as { flip: { turnDeadline: number | null } }).flip.turnDeadline;
        expect(turnDeadline).not.toBeNull();
        expect(turnDeadline!).toBeGreaterThanOrEqual(before + 45_000);
        expect(turnDeadline!).toBeLessThanOrEqual(after + 45_000);
      });

      it("uses the dev duration for a dev-seeded game — longer, not exempt", async () => {
        mockGamesDb.getGameCreatedVia.mockResolvedValue("dev_seed");
        mockFlipGamesDb.getFlipGameState.mockResolvedValue(
          buildFlipGameState({ players: twoSeats }),
        );
        connect("p0", "p1");

        await broadcastGameState("g1", flipGame());

        const [, delayMs] = mockScheduleFlipTurnTimeout.mock.calls[0];
        expect(delayMs).toBe(600_000); // FLIP_DEV_TURN_TIMEOUT_MS default — longer, still a real timeout
        expect(delayMs).toBeGreaterThan(45_000);

        const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
        expect((message as { flip: { turnDeadline: number | null } }).flip.turnDeadline).not.toBeNull();
      });

      it("sets turnDeadline to null and cancels the timer once no round is in progress", async () => {
        mockGamesDb.getGameCreatedVia.mockResolvedValue("lobby");
        mockFlipGamesDb.getFlipGameState.mockResolvedValue(
          buildFlipGameState({ players: twoSeats, phase: "round-over", turnPlayerId: undefined as unknown as string }),
        );
        connect("p0", "p1");

        await broadcastGameState("g1", flipGame());

        expect(mockCancelFlipTurnTimeout).toHaveBeenCalledWith("g1");
        expect(mockScheduleFlipTurnTimeout).not.toHaveBeenCalled();
        // Never even reads createdVia when there's nothing live to time —
        // no point picking a duration for a timer that won't be armed.
        expect(mockGamesDb.getGameCreatedVia).not.toHaveBeenCalled();

        const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
        expect((message as { flip: { turnDeadline: number | null } }).flip.turnDeadline).toBeNull();
      });

      it("cancels the timer when there is no table at all (lobby)", async () => {
        mockFlipGamesDb.getFlipGameState.mockResolvedValue(null);
        connect("p0", "p1");

        await broadcastGameState("g1", flipGame());

        expect(mockCancelFlipTurnTimeout).toHaveBeenCalledWith("g1");
        expect(mockScheduleFlipTurnTimeout).not.toHaveBeenCalled();
      });
    });
  });

  describe("broadcastGameState", () => {
    // #382 regression guard: the wire-game path must be untouched by the
    // gameType branch added above it.
    it("still queries wiresDb for a wire game", async () => {
      mockWiresDb.getWiresByGameId.mockResolvedValue([]);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue([]);
      mockTokensDb.getValidationTokensByGameId.mockResolvedValue([]);
      mockCandidatesDb.getWireCandidatesByGameId.mockResolvedValue([]);
      mockConnManager.getGameSockets.mockReturnValue(new Map([["p1", {}]]) as Map<string, WebSocket>);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([makePlayer({ id: "p1" })]);

      await broadcastGameState("g1", makeGame({ id: "g1", gameType: "wire-game" }));

      expect(mockWiresDb.getWiresByGameId).toHaveBeenCalledWith("g1");
      expect(mockFlipGamesDb.getFlipGameState).not.toHaveBeenCalled();
      const [, , message] = mockConnManager.sendToPlayer.mock.calls[0];
      expect(message).not.toHaveProperty("flip");
    });

    it("sends a per-player redacted game_state message to every connected socket", async () => {
      const game = makeGame({ id: "g1" });
      const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "5", status: "hidden" }),
      ];
      const infoTokens = [{ id: "t1", gameId: "g1", wireId: "w1", value: "3", placedAt: "" }];
      const validationTokens = [{ id: "v1", gameId: "g1", wireValue: "3", wireColor: "blue" as const, validatedAt: "" }];
      const gameSockets = new Map([["p1", {}], ["p2", {}]]) as Map<string, WebSocket>;

      mockWiresDb.getWiresByGameId.mockResolvedValue(wires);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue(infoTokens);
      mockTokensDb.getValidationTokensByGameId.mockResolvedValue(validationTokens);
      mockCandidatesDb.getWireCandidatesByGameId.mockResolvedValue([]);
      mockConnManager.getGameSockets.mockReturnValue(gameSockets);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);

      await broadcastGameState("g1", game);

      expect(mockWiresDb.getWiresByGameId).toHaveBeenCalledWith("g1");
      expect(mockConnManager.sendToPlayer).toHaveBeenCalledTimes(2);
      expect(mockConnManager.sendToPlayer).toHaveBeenCalledWith("g1", "p1", expect.objectContaining({
        type: "game_state", game, players, infoTokens, validationTokens, localPlayerId: "p1",
      }));
      expect(mockConnManager.sendToPlayer).toHaveBeenCalledWith("g1", "p2", expect.objectContaining({
        localPlayerId: "p2",
      }));
    });

    it("redacts each recipient's view of other players' hidden wires", async () => {
      const game = makeGame({ id: "g1" });
      const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "5", status: "hidden" }),
      ];
      const gameSockets = new Map([["p1", {}], ["p2", {}]]) as Map<string, WebSocket>;

      mockWiresDb.getWiresByGameId.mockResolvedValue(wires);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue([]);
      mockTokensDb.getValidationTokensByGameId.mockResolvedValue([]);
      mockCandidatesDb.getWireCandidatesByGameId.mockResolvedValue([]);
      mockConnManager.getGameSockets.mockReturnValue(gameSockets);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);

      await broadcastGameState("g1", game);

      const calls = mockConnManager.sendToPlayer.mock.calls;
      const p1Message = calls.find(c => c[1] === "p1")![2] as { wires: { id: string; value: string | null }[] };
      const p2Message = calls.find(c => c[1] === "p2")![2] as { wires: { id: string; value: string | null }[] };

      expect(p1Message.wires.find(w => w.id === "w1")!.value).toBe("3"); // own wire
      expect(p1Message.wires.find(w => w.id === "w2")!.value).toBeNull(); // other's redacted
      expect(p2Message.wires.find(w => w.id === "w2")!.value).toBe("5"); // own wire
      expect(p2Message.wires.find(w => w.id === "w1")!.value).toBeNull(); // other's redacted
    });

    it("sends nothing when no sockets are connected for the game", async () => {
      mockWiresDb.getWiresByGameId.mockResolvedValue([]);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue([]);
      mockTokensDb.getValidationTokensByGameId.mockResolvedValue([]);
      mockCandidatesDb.getWireCandidatesByGameId.mockResolvedValue([]);
      mockConnManager.getGameSockets.mockReturnValue(new Map());
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([]);

      await broadcastGameState("g1", makeGame({ id: "g1" }));

      expect(mockConnManager.sendToPlayer).not.toHaveBeenCalled();
    });
  });
});
