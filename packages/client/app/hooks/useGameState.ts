"use client";

import { useCallback, useReducer } from "react";
import type {
  Game,
  Player,
  Wire,
  InfoToken,
  ValidationToken,
  ServerMessage,
  FlipTableView,
  LobbyConfigValue,
} from "@tabletop/shared";

export interface GameState {
  game: Game | null;
  localPlayer: Player | null;
  players: Player[];
  wires: Wire[];
  infoTokens: InfoToken[];
  validationTokens: ValidationToken[];
  /** Flip's table state (#382/#383), set from game_state's `flip` field. Null for Wire games. */
  flip: FlipTableView | null;
  lastTurnResult: Extract<ServerMessage, { type: "turn_result" }> | null;
  pendingDualCut: Extract<ServerMessage, { type: "dual_cut_proposed" }> | null;
  pendingDualCutCorrect: Extract<ServerMessage, { type: "dual_cut_correct" }> | null;
  gameOverReason: string | null;
  error: string | null;
  /**
   * #451 — the host left or disconnected past the grace window; the room
   * no longer exists server-side. Set from `room_closed`, checked ahead of
   * every phase branch in GameClient (it applies in every phase and every
   * game — not per-game, unlike player_left's per-game handling in
   * #432/#434). A leaving client never receives its own room_closed
   * (deregistered before the broadcast — see message-handler.ts), so this
   * only ever fires for the players who stayed behind.
   */
  roomClosedReason: string | null;
  /**
   * #432 — a non-host mid-game departure that ended the MISSION rather
   * than the room (Wire Game's `gameEnded: true` on `player_left`; Flip's
   * non-host leave never sets this — it continues instead, or produces
   * `room_closed` below its floor, already covered by `roomClosedReason`
   * above). Set only when `gameEnded` is true; a normal lobby-phase
   * departure (`gameEnded: false`) never touches this field. Cleared by an
   * explicit dismiss, same "checked ahead of the waiting/lobby branch,
   * explicit button, no auto-navigate" idiom `roomClosedReason` established
   * — the room survives here, so dismissing reveals the Lobby underneath
   * rather than routing anywhere.
   */
  missionEndedReason: string | null;
  /**
   * #448 — player ids the server has told us are inside #446's disconnect
   * grace window right now (armed by `player_reconnecting`, cleared by
   * `player_reconnected` or, belt-and-suspenders, `player_left`). They have
   * NOT left — this is purely "give them a moment" information, not a
   * correctness signal; nothing about turns, scoring, or the roster depends
   * on it. GameClient/SeatRail/PlayerRack decide whether and when to
   * actually SHOW an indicator for an id in here (see the separate
   * display-delay hook) — this set is the raw, undelayed truth.
   *
   * #478 — `room_closed` deliberately does NOT clear this. Once the room
   * closes the client routes away without reconciling anything else in
   * GameState either (players/wires/game are all left stale too), so
   * there's nothing left for a per-player flag to stay correct for.
   */
  reconnectingPlayerIds: readonly string[];
  /**
   * #329 — the captain's current lobby config pick, replicated so every
   * player sees it live (not just the captain). Null until the captain's
   * own client has had a round trip to send one — genuinely "not picked
   * yet", not a default this client should guess at; Lobby.tsx renders
   * nothing for a non-captain until this is non-null rather than showing a
   * value that might not match the captain's real selection (the exact
   * "wrong information to everyone but one person" problem #329 exists to
   * fix). Untouched by `room_closed`/`player_left` for the same reason
   * `reconnectingPlayerIds` is — nothing reads it once those fire either.
   */
  lobbyConfig: LobbyConfigValue | null;
}

const initialState: GameState = {
  game: null,
  localPlayer: null,
  players: [],
  wires: [],
  infoTokens: [],
  validationTokens: [],
  flip: null,
  lastTurnResult: null,
  pendingDualCut: null,
  pendingDualCutCorrect: null,
  gameOverReason: null,
  error: null,
  roomClosedReason: null,
  missionEndedReason: null,
  reconnectingPlayerIds: [],
  lobbyConfig: null,
};

