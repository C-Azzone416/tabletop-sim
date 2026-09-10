"use client";

import { useCallback, useReducer } from "react";
import type {
  Game,
  Player,
  Wire,
  InfoToken,
  ValidationToken,
  ServerMessage,
} from "@tabletop/shared";
import type { FlipTableView } from "../components/flip/flip-view-types";

export interface GameState {
  game: Game | null;
  localPlayer: Player | null;
  players: Player[];
  wires: Wire[];
  infoTokens: InfoToken[];
  validationTokens: ValidationToken[];
  /**
   * Flip's table state (#382/#383) — set from `game_state`'s `flip` field.
   * `@tabletop/shared` doesn't declare that field on the `game_state`
   * ServerMessage variant yet (#382 is landing it), so it's read via
   * `readFlipView` below rather than the message's own type. Wire games
   * never set this; it stays null for them.
   */
  flip: FlipTableView | null;
  lastTurnResult: Extract<ServerMessage, { type: "turn_result" }> | null;
  pendingDualCut: Extract<ServerMessage, { type: "dual_cut_proposed" }> | null;
  pendingDualCutCorrect: Extract<ServerMessage, { type: "dual_cut_correct" }> | null;
  gameOverReason: string | null;
  error: string | null;
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
};

/**
 * Reads `game_state`'s `flip` field defensively — see the `flip` field's
 * doc comment on `GameState` above for why this isn't just `msg.flip`.
 * Once #382 merges and `@tabletop/shared` declares the field, this
 * collapses to `(msg as Extract<ServerMessage, {type:"game_state"}>).flip
 * ?? null`.
 */
function readFlipView(msg: ServerMessage & { type: "game_state" }): FlipTableView | null {
  const flip = (msg as unknown as { flip?: FlipTableView }).flip;
  return flip ?? null;
}

type Action =
  | { type: "SET_ERROR"; message: string }
  | { type: "CLEAR_ERROR" }
  | { type: "SERVER_MESSAGE"; message: ServerMessage }
  | { type: "RESET" };

function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "SET_ERROR":
      return { ...state, error: action.message };
    case "CLEAR_ERROR":
      return { ...state, error: null };
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
      };

    case "joined_game":
      return {
        ...state,
        game: msg.game,
        localPlayer: msg.player,
        players: msg.players,
        error: null,
      };

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

      // #382 — game_state is now a union: the Flip variant carries a `flip`
      // table and no wires/tokens/candidates at all. Narrowing on `flip`
      // keeps the wire-game branch below exactly as it was.
      //
      // This is the minimum needed to keep the client compiling against the
      // new payload; consuming `msg.flip` into render state is #383
      // (daring-bobcat). Deliberately left out here rather than half-done,
      // so there is nothing to unpick when that lands.
      if (msg.flip) {
        return { ...state, game: msg.game, localPlayer, players: msg.players };
      }

      return {
        ...state,
        game: msg.game,
        localPlayer,
        players: msg.players,
        // Flip's game_state branch (#382) omits these entirely rather than
        // sending empty arrays — defensive fallback below either way.
        wires: msg.wires ?? [],
        infoTokens: msg.infoTokens ?? [],
        validationTokens: msg.validationTokens ?? [],
        flip: readFlipView(msg),
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

  return { state, handleMessage, setError, clearError, reset };
}
