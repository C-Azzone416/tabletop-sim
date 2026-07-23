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

export interface GameState {
  game: Game | null;
  localPlayer: Player | null;
  players: Player[];
  wires: Wire[];
  infoTokens: InfoToken[];
  validationTokens: ValidationToken[];
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
  lastTurnResult: null,
  pendingDualCut: null,
  pendingDualCutCorrect: null,
  gameOverReason: null,
  error: null,
};

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
      return {
        ...state,
        game: msg.game,
        localPlayer,
        players: msg.players,
        wires: msg.wires,
        infoTokens: msg.infoTokens,
        validationTokens: msg.validationTokens,
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