type Action =
  | { type: "SET_ERROR"; message: string }
  | { type: "CLEAR_ERROR" }
  | { type: "SERVER_MESSAGE"; message: ServerMessage }
  | { type: "DISMISS_MISSION_ENDED" }
  | { type: "RESET" };

function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "SET_ERROR":
      return { ...state, error: action.message };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    case "DISMISS_MISSION_ENDED":
      return { ...state, missionEndedReason: null };
    case "RESET":
      return initialState;
    case "SERVER_MESSAGE":
      return handleServerMessage(state, action.message);
  }
}

function handleServerMessage(state: GameState, msg: ServerMessage): GameState {
  switch (msg.type) {
    case "game_created":
      return {
        ...state,
        game: msg.game,
        localPlayer: msg.player,
        players: [msg.player],
        error: null,
        lobbyConfig: msg.lobbyConfig,
      };

    case "joined_game":
      return {
        ...state,
        game: msg.game,
        localPlayer: msg.player,
        players: msg.players,
        error: null,
        lobbyConfig: msg.lobbyConfig,
      };

    // #329 — the captain committed a new config value; replicate it for
    // everyone, including the captain's own client (which echoes back its
    // own update). Lobby.tsx keeps the captain's local edit state as the
    // source of truth for what the captain SEES while editing — this field
    // is what a non-captain reads, and what confirms the round trip
    // completed.
    case "lobby_config_updated":
      return { ...state, lobbyConfig: msg.config };

    case "player_joined":
      return {
        ...state,
        players: [...state.players, msg.player],
      };

    case "game_started":
      return {
        ...state,
        game: msg.game,
        players: msg.players,
        wires: msg.wires,
      };

    case "setup_complete":
      return {
        ...state,
        game: msg.game,
      };

    case "game_state": {
      const localPlayer =
        msg.players.find((p) => p.id === msg.localPlayerId) ??
        state.localPlayer;

      // #382 — game_state is a union: the Flip variant carries `flip` and no
      // wires/tokens/candidates at all (no wiresDb call is ever made for a
      // Flip game). Narrowing on `flip` keeps the wire-game branch exactly
      // as it was, and leaves wires/infoTokens/validationTokens untouched
      // (not zeroed) — nothing about Flip's payload implies the wire-game
      // fields changed, since a client only ever tracks one game.
      //
      // #406 — narrow on the KEY, not its truthiness. `flip` is null in the
      // Flip lobby, before the dealer starts the first round, and that is a
      // normal state; testing truthiness sent those messages down the
      // wire-game branch to read a `wires` field that isn't there.
      // `?? null` because the wire variant declares `flip?: undefined`, so the
      // `in` check narrows to both variants at the type level even though at
      // runtime a wire-game broadcast has no `flip` key at all and never
      // reaches here.
      // #329 (#505 QA finding) — a browser's second WebSocket connection
      // (#454's disconnect-then-reopen architecture) is what actually
      // renders GameClient, and the server treats it as a reconnect: it
      // gets game_state, never joined_game. Syncing lobbyConfig here too
      // (both branches below) is what makes a non-captain's real client
      // receive the captain's already-live pick — sending only from
      // joined_game left the connection that actually renders with nothing.
      if ("flip" in msg) {
        return { ...state, game: msg.game, localPlayer, players: msg.players, flip: msg.flip ?? null, lobbyConfig: msg.lobbyConfig };
      }

      return {
        ...state,
        game: msg.game,
        localPlayer,
        players: msg.players,
        wires: msg.wires,
        infoTokens: msg.infoTokens,
        validationTokens: msg.validationTokens,
        lobbyConfig: msg.lobbyConfig,
      };
    }

    case "dual_cut_proposed":
      return {
        ...state,
        pendingDualCut: msg,
      };

    case "dual_cut_correct":
      return {
        ...state,
        pendingDualCutCorrect: msg,
      };

    case "turn_result": {
      const updatedWires = state.wires.map((w) => {
        const updated = msg.updatedWires.find((uw) => uw.id === w.id);
        return updated ?? w;
      });
      return {
        ...state,
        game: msg.game,
        wires: updatedWires,
        lastTurnResult: msg,
        pendingDualCut: null,
        pendingDualCutCorrect: null,
      };
    }

    case "validation_complete":
      return {
        ...state,
        game: msg.game,
        validationTokens: [
          ...state.validationTokens,
          {
            id: crypto.randomUUID(),
            gameId: msg.game.id,
            wireValue: msg.wireValue,
            wireColor: msg.wireColor,
            validatedAt: new Date().toISOString(),
          },
        ],
      };

    case "wire_updated": {
      const wires = state.wires.map((w) =>
        w.id === msg.wire.id ? msg.wire : w
      );
      return { ...state, wires };
    }

    case "game_over":
      return {
        ...state,
        game: state.game
          ? { ...state.game, status: msg.result === "won" ? "won" : "lost" }
          : null,
        gameOverReason: msg.reason,
      };

    case "players_updated":
      return { ...state, players: msg.players };

    // #451 — a non-host departure (explicit leave or disconnect past the
    // grace window). Filters the roster only; what happens next (stay in
    // the lobby, end the game, continue play) is #432/#433/#434's call per
    // game, not this hook's.
    //
    // #432 — `gameEnded` rides this same message (see shared/src/types.ts's
    // doc comment on why) rather than a separate one. Only set
    // missionEndedReason when it's true; a normal continue (Flip, or Wire
    // in the lobby) must not touch it. Identical whether the departure was
    // a deliberate leave_game or a disconnect past the grace window — both
    // funnel through the same server-side path and produce the same
    // message, so no separate wiring is needed here for the disconnect case.
    case "player_left":
      return {
        ...state,
        players: state.players.filter((p) => p.id !== msg.playerId),
        missionEndedReason: msg.gameEnded
          ? `${msg.playerName} left. The mission has ended.`
          : state.missionEndedReason,
        // #448 — belt and suspenders: the grace window elapsing (this
        // message) should already have been preceded by nothing further to
        // clear, but a genuinely departed player must never be left marked
        // "reconnecting" by a stray race.
        reconnectingPlayerIds: state.reconnectingPlayerIds.filter((id) => id !== msg.playerId),
      };

    // #451 — the host left or disconnected. Every remaining client, in
    // every phase, routes to /play — see roomClosedReason's doc comment.
    // #478 — deliberately does not also clear reconnectingPlayerIds (or any
    // other field): nothing downstream reads any of this state once
    // roomClosedReason is set, so there's nothing to reconcile.
    case "room_closed":
      return { ...state, roomClosedReason: msg.reason };

    // #448 — purely informational (see reconnectingPlayerIds' own doc
    // comment): a disconnect just armed #446's grace timer for this
    // player. De-duplicated rather than pushed blindly — a flaky
    // connection could in principle disconnect more than once before
    // reconnecting, and this is a set of "who's currently out", not a log.
    case "player_reconnecting":
      return state.reconnectingPlayerIds.includes(msg.playerId)
        ? state
        : { ...state, reconnectingPlayerIds: [...state.reconnectingPlayerIds, msg.playerId] };

    case "player_reconnected":
      return {
        ...state,
        reconnectingPlayerIds: state.reconnectingPlayerIds.filter((id) => id !== msg.playerId),
      };

    case "error":
      return { ...state, error: msg.message };

    default:
      return state;
  }
}

export function useGameState() {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  const handleMessage = useCallback((message: ServerMessage) => {
    dispatch({ type: "SERVER_MESSAGE", message });
  }, []);

  const setError = useCallback((message: string) => {
    dispatch({ type: "SET_ERROR", message });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const dismissMissionEnded = useCallback(() => {
    dispatch({ type: "DISMISS_MISSION_ENDED" });
  }, []);

  return { state, handleMessage, setError, clearError, reset, dismissMissionEnded };
}
